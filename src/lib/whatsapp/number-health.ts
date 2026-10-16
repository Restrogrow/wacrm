// ============================================================
// WhatsApp number health (migration 049).
//
// Reads the business number's quality rating, messaging limit,
// display-name status, send health and calling status from Meta,
// stores them in whatsapp_number_health, and emails the owner when the
// number becomes at risk (quality drop, limited / blocked, name
// declined). Runs daily per account from the automations cron
// (processDueNumberHealth) and on demand ("Check now").
//
// Meta fields: whatsapp_business_manager_messaging_limit replaced the
// deprecated messaging_limit_tier; both are tried so older and newer
// API versions work.
// ============================================================

import type { SupabaseClient } from '@supabase/supabase-js'

import { supabaseAdmin } from '@/lib/flows/admin-client'
import { decrypt } from '@/lib/whatsapp/encryption'
import { isEmailConfigured, sendEmail } from '@/lib/email/mailer'
import { SITE_URL } from '@/lib/seo'

const GRAPH = 'https://graph.facebook.com/v21.0'
const CHECK_EVERY_MS = 24 * 60 * 60 * 1000
const BATCH = 10

export interface NumberHealth {
  account_id: string
  phone_number_id: string | null
  display_phone: string | null
  verified_name: string | null
  quality_rating: string | null
  messaging_limit: string | null
  name_status: string | null
  number_status: string | null
  can_send: string | null
  health_errors: { error_code?: number; error_description?: string; possible_solution?: string }[] | null
  calling_status: string | null
  check_error: string | null
  checked_at: string | null
}

export type HealthLevel = 'ok' | 'warning' | 'critical' | 'unknown'

/** Overall level and the reasons behind it, for banners and alerts. */
export function assessHealth(h: Pick<NumberHealth, 'quality_rating' | 'can_send' | 'name_status' | 'number_status'>): {
  level: HealthLevel
  reasons: string[]
} {
  const reasons: string[] = []
  let level: HealthLevel = 'ok'
  const bump = (to: HealthLevel) => {
    const rank = { unknown: 0, ok: 1, warning: 2, critical: 3 }
    if (rank[to] > rank[level]) level = to
  }

  const quality = (h.quality_rating ?? '').toUpperCase()
  if (quality === 'RED') {
    bump('critical')
    reasons.push('Quality rating is low (red). Meta may limit or block this number soon.')
  } else if (quality === 'YELLOW') {
    bump('warning')
    reasons.push('Quality rating is medium (yellow). Customers are blocking or reporting some messages.')
  }

  const send = (h.can_send ?? '').toUpperCase()
  if (send === 'BLOCKED') {
    bump('critical')
    reasons.push('Meta has blocked this number from sending messages.')
  } else if (send === 'LIMITED') {
    bump('warning')
    reasons.push('Meta has limited what this number can send.')
  }

  const status = (h.number_status ?? '').toUpperCase()
  if (['FLAGGED', 'RESTRICTED', 'BANNED', 'RATE_LIMITED'].includes(status)) {
    bump(status === 'FLAGGED' ? 'warning' : 'critical')
    reasons.push(`Meta reports the number as ${status.toLowerCase().replace('_', ' ')}.`)
  }

  const name = (h.name_status ?? '').toUpperCase()
  if (name === 'DECLINED' || name === 'EXPIRED') {
    bump('warning')
    reasons.push(`The display name was ${name.toLowerCase()} by Meta. Update it in WhatsApp Manager.`)
  }

  if (!quality && !send && !status) return { level: 'unknown', reasons }
  return { level, reasons }
}

/** "TIER_2K" → "2,000 customers a day". */
export function describeLimit(limit: string | null): string {
  if (!limit) return 'Unknown'
  const v = limit.toUpperCase().replace(/^TIER_/, '')
  if (v === 'UNLIMITED') return 'Unlimited'
  const m = v.match(/^(\d+)(K)?$/)
  if (!m) return limit
  const n = Number(m[1]) * (m[2] ? 1000 : 1)
  return `${n.toLocaleString('en-IN')} customers a day`
}

