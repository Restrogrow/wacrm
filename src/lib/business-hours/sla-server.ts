// ============================================================
// First-response SLA alerts — run from /api/automations/cron.
//
// For every account with SLA enabled:
//   1. clear breach rows whose chat got a human reply or was closed,
//   2. find open chats where the customer has waited longer than the
//      target with no human ('agent') reply (bots do not count),
//   3. for each new breach, record it in `conversation_sla` and
//      notify the assigned agent (or every owner/admin if unassigned),
//   4. for accounts with repeat reminders on (migration 098), re-notify
//      chats that are STILL waiting, every `sla_repeat_minutes`.
//
// One *first* alert per waiting episode: a row for the same
// `waiting_since` is never announced twice. A later customer message
// after an agent reply starts a new episode. The repeat pass in (4) is
// what keeps a forgotten chat from going quiet; it is capped at
// SLA_MAX_REMINDERS and escalates to the owners/admins from the second
// reminder on, so a chat assigned to someone who is away still lands
// in front of the team.
// ============================================================

import { fireTeamAlert } from '@/lib/alerts/server'
import { supabaseAdmin } from '@/lib/automations/admin-client'
import {
  SLA_MAX_REMINDERS,
  isSlaBreached,
  rowToSettings,
  shouldRemindAgain,
  type BusinessHoursSettings,
} from './hours'

const MAX_ACCOUNTS_PER_RUN = 200
const MAX_CANDIDATES_PER_ACCOUNT = 100
/** Repeat reminders handled per account per run. */
const MAX_REMINDERS_PER_RUN = 50

type Db = ReturnType<typeof supabaseAdmin>

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

/**
 * Who to tell when a chat is unassigned, and who an escalated reminder
 * goes to: the account's owners and admins. Memoised per account run.
 */
function makeAdminLoader(db: Db, accountId: string): () => Promise<string[]> {
  let admins: string[] | null = null
  return async () => {
    if (admins) return admins
    const { data } = await db
      .from('profiles')
      .select('user_id')
      .eq('account_id', accountId)
      .in('account_role', ['owner', 'admin'])
    admins = (data ?? []).map((p) => p.user_id as string)
    return admins
  }
}

/** contact id → display name, for the notification body. */
async function loadContactNames(db: Db, contactIds: string[]): Promise<Map<string, string>> {
  const names = new Map<string, string>()
  if (contactIds.length === 0) return names
  const { data: contacts } = await db
    .from('contacts')
    .select('id, name, phone')
    .in('id', contactIds)
  for (const c of contacts ?? []) {
    names.set(c.id as string, ((c.name as string) || (c.phone as string) || 'A customer').trim())
  }
  return names
}

async function processAccount(row: Record<string, unknown>): Promise<number> {
  const db = supabaseAdmin()
  const accountId = row.account_id as string
  const settings = rowToSettings(row)
  const now = new Date()

  await db.rpc('sla_clear_resolved', { p_account_id: accountId })

  const adminIds = makeAdminLoader(db, accountId)

  // Repeat reminders run first and independently: a still-unanswered
  // chat produces no *new* breach, so the pass below would return
  // early and the chat would stay silent forever.
  const reminded = await processReminders(db, accountId, settings, now, adminIds)

  // Wall-clock minutes always >= business minutes, so this is a safe
  // lower bound; the precise check happens below.
  const olderThan = new Date(now.getTime() - settings.sla_first_response_minutes * 60_000)
  const { data: waiting, error } = await db.rpc('sla_waiting_conversations', {
    p_account_id: accountId,
    p_older_than: olderThan.toISOString(),
    p_limit: MAX_CANDIDATES_PER_ACCOUNT,
  })
  if (error || !waiting || waiting.length === 0) return reminded
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
  if (breached.length === 0) return reminded

  const names = await loadContactNames(
    db,
    breached.map((b) => b.contact_id).filter((id): id is string => !!id),
  )

  // A row reaching this point is a *new* waiting episode (no row yet,
  // or one with a different `waiting_since`), so the previous episode's
  // reminder tally has to go — otherwise a chat that once ran to the
  // cap would never be reminded about again.
  //
  // Gated on the column being present in the row rather than on
  // `sla_repeat_enabled`: sending a field the database does not have
  // would fail the upsert and take the ordinary breach alerts down with
  // it, but resetting only while repeats are *on* would leave a stale
  // tally behind if an account turns them off and back on mid-wait.
  const resetReminders =
    'sla_repeat_enabled' in row ? { reminders_sent: 0, last_reminded_at: null } : {}

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
        ...resetReminders,
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
  return reminded + count
}

