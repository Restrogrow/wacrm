import { NextResponse } from 'next/server'

import { requireRole, toErrorResponse } from '@/lib/auth/account'
import { supabaseAdmin } from '@/lib/flows/admin-client'
import { checkRateLimit, rateLimitResponse } from '@/lib/rate-limit'
import { decrypt } from '@/lib/whatsapp/encryption'
import {
  codeFromErrorMessage,
  fetchSpend,
  fetchWabaBilling,
  groupFailures,
  isPaymentError,
  summarizeSpend,
  type SpendSummary,
  type WabaBilling,
} from '@/lib/whatsapp/spend'

// GET /api/whatsapp/spend?from=<ISO>&to=<ISO>&tz=<IANA zone>
//
// Admins and owners. Meta spend (pricing analytics), payment status,
// Business Account health, and what the account sent in the range
// (inbox / API messages and broadcasts) with failure reasons.

const MAX_RANGE_MS = 92 * 24 * 60 * 60 * 1000
const FAILURE_SAMPLE = 5000
/** 131042 = Meta could not charge the business's payment method. */
const PAYMENT_ERROR_CODE = 131042

/** Meta answers are cached briefly so reloading the page stays fast. */
const metaCache = new Map<string, { at: number; value: unknown }>()
const META_TTL_MS = 10 * 60 * 1000
async function cached<T>(key: string, load: () => Promise<T>): Promise<T> {
  const hit = metaCache.get(key)
  if (hit && Date.now() - hit.at < META_TTL_MS) return hit.value as T
  const value = await load()
  metaCache.set(key, { at: Date.now(), value })
  return value
}