/** True when the limit meets Meta's 2,000 minimum for calling. */
export function limitAllowsCalling(limit: string | null): boolean {
  if (!limit) return false
  const v = limit.toUpperCase().replace(/^TIER_/, '')
  if (v === 'UNLIMITED') return true
  const m = v.match(/^(\d+)(K)?$/)
  return !!m && Number(m[1]) * (m[2] ? 1000 : 1) >= 2000
}

async function graphGet(path: string, token: string): Promise<Record<string, unknown>> {
  const res = await fetch(`${GRAPH}/${path}`, { headers: { Authorization: `Bearer ${token}` } })
  const json = (await res.json().catch(() => ({}))) as Record<string, unknown> & { error?: { message?: string } }
  if (!res.ok || json.error) throw new Error(json.error?.message ?? `WhatsApp returned ${res.status}`)
  return json
}

/** Read everything from Meta. Optional fields fail soft. */
export async function fetchNumberHealthFromMeta(phoneNumberId: string, token: string) {
  const base = 'display_phone_number,verified_name,quality_rating,name_status,status'
  let info: Record<string, unknown>
  let limit: string | null = null
  try {
    info = await graphGet(`${phoneNumberId}?fields=${base},whatsapp_business_manager_messaging_limit`, token)
    limit = (info.whatsapp_business_manager_messaging_limit as string) ?? null
  } catch {
    try {
      info = await graphGet(`${phoneNumberId}?fields=${base},messaging_limit_tier`, token)
      limit = (info.messaging_limit_tier as string) ?? null
    } catch {
      info = await graphGet(`${phoneNumberId}?fields=${base}`, token)
    }
  }

  let canSend: string | null = null
  let healthErrors: NumberHealth['health_errors'] = null
  try {
    const h = (await graphGet(`${phoneNumberId}?fields=health_status`, token)).health_status as
      | { can_send_message?: string; entities?: { errors?: NumberHealth['health_errors'] }[] }
      | undefined
    canSend = h?.can_send_message ?? null
    // 138024 / 138025 are about SIP calling, which Repeat Grow doesn't
    // use (calls run over WebRTC in the browser), so they only confuse.
    const errs = ((h?.entities ?? []).flatMap((e) => e.errors ?? []) as NonNullable<NumberHealth['health_errors']>).filter(
      (e) => e.error_code !== 138024 && e.error_code !== 138025,
    )
    healthErrors = errs.length ? errs : null
  } catch {
    // health_status not available for this number / API version.
  }

  let calling: string | null = null
  try {
    const s = (await graphGet(`${phoneNumberId}/settings`, token)).calling as { status?: string } | undefined
    calling = s?.status === 'ENABLED' ? 'ENABLED' : 'DISABLED'
  } catch (err) {
    calling = /calling (is )?not (enabled|available)|not eligible/i.test(err instanceof Error ? err.message : '')
      ? 'NOT_ALLOWED'
      : null
  }

  return {
    display_phone: (info.display_phone_number as string) ?? null,
    verified_name: (info.verified_name as string) ?? null,
    quality_rating: (info.quality_rating as string) ?? null,
    messaging_limit: limit,
    name_status: (info.name_status as string) ?? null,
    number_status: (info.status as string) ?? null,
    can_send: canSend,
    health_errors: healthErrors,
    calling_status: calling,
  }
}

