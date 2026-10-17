// ============================================================
// /api/scheduled-messages
//
//   GET  ?conversation_id=  → pending + recently failed scheduled messages
//                             for that chat (any member).
//   POST { conversation_id, scheduled_at, text }
//        → schedule a text message (agents and above). The every-minute
//          cron sends it. Replies include a warning when the customer's
//          24-hour window will probably be closed by then.
// ============================================================

import { NextResponse } from 'next/server'

import { getCurrentAccount, requireRole, toErrorResponse } from '@/lib/auth/account'
import { accountCanSend } from '@/lib/billing/server'
import { PLAN_EXPIRED_MESSAGE } from '@/lib/billing/plans'
import { supabaseAdmin } from '@/lib/flows/admin-client'
import { checkRateLimit, rateLimitResponse, RATE_LIMITS } from '@/lib/rate-limit'
import { validateSchedule, windowWarning } from '@/lib/scheduled-messages/core'

const MAX_PENDING_PER_CHAT = 20

async function lastCustomerMessageAt(conversationId: string): Promise<string | null> {
  const { data } = await supabaseAdmin()
    .from('messages')
    .select('created_at')
    .eq('conversation_id', conversationId)
    .eq('sender_type', 'customer')
    .order('created_at', { ascending: false })
    .limit(1)
    .maybeSingle()
  return data?.created_at ?? null
}

export async function GET(request: Request) {
  try {
    const ctx = await getCurrentAccount()
    const conversationId = new URL(request.url).searchParams.get('conversation_id')
    if (!conversationId) return NextResponse.json({ error: 'conversation_id is required' }, { status: 400 })

    const since = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString()
    const { data, error } = await supabaseAdmin()
      .from('scheduled_messages')
      .select('id, content_text, scheduled_at, status, error_message, created_at')
      .eq('account_id', ctx.accountId)
      .eq('conversation_id', conversationId)
      .or(`status.in.(pending,sending),and(status.eq.failed,updated_at.gte.${since})`)
      .order('scheduled_at', { ascending: true })
      .limit(50)
    // Table missing (migration 069 not applied): behave as "feature unavailable".
    if (error) return NextResponse.json({ available: false, messages: [] })
    return NextResponse.json({ available: true, messages: data ?? [] })
  } catch (err) {
    return toErrorResponse(err)
  }
}

export async function POST(request: Request) {
  try {
    const ctx = await requireRole('agent')
    const limit = checkRateLimit(`send:${ctx.userId}`, RATE_LIMITS.send)
    if (!limit.success) return rateLimitResponse(limit)

    const body = ((await request.json().catch(() => null)) ?? {}) as Record<string, unknown>
    if (typeof body.conversation_id !== 'string') {
      return NextResponse.json({ error: 'conversation_id is required' }, { status: 400 })
    }

    const check = validateSchedule({ scheduledAt: body.scheduled_at, text: body.text })
    if (!check.ok) return NextResponse.json({ error: check.error }, { status: 400 })

    if (!(await accountCanSend(ctx.accountId))) {
      return NextResponse.json({ error: PLAN_EXPIRED_MESSAGE, code: 'plan_expired' }, { status: 402 })
    }

    const db = supabaseAdmin()
    const { data: conv } = await db
      .from('conversations')
      .select('id')
      .eq('id', body.conversation_id)
      .eq('account_id', ctx.accountId)
      .maybeSingle()
    if (!conv) return NextResponse.json({ error: 'Conversation not found' }, { status: 404 })

    const { count } = await db
      .from('scheduled_messages')
      .select('id', { count: 'exact', head: true })
      .eq('conversation_id', conv.id)
      .eq('status', 'pending')
    if ((count ?? 0) >= MAX_PENDING_PER_CHAT) {
      return NextResponse.json(
        { error: `This chat already has ${MAX_PENDING_PER_CHAT} scheduled messages. Cancel one first.` },
        { status: 400 },
      )
    }

    const { data: row, error } = await db
      .from('scheduled_messages')
      .insert({
        account_id: ctx.accountId,
        conversation_id: conv.id,
        content_text: (body.text as string).trim(),
        scheduled_at: check.at.toISOString(),
        created_by: ctx.userId,
      })
      .select('id, content_text, scheduled_at, status, error_message, created_at')
      .single()
    if (error) {
      console.error('[api] scheduled message insert failed:', error.message)
      return NextResponse.json(
        { error: 'Scheduling is not available yet. Ask your admin to finish the latest database update.' },
        { status: 503 },
      )
    }

    const warning = windowWarning(await lastCustomerMessageAt(conv.id), check.at)
    return NextResponse.json({ message: row, warning }, { status: 201 })
  } catch (err) {
    return toErrorResponse(err)
  }
}