export async function GET(request: Request) {
  try {
    const { userId, accountId } = await requireRole('admin')
    const limit = checkRateLimit(`spend:${userId}`, { limit: 30, windowMs: 60_000 })
    if (!limit.success) return rateLimitResponse(limit)

    const url = new URL(request.url)
    const from = new Date(url.searchParams.get('from') ?? '')
    const to = new Date(url.searchParams.get('to') ?? '')
    const tz = url.searchParams.get('tz') || 'Asia/Kolkata'
    const fresh = url.searchParams.get('refresh') === '1'
    if (Number.isNaN(from.getTime()) || Number.isNaN(to.getTime()) || to <= from) {
      return NextResponse.json({ error: 'Pick a valid date range.' }, { status: 400 })
    }
    if (to.getTime() - from.getTime() > MAX_RANGE_MS) {
      return NextResponse.json({ error: 'Pick a range of at most 92 days.' }, { status: 400 })
    }
    const fromIso = from.toISOString()
    const toIso = to.toISOString()

    const db = supabaseAdmin()
    const { data: config } = await db
      .from('whatsapp_config')
      .select('waba_id, phone_number_id, access_token')
      .eq('account_id', accountId)
      .maybeSingle()

    // ---- What the account sent (our database) ---------------------------
    const msgCount = (apply: (q: ReturnType<typeof messagesQuery>) => ReturnType<typeof messagesQuery>) =>
      apply(messagesQuery()).then(({ count }) => count ?? 0)
    function messagesQuery() {
      return db
        .from('messages')
        .select('id, conversations!inner(account_id)', { count: 'exact', head: true })
        .eq('conversations.account_id', accountId)
        .gte('created_at', fromIso)
        .lt('created_at', toIso)
    }
    const recipientCount = (status: string | null) => {
      let q = db
        .from('broadcast_recipients')
        .select('id, broadcasts!inner(account_id)', { count: 'exact', head: true })
        .eq('broadcasts.account_id', accountId)
        .gte('created_at', fromIso)
        .lt('created_at', toIso)
      if (status === 'delivered+') q = q.in('status', ['delivered', 'read', 'replied'])
      else if (status === 'read+') q = q.in('status', ['read', 'replied'])
      else if (status) q = q.eq('status', status)
      else q = q.neq('status', 'pending')
      return q.then(({ count }) => count ?? 0)
    }

    const outbound = ['agent', 'bot']
    const [
      chatSent,
      chatDelivered,
      chatRead,
      chatFailed,
      received,
      templatesSent,
      broadcastSent,
      broadcastDelivered,
      broadcastRead,
      broadcastFailed,
      failedMessages,
      failedRecipients,
      recentPaymentFailures,
    ] = await Promise.all([
      msgCount((q) => q.in('sender_type', outbound)),
      msgCount((q) => q.in('sender_type', outbound).in('status', ['delivered', 'read'])),
      msgCount((q) => q.in('sender_type', outbound).eq('status', 'read')),
      msgCount((q) => q.in('sender_type', outbound).eq('status', 'failed')),
      msgCount((q) => q.eq('sender_type', 'customer')),
      msgCount((q) => q.in('sender_type', outbound).eq('content_type', 'template')),
      recipientCount(null),
      recipientCount('delivered+'),
      recipientCount('read+'),
      recipientCount('failed'),
      db
        .from('messages')
        .select('error_code, conversations!inner(account_id)')
        .eq('conversations.account_id', accountId)
        .eq('status', 'failed')
        .gte('created_at', fromIso)
        .lt('created_at', toIso)
        .limit(FAILURE_SAMPLE)
        .then(({ data }) => (data ?? []).map((r) => (r.error_code as number | null) ?? null)),
      db
        .from('broadcast_recipients')
        .select('error_message, broadcasts!inner(account_id)')
        .eq('broadcasts.account_id', accountId)
        .eq('status', 'failed')
        .gte('created_at', fromIso)
        .lt('created_at', toIso)
        .limit(FAILURE_SAMPLE)
        .then(({ data }) => (data ?? []).map((r) => codeFromErrorMessage(r.error_message as string | null))),
      // Payment failures in the last 7 days, whatever range is shown.
      db
        .from('messages')
        .select('id, conversations!inner(account_id)', { count: 'exact', head: true })
        .eq('conversations.account_id', accountId)
        .eq('error_code', PAYMENT_ERROR_CODE)
        .gte('created_at', new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString())
        .then(({ count }) => count ?? 0),
    ])

    const sent = {
      chatSent,
      chatDelivered,
      chatRead,
      chatFailed,
      received,
      templatesSent,
      broadcastSent,
      broadcastDelivered,
      broadcastRead,
      broadcastFailed,
      totalSent: chatSent + broadcastSent,
      totalFailed: chatFailed + broadcastFailed,
    }
    const failures = groupFailures([...failedMessages, ...failedRecipients])

    // ---- Meta ------------------------------------------------------------
    if (!config?.waba_id || !config.access_token) {
      return NextResponse.json({
        connected: false,
        sent,
        failures,
        payment: { status: recentPaymentFailures > 0 ? 'problem' : 'unknown', recentPaymentFailures, problems: [] },
      })
    }

    const token = decrypt(config.access_token as string)
    const wabaId = config.waba_id as string
    const fromSec = Math.floor(from.getTime() / 1000)
    const toSec = Math.floor(to.getTime() / 1000)

    let waba: WabaBilling | null = null
    let wabaError: string | null = null
    let spend: (SpendSummary & { source: 'pricing' | 'conversation' }) | null = null
    let spendError: string | null = null
    await Promise.all([
      (fresh ? fetchWabaBilling(wabaId, token) : cached(`waba:${wabaId}`, () => fetchWabaBilling(wabaId, token)))
        .then((w) => {
          waba = w
          if (fresh) metaCache.set(`waba:${wabaId}`, { at: Date.now(), value: w })
        })
        .catch((err) => {
          wabaError = err instanceof Error ? err.message : String(err)
        }),
      (async () => {
        const key = `spend:${wabaId}:${fromSec}:${toSec}:${tz}`
        if (fresh) metaCache.delete(key)
        const { points, source } = await cached(key, () => fetchSpend(wabaId, token, fromSec, toSec))
        spend = { ...summarizeSpend(points, tz), source }
      })().catch((err) => {
        spendError = err instanceof Error ? err.message : String(err)
      }),
    ])

    const w = waba as WabaBilling | null
    const paymentHealthErrors = (w?.healthErrors ?? []).filter(isPaymentError)
    const problems = [
      ...paymentHealthErrors.map((e) => e.description),
      ...(recentPaymentFailures > 0
        ? [
            `${recentPaymentFailures} message${recentPaymentFailures === 1 ? '' : 's'} failed in the last 7 days because Meta could not charge your payment method (error 131042).`,
          ]
        : []),
      ...(w?.fundingLinked === false ? ['No payment method is added to your WhatsApp Business Account.'] : []),
    ]
    const paymentStatus = problems.length > 0 ? 'problem' : w?.fundingLinked ? 'ok' : 'unknown'

    return NextResponse.json({
      connected: true,
      wabaId,
      wabaName: w?.name ?? null,
      currency: w?.currency ?? null,
      wabaError,
      payment: {
        status: paymentStatus,
        fundingLinked: w?.fundingLinked ?? null,
        recentPaymentFailures,
        problems,
      },
      health: {
        canSend: w?.canSend ?? null,
        errors: (w?.healthErrors ?? []).filter((e) => !isPaymentError(e)),
      },
      spend,
      spendError,
      sent,
      failures,
      checkedAt: new Date().toISOString(),
    })
  } catch (err) {
    return toErrorResponse(err)
  }
}