interface BreachRow {
  conversation_id: string
  waiting_since: string
  breached_at: string
  reminders_sent: number
  last_reminded_at: string | null
  conversations: { contact_id: string | null; assigned_agent_id: string | null } | null
}

/**
 * Re-notify chats that are still waiting. Returns how many reminders
 * were sent.
 *
 * Only runs for accounts that switched repeats on, so an account that
 * has not costs nothing. `sla_clear_resolved()` has already closed the
 * rows that got a reply, so every open row here is genuinely still
 * unanswered.
 *
 * Each reminder is claimed with a compare-and-set on `reminders_sent`
 * before the notification is written, so two overlapping cron runs can
 * never send the same reminder twice.
 */
async function processReminders(
  db: Db,
  accountId: string,
  settings: BusinessHoursSettings,
  now: Date,
  adminIds: () => Promise<string[]>,
): Promise<number> {
  if (!settings.sla_repeat_enabled) return 0

  const { data, error } = await db
    .from('conversation_sla')
    .select(
      'conversation_id, waiting_since, breached_at, reminders_sent, last_reminded_at, conversations!inner(contact_id, assigned_agent_id)',
    )
    .eq('account_id', accountId)
    .is('cleared_at', null)
    .lt('reminders_sent', SLA_MAX_REMINDERS)
    .order('breached_at', { ascending: true })
    .limit(MAX_REMINDERS_PER_RUN)
  if (error || !data || data.length === 0) {
    // Migration 098 not applied yet (no `reminders_sent`): nothing to do.
    return 0
  }

  const rows = data as unknown as BreachRow[]
  const due = rows.filter((r) => shouldRemindAgain(settings, r, now))
  if (due.length === 0) return 0

  const names = await loadContactNames(
    db,
    due.map((r) => r.conversations?.contact_id).filter((id): id is string => !!id),
  )

  const notifications: Record<string, unknown>[] = []
  let sent = 0
  for (const r of due) {
    const n = r.reminders_sent + 1

    // Claim this reminder before announcing it.
    const { data: claimed, error: upErr } = await db
      .from('conversation_sla')
      .update({ reminders_sent: n, last_reminded_at: now.toISOString() })
      .eq('conversation_id', r.conversation_id)
      .eq('reminders_sent', r.reminders_sent)
      .is('cleared_at', null)
      .select('conversation_id')
      .maybeSingle()
    if (upErr || !claimed) continue
    sent++

    const contactId = r.conversations?.contact_id ?? null
    const assigned = r.conversations?.assigned_agent_id ?? null
    const who = contactId ? (names.get(contactId) ?? 'A customer') : 'A customer'
    const waitedMin = Math.max(1, Math.round((now.getTime() - new Date(r.waiting_since).getTime()) / 60_000))

    // First reminder: whoever owns the chat. From the second on, the
    // owners/admins too — the assignee may be away.
    const recipients = new Set<string>()
    if (assigned) recipients.add(assigned)
    if (!assigned || n >= 2) for (const id of await adminIds()) recipients.add(id)

    for (const userId of recipients) {
      notifications.push({
        account_id: accountId,
        user_id: userId,
        type: 'sla_reminder',
        conversation_id: r.conversation_id,
        contact_id: contactId,
        title: 'Still waiting for a reply',
        body: `${who} has now been waiting ${formatWait(waitedMin)} with no reply (reminder ${n} of ${SLA_MAX_REMINDERS}).`,
      })
    }
  }

  if (notifications.length > 0) {
    const { error: nErr } = await db.from('notifications').insert(notifications)
    if (nErr) console.error('[sla] reminder notifications failed:', nErr.message)
  }
  return sent
}

function formatWait(minutes: number): string {
  if (minutes < 60) return `${minutes} min`
  const h = Math.floor(minutes / 60)
  const m = minutes % 60
  return m === 0 ? `${h} h` : `${h} h ${m} min`
}