/** Check one account now, store it, alert if it became at risk. */
export async function refreshNumberHealth(accountId: string, db: SupabaseClient = supabaseAdmin()): Promise<NumberHealth | null> {
  const { data: config } = await db
    .from('whatsapp_config')
    .select('phone_number_id, access_token')
    .eq('account_id', accountId)
    .maybeSingle()
  if (!config?.phone_number_id || !config.access_token) return null

  const now = new Date().toISOString()
  let row: Record<string, unknown>
  try {
    const fresh = await fetchNumberHealthFromMeta(config.phone_number_id, decrypt(config.access_token))
    row = { account_id: accountId, phone_number_id: config.phone_number_id, ...fresh, check_error: null, checked_at: now, updated_at: now }
  } catch (err) {
    row = {
      account_id: accountId,
      phone_number_id: config.phone_number_id,
      check_error: err instanceof Error ? err.message.slice(0, 500) : 'Check failed',
      checked_at: now,
      updated_at: now,
    }
  }

  const { data: previous } = await db
    .from('whatsapp_number_health')
    .select('last_alert_key, quality_rating, can_send')
    .eq('account_id', accountId)
    .maybeSingle()

  const { data: saved, error } = await db
    .from('whatsapp_number_health')
    .upsert(row, { onConflict: 'account_id' })
    .select('*')
    .single()
  if (error) {
    console.warn('[number-health] not saved:', error.message)
    return null
  }

  await maybeAlertOwner(db, saved as NumberHealth, previous?.last_alert_key ?? null)
  return saved as NumberHealth
}

async function maybeAlertOwner(db: SupabaseClient, health: NumberHealth, lastAlertKey: string | null) {
  const { level, reasons } = assessHealth(health)
  const key = level === 'ok' || level === 'unknown' ? null : `${level}:${health.quality_rating}:${health.can_send}:${health.number_status}:${health.name_status}`

  // Back to healthy: clear so a future problem alerts again.
  if (!key) {
    if (lastAlertKey) await db.from('whatsapp_number_health').update({ last_alert_key: null }).eq('account_id', health.account_id)
    return
  }
  if (key === lastAlertKey) return

  await db
    .from('whatsapp_number_health')
    .update({ last_alert_key: key, last_alert_at: new Date().toISOString() })
    .eq('account_id', health.account_id)

  if (!isEmailConfigured()) return
  const { data: account } = await db.from('accounts').select('name, owner_user_id').eq('id', health.account_id).maybeSingle()
  if (!account) return
  const { data: owner } = await db.from('profiles').select('email').eq('user_id', account.owner_user_id).maybeSingle()
  if (!owner?.email) return

  const lines = [
    `Your WhatsApp number ${health.display_phone ?? ''} for ${account.name} needs attention:`,
    ...reasons.map((r) => `• ${r}`),
    '',
    'What helps: only message customers who opted in, keep templates relevant, honour STOP requests, and slow down broadcasts until quality recovers.',
    '',
    `See the details in Repeat Grow: ${SITE_URL}/settings?tab=whatsapp`,
  ]
  try {
    await sendEmail({
      to: [owner.email],
      subject: `${level === 'critical' ? 'Action needed' : 'Heads up'}: your WhatsApp number's health`,
      text: lines.join('\n'),
      html: `<div style="font-family:Arial,sans-serif;font-size:14px;line-height:1.6;white-space:pre-line">${lines
        .join('\n')
        .replace(/[&<>]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;' })[c]!)}</div>`,
    })
  } catch (err) {
    console.warn('[number-health] alert email not sent:', err instanceof Error ? err.message : err)
  }
}

/**
 * Cron task: check accounts whose health is missing or older than a
 * day, a few per run. Returns how many were checked.
 */
export async function processDueNumberHealth(): Promise<number> {
  const db = supabaseAdmin()
  const { data: configs, error } = await db.from('whatsapp_config').select('account_id').not('access_token', 'is', null)
  if (error) throw new Error(error.message)
  const accountIds = (configs ?? []).map((c) => c.account_id as string).filter(Boolean)
  if (accountIds.length === 0) return 0

  const { data: rows, error: healthError } = await db
    .from('whatsapp_number_health')
    .select('account_id, checked_at')
    .in('account_id', accountIds)
  // Migration 049 not run yet — skip quietly.
  if (healthError) return 0

  const checked = new Map((rows ?? []).map((r) => [r.account_id as string, r.checked_at as string | null]))
  const cutoff = Date.now() - CHECK_EVERY_MS
  const due = accountIds
    .filter((id) => {
      const at = checked.get(id)
      return !at || new Date(at).getTime() < cutoff
    })
    .slice(0, BATCH)

  for (const id of due) {
    await refreshNumberHealth(id, db)
  }
  return due.length
}
