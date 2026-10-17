// ============================================================
// First-response SLA alerts — run from /api/automations/cron.
//
// For every account with SLA enabled:
//   1. clear breach rows whose chat got a human reply or was closed,
//   2. find open chats where the customer has waited longer than the
//      target with no human ('agent') reply (bots do not count),
//   3. for each new breach, record it in `conversation_sla` and
//      notify the assigned agent (or every owner/admin if unassigned).
//
// One alert per waiting episode: a row for the same `waiting_since`
// is never notified twice. A later customer message after an agent
// reply starts a new episode.
// ============================================================

import { fireTeamAlert } from '@/lib/alerts/server'
import { supabaseAdmin } from '@/lib/automations/admin-client'
import { isSlaBreached, rowToSettings } from './hours'

const MAX_ACCOUNTS_PER_RUN = 200
const MAX_CANDIDATES_PER_ACCOUNT = 100

interface WaitingRow {
  conversation_id: string
  contact_id: string | null
  assigned_agent_id: string | null
  waiting_since: string
}

/** Returns how many breach alerts were created. */
export async function processSlaAlerts(): Promise<number> {
  const db = supabaseAdmin()
  const { data: accounts, error } = await db
    .from('business_hours_settings')
    .select('*')
    .eq('sla_enabled', true)
    .limit(MAX_ACCOUNTS_PER_RUN)
  if (error) {
    // Migration 066 not applied yet: nothing to do.
    return 0
  }

  let created = 0
  for (const row of accounts ?? []) {
    try {
      created += await processAccount(row as Record<string, unknown>)
    } catch (err) {
      console.error('[sla] account failed:', err instanceof Error ? err.message : err)
    }
  }
  return created
}

async function processAccount(row: Record<string, unknown>): Promise<number> {
  const db = supabaseAdmin()
  const accountId = row.account_id as string
  const settings = rowToSettings(row)
  const now = new Date()

  await db.rpc('sla_clear_resolved', { p_account_id: accountId })

  // Wall-clock minutes always >= business minutes, so this is a safe
  // lower bound; the precise check happens below.
  const olderThan = new Date(now.getTime() - settings.sla_first_response_minutes * 60_000)
  const { data: waiting, error } = await db.rpc('sla_waiting_conversations', {
    p_account_id: accountId,
    p_older_than: olderThan.toISOString(),
    p_limit: MAX_CANDIDATES_PER_ACCOUNT,
  })
  if (error || !waiting || waiting.length === 0) return 0
  const rows = waiting as WaitingRow[]

  const { data: existing } = await db
    .from('conversation_sla')
    .select('conversation_id, waiting_since')
    .in(
      'conversation_id',
      rows.map((r) => r.conversation_id),
    )
  const alreadyAlerted = new Map<string, number>(
    (existing ?? []).map((e) => [e.conversation_id as string, new Date(e.waiting_since as string).getTime()]),
  )

  const breached = rows.filter((r) => {
    const since = new Date(r.waiting_since)
    if (alreadyAlerted.get(r.conversation_id) === since.getTime()) return false
    return isSlaBreached(settings, since, now)
  })
  if (breached.length === 0) return 0

  // Who to tell when a chat is unassigned: the account's owners and admins.
  let admins: string[] | null = null
  const adminIds = async (): Promise<string[]> => {
    if (admins) return admins
    const { data } = await db
      .from('profiles')
      .select('user_id')
      .eq('account_id', accountId)
      .in('account_role', ['owner', 'admin'])
    admins = (data ?? []).map((p) => p.user_id as string)
    return admins
  }

  const contactIds = breached.map((b) => b.contact_id).filter((id): id is string => !!id)
  const names = new Map<string, string>()
  if (contactIds.length > 0) {
    const { data: contacts } = await db
      .from('contacts')
      .select('id, name, phone')
      .in('id', contactIds)
    for (const c of contacts ?? []) {
      names.set(c.id as string, ((c.name as string) || (c.phone as string) || 'A customer').trim())
    }
  }

  const notifications: Record<string, unknown>[] = []
  let count = 0
  for (const b of breached) {
    const since = new Date(b.waiting_since)
    const { error: upErr } = await db.from('conversation_sla').upsert(
      {
        conversation_id: b.conversation_id,
        account_id: accountId,
        waiting_since: since.toISOString(),
        breached_at: now.toISOString(),
        cleared_at: null,
      },
      { onConflict: 'conversation_id' },
    )
    if (upErr) continue
    count++

    const waitedMin = Math.max(1, Math.round((now.getTime() - since.getTime()) / 60_000))
    const who = b.contact_id ? (names.get(b.contact_id) ?? 'A customer') : 'A customer'
    const recipients = b.assigned_agent_id ? [b.assigned_agent_id] : await adminIds()
    for (const userId of recipients) {
      notifications.push({
        account_id: accountId,
        user_id: userId,
        type: 'sla_breach',
        conversation_id: b.conversation_id,
        contact_id: b.contact_id,
        title: 'Reply overdue',
        body: `${who} has been waiting ${formatWait(waitedMin)} for a reply (target ${settings.sla_first_response_minutes} min).`,
      })
    }
  }

  if (notifications.length > 0) {
    const { error: nErr } = await db.from('notifications').insert(notifications)
    if (nErr) console.error('[sla] notifications failed:', nErr.message)
  }

  // Team alert (Slack / Discord / Telegram): one summary line per breached chat, capped.
  for (const b of breached.slice(0, 5)) {
    const waitedMin = Math.max(1, Math.round((now.getTime() - new Date(b.waiting_since).getTime()) / 60_000))
    await fireTeamAlert(accountId, 'sla_breach', {
      contactName: b.contact_id ? (names.get(b.contact_id) ?? null) : null,
      minutes: waitedMin,
    })
  }
  return count
}

function formatWait(minutes: number): string {
  if (minutes < 60) return `${minutes} min`
  const h = Math.floor(minutes / 60)
  const m = minutes % 60
  return m === 0 ? `${h} h` : `${h} h ${m} min`
}
