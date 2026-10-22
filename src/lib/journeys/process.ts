// ============================================================
// Journeys — the cron processor. Server-only.
//
// Called by the every-minute automations cron. Each run:
//
//   1. ENROLL  — date journeys scan their contacts once per local day;
//                tag / segment drips and win-backs enroll new audience
//                members in small batches (SQL, migration 075).
//   2. SEND    — due enrollments are walked one step at a time:
//                  - skipped while the account is in quiet hours, over
//                    its daily / monthly cap, expired, or has no WhatsApp
//                  - exit rules (opt-out, customer replied, exit tag)
//                  - one journey message per contact per cooldown
//                  - templates must be APPROVED; free text needs an
//                    open 24-hour window
//                  - a UNIQUE ledger row (journey_sends) is written
//                    BEFORE the send, so overlapping runs or a crash can
//                    never send the same step twice
//   3. REPLIES — every few minutes, sends the customer wrote back to are
//                marked for the stats.
//
// Sent through the automation sender, so messages are saved as `bot`
// (they never count as a human agent reply in Reports or SLA).
// ============================================================

import { supabaseAdmin } from '@/lib/flows/admin-client'
import { accountCanSend, loadEffectivePlan } from '@/lib/billing/server'
import { engineSendTemplate, engineSendText } from '@/lib/automations/meta-send'
import { resolveConversationByPhone } from '@/lib/whatsapp/resolve-conversation'
import { findCurrentConversation } from '@/lib/whatsapp/current-number'
import {
  DATE_SEND_GRACE_HOURS,
  DEFAULT_TIMEZONE,
  contactVars,
  dueOccurrence,
  evaluateExit,
  frequencyCapBlocked,
  isQuietHours,
  localNow,
  localToUtc,
  monthlyJourneyCap,
  nextAfterStep,
  parseFlexibleDate,
  renderVars,
  startOfLocalDay,
  ymdString,
  type ExitReason,
  type LooseYmd,
  type Recurrence,
} from './core'

/** Leave headroom inside the cron route's time limit (shared with other tasks). */
const TIME_BUDGET_MS = 25_000
const MAX_DUE_PER_RUN = 120
const MAX_SCAN_CONTACTS = 20_000
const PAGE = 1000
const CLAIM_STALE_MS = 5 * 60_000

interface JourneyRow {
  id: string
  account_id: string
  kind: 'date' | 'drip' | 'winback'
  status: string
  config: Record<string, unknown>
  daily_cap: number
  last_scan_on: string | null
  created_by: string | null
}

interface StepRow {
  journey_id: string
  position: number
  delay_minutes: number
  message_type: 'template' | 'text'
  template_name: string | null
  template_language: string | null
  template_params: unknown
  text_body: string | null
}

interface EnrollmentRow {
  id: string
  journey_id: string
  account_id: string
  contact_id: string
  occurrence_key: string
  current_step: number
  next_run_at: string
  claimed_at: string | null
  enrolled_at: string
}

interface AccountCtx {
  ok: boolean
  quiet: boolean
  tz: string
  cooldownHours: number
  accountCap: number
  monthCap: number | null
  sentToday: number
  sentMonth: number
}

type Db = ReturnType<typeof supabaseAdmin>

// ------------------------------------------------------------
// Account context
// ------------------------------------------------------------

async function loadAccountCtx(db: Db, accountId: string, now: Date): Promise<AccountCtx> {
  const { data: s } = await db.from('journey_settings').select('*').eq('account_id', accountId).maybeSingle()
  const tz = (s?.timezone as string) || DEFAULT_TIMEZONE
  const quietStart = (s?.quiet_start as string) || '21:00'
  const quietEnd = (s?.quiet_end as string) || '09:00'
  const cooldownHours = typeof s?.contact_cooldown_hours === 'number' ? s.contact_cooldown_hours : 24
  const accountCap = typeof s?.account_daily_cap === 'number' ? s.account_daily_cap : 300

  const canSend = await accountCanSend(accountId)
  const { data: wa } = await db.from('whatsapp_config').select('id').eq('account_id', accountId).maybeSingle()
  const plan = await loadEffectivePlan(accountId, db)

  const dayStart = startOfLocalDay(now, tz).toISOString()
  const monthStart = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 1)).toISOString()
  const { count: sentToday } = await db
    .from('journey_sends')
    .select('id', { count: 'exact', head: true })
    .eq('account_id', accountId)
    .eq('status', 'sent')
    .gte('sent_at', dayStart)
  const { count: sentMonth } = await db
    .from('journey_sends')
    .select('id', { count: 'exact', head: true })
    .eq('account_id', accountId)
    .eq('status', 'sent')
    .gte('sent_at', monthStart)

  return {
    ok: canSend && !!wa,
    quiet: isQuietHours(now, tz, quietStart, quietEnd),
    tz,
    cooldownHours,
    accountCap,
    monthCap: monthlyJourneyCap(plan),
    sentToday: sentToday ?? 0,
    sentMonth: sentMonth ?? 0,
  }
}

// ------------------------------------------------------------
// 1. Enrollment
// ------------------------------------------------------------

interface DateConfig {
  date_source: { type: 'custom_field'; field_id: string } | { type: 'contact_created' }
  offset_days: number
  send_time: string
  recurrence: Recurrence
}

/** Date journeys: once per local day, enroll the contacts whose send date is today. */
async function scanDateJourney(db: Db, j: JourneyRow, ctx: AccountCtx, now: Date): Promise<void> {
  const cfg = j.config as unknown as DateConfig
  const { date: today } = localNow(now, ctx.tz)
  const todayStr = ymdString(today)
  if (j.last_scan_on === todayStr) return

  // Claim today's scan so overlapping runs do it once.
  const { data: claim } = await db
    .from('journeys')
    .update({ last_scan_on: todayStr })
    .eq('id', j.id)
    .or(`last_scan_on.is.null,last_scan_on.lt.${todayStr}`)
    .select('id')
    .maybeSingle()
  if (!claim) return

  const runAt = localToUtc(today, cfg.send_time, ctx.tz)
  // Activated after the send time (plus grace)? Start tomorrow.
  if (now.getTime() > runAt.getTime() + DATE_SEND_GRACE_HOURS * 3_600_000) return

  const rows: Array<Record<string, unknown>> = []
  const consider = (contactId: string, date: LooseYmd | null) => {
    if (!date) return
    const key = dueOccurrence({ date, recurrence: cfg.recurrence, offsetDays: cfg.offset_days, today })
    if (!key) return
    rows.push({
      journey_id: j.id,
      account_id: j.account_id,
      contact_id: contactId,
      occurrence_key: key,
      next_run_at: runAt.toISOString(),
    })
  }

  let scanned = 0
  for (let from = 0; scanned < MAX_SCAN_CONTACTS; from += PAGE) {
    if (cfg.date_source.type === 'custom_field') {
      const { data, error } = await db
        .from('contact_custom_values')
        .select('contact_id, value, contacts!inner(account_id, opted_out_at)')
        .eq('custom_field_id', cfg.date_source.field_id)
        .eq('contacts.account_id', j.account_id)
        .is('contacts.opted_out_at', null)
        .not('value', 'is', null)
        .order('contact_id')
        .range(from, from + PAGE - 1)
      if (error) throw new Error(error.message)
      for (const r of data ?? []) consider(r.contact_id as string, parseFlexibleDate(r.value as string))
      scanned += data?.length ?? 0
      if ((data?.length ?? 0) < PAGE) break
    } else {
      const { data, error } = await db
        .from('contacts')
        .select('id, created_at')
        .eq('account_id', j.account_id)
        .is('opted_out_at', null)
        .order('id')
        .range(from, from + PAGE - 1)
      if (error) throw new Error(error.message)
      for (const r of data ?? []) {
        const local = localNow(new Date(r.created_at as string), ctx.tz).date
        consider(r.id as string, { y: local.y, m: local.m, d: local.d })
      }
      scanned += data?.length ?? 0
      if ((data?.length ?? 0) < PAGE) break
    }
  }

  for (let i = 0; i < rows.length; i += 500) {
    const { error } = await db
      .from('journey_enrollments')
      .upsert(rows.slice(i, i + 500), { onConflict: 'journey_id,contact_id,occurrence_key', ignoreDuplicates: true })
    if (error) throw new Error(error.message)
  }
}

async function enrollJourney(db: Db, j: JourneyRow, ctx: AccountCtx, now: Date): Promise<void> {
  if (!ctx.ok) return
  if (j.kind === 'date') {
    await scanDateJourney(db, j, ctx, now)
    return
  }
  if (j.kind === 'drip') {
    const mode = (j.config.enrollment as { mode?: string } | undefined)?.mode
    if (mode !== 'tag' && mode !== 'segment') return // manual enrollment only
    await db.rpc('journey_enroll_batch', { p_journey_id: j.id, p_limit: 100 })
    return
  }
  const limit = Number((j.config as { per_run_limit?: number }).per_run_limit ?? 100)
  await db.rpc('journey_enroll_batch', { p_journey_id: j.id, p_limit: limit })
}

// ------------------------------------------------------------
// 2. Sending
// ------------------------------------------------------------

async function finishEnrollment(
  db: Db,
  id: string,
  status: 'completed' | 'exited' | 'failed',
  reason: string | null,
): Promise<void> {
  await db
    .from('journey_enrollments')
    .update({ status, exit_reason: reason, completed_at: new Date().toISOString(), claimed_at: null })
    .eq('id', id)
}

async function releaseClaim(db: Db, id: string, patch: Record<string, unknown> = {}): Promise<void> {
  await db.from('journey_enrollments').update({ ...patch, claimed_at: null }).eq('id', id)
}

async function conversationFor(db: Db, accountId: string, contactId: string): Promise<string | null> {
  // the current number's chat: after a number switch the contact has one per number (migration 083)
  const conv = await findCurrentConversation(db, accountId, contactId)
  return conv?.id ?? null
}

async function lastCustomerMessageAt(db: Db, conversationId: string): Promise<string | null> {
  const { data } = await db
    .from('messages')
    .select('created_at')
    .eq('conversation_id', conversationId)
    .eq('sender_type', 'customer')
    .order('created_at', { ascending: false })
    .limit(1)
    .maybeSingle()
  return data?.created_at ?? null
}

/** Advance (or complete) an enrollment after its current step was handled. */
async function advance(db: Db, e: EnrollmentRow, steps: StepRow[], now: Date): Promise<void> {
  const next = nextAfterStep(steps, e.current_step, now)
  if (next.done) {
    await finishEnrollment(db, e.id, 'completed', null)
  } else {
    await releaseClaim(db, e.id, { current_step: next.nextIndex, next_run_at: next.nextRunAt.toISOString() })
  }
}

async function recordLedger(
  db: Db,
  e: EnrollmentRow,
  status: 'skipped' | 'sending',
  reason: string | null,
): Promise<'new' | 'duplicate'> {
  const { error } = await db.from('journey_sends').insert({
    journey_id: e.journey_id,
    account_id: e.account_id,
    contact_id: e.contact_id,
    enrollment_id: e.id,
    step_position: e.current_step,
    occurrence_key: e.occurrence_key,
    status,
    reason,
  })
  if (!error) return 'new'
  if (error.code === '23505') return 'duplicate' // already handled by an earlier run
  throw new Error(error.message)
}

/** Handle one due, claimed enrollment. Returns true when a message was sent. */
async function runEnrollment(
  db: Db,
  j: JourneyRow,
  steps: StepRow[],
  e: EnrollmentRow,
  ctx: AccountCtx,
  now: Date,
): Promise<boolean> {
  const { data: contact } = await db
    .from('contacts')
    .select('id, user_id, name, phone, email, company, opted_out_at')
    .eq('id', e.contact_id)
    .eq('account_id', e.account_id)
    .maybeSingle()
  if (!contact) {
    await finishEnrollment(db, e.id, 'failed', 'contact_missing')
    return false
  }

  const step = steps[e.current_step]
  if (!step) {
    await finishEnrollment(db, e.id, 'completed', null)
    return false
  }

  // A date message that is far past its time is dropped, not sent late.
  if (j.kind === 'date' && now.getTime() > Date.parse(e.next_run_at) + DATE_SEND_GRACE_HOURS * 3_600_000) {
    await finishEnrollment(db, e.id, 'exited', 'missed')
    return false
  }

  // ---- exit conditions ----
  const exitCfg = (j.config.exit ?? {}) as { on_reply?: boolean; tag_id?: string | null }
  const conversationId = await conversationFor(db, e.account_id, e.contact_id)
  let repliedSinceEnroll = false
  const wantsReplyExit = j.kind === 'winback' || (j.kind === 'drip' && exitCfg.on_reply !== false)
  if (wantsReplyExit && conversationId) {
    const { count } = await db
      .from('messages')
      .select('id', { count: 'exact', head: true })
      .eq('conversation_id', conversationId)
      .eq('sender_type', 'customer')
      .gt('created_at', e.enrolled_at)
    repliedSinceEnroll = (count ?? 0) > 0
  }
  let hasExitTag = false
  const exitTagId = j.kind === 'drip' ? (exitCfg.tag_id ?? null) : null
  if (exitTagId) {
    const { count } = await db
      .from('contact_tags')
      .select('id', { count: 'exact', head: true })
      .eq('contact_id', e.contact_id)
      .eq('tag_id', exitTagId)
    hasExitTag = (count ?? 0) > 0
  }
  const exit: ExitReason | null = evaluateExit({
    optedOut: !!contact.opted_out_at,
    onReply: wantsReplyExit,
    repliedSinceEnroll,
    exitTagId,
    hasExitTag,
  })
  if (exit) {
    await finishEnrollment(db, e.id, 'exited', exit)
    return false
  }

  // ---- one journey message per contact per cooldown ----
  if (ctx.cooldownHours > 0) {
    const since = new Date(now.getTime() - ctx.cooldownHours * 3_600_000).toISOString()
    const { data: recent } = await db
      .from('journey_sends')
      .select('sent_at')
      .eq('contact_id', e.contact_id)
      .eq('status', 'sent')
      .gt('sent_at', since)
      .limit(5)
    if (frequencyCapBlocked((recent ?? []).map((r) => r.sent_at as string), now, ctx.cooldownHours)) {
      await releaseClaim(db, e.id, { next_run_at: new Date(now.getTime() + 60 * 60_000).toISOString() })
      return false
    }
  }

  // ---- can this step be sent right now? ----
  if (step.message_type === 'template') {
    const { data: tpl } = await db
      .from('message_templates')
      .select('status')
      .eq('account_id', e.account_id)
      .eq('name', step.template_name ?? '')
      .eq('language', step.template_language || 'en_US')
      .maybeSingle()
    if (!tpl || String(tpl.status).toUpperCase() !== 'APPROVED') {
      await recordLedger(db, e, 'skipped', 'template_not_approved')
      await advance(db, e, steps, now)
      return false
    }
  } else {
    const last = conversationId ? await lastCustomerMessageAt(db, conversationId) : null
    const open = last ? now.getTime() - Date.parse(last) < 24 * 3_600_000 : false
    if (!open) {
      await recordLedger(db, e, 'skipped', 'outside_24h_window')
      await advance(db, e, steps, now)
      return false
    }
  }

  // ---- idempotency: the ledger row comes BEFORE the send ----
  const ledger = await recordLedger(db, e, 'sending', null)
  if (ledger === 'duplicate') {
    await advance(db, e, steps, now)
    return false
  }

  const vars = contactVars(contact)
  let sentOk = false
  let failure = ''
  let waId = ''
  try {
    const convId =
      conversationId ??
      (await resolveConversationByPhone(db, e.account_id, String(contact.phone), contact.name as string | null)).conversationId
    const userId = j.created_by ?? (contact.user_id as string)
    if (step.message_type === 'template') {
      const params = (Array.isArray(step.template_params) ? (step.template_params as unknown[]) : [])
        .map((p) => renderVars(String(p), vars))
      const r = await engineSendTemplate({
        accountId: e.account_id,
        userId,
        conversationId: convId,
        contactId: e.contact_id,
        templateName: step.template_name ?? '',
        language: step.template_language || 'en_US',
        params,
      })
      waId = r.whatsapp_message_id
    } else {
      const r = await engineSendText({
        accountId: e.account_id,
        userId,
        conversationId: convId,
        contactId: e.contact_id,
        text: renderVars(step.text_body ?? '', vars),
      })
      waId = r.whatsapp_message_id
    }
    sentOk = true
  } catch (err) {
    failure = (err instanceof Error ? err.message : 'send failed').slice(0, 300)
    console.error('[journeys] send failed:', failure)
  }

  await db
    .from('journey_sends')
    .update(
      sentOk
        ? { status: 'sent', message_id: waId, sent_at: new Date().toISOString() }
        : { status: 'failed', reason: failure },
    )
    .eq('enrollment_id', e.id)
    .eq('step_position', e.current_step)
    .eq('occurrence_key', e.occurrence_key)

  if (!sentOk) {
    // No automatic retry: the ledger row stays, so nothing is ever sent twice.
    await finishEnrollment(db, e.id, 'failed', failure.slice(0, 120))
    return false
  }
  await advance(db, e, steps, now)
  return true
}

// ------------------------------------------------------------
// Entry point
// ------------------------------------------------------------

/** Run enrollment + sending; returns how many messages were sent. */
export async function processJourneys(): Promise<number> {
  const db = supabaseAdmin()
  const started = Date.now()
  const now = new Date()

  const { data: journeyRows, error } = await db
    .from('journeys')
    .select('id, account_id, kind, status, config, daily_cap, last_scan_on, created_by')
    .eq('status', 'active')
    .limit(300)
  if (error) return 0 // migration 075 not applied yet
  const journeys = (journeyRows ?? []) as JourneyRow[]
  if (journeys.length === 0) return 0

  const ctxCache = new Map<string, AccountCtx>()
  const ctxFor = async (accountId: string) => {
    let c = ctxCache.get(accountId)
    if (!c) {
      c = await loadAccountCtx(db, accountId, now)
      ctxCache.set(accountId, c)
    }
    return c
  }

  // 1. Enroll
  for (const j of journeys) {
    if (Date.now() - started > TIME_BUDGET_MS / 2) break
    try {
      await enrollJourney(db, j, await ctxFor(j.account_id), now)
    } catch (err) {
      console.error('[journeys] enrollment failed:', j.id, err instanceof Error ? err.message : err)
    }
  }

  // 2. Send
  const byId = new Map(journeys.map((j) => [j.id, j]))
  const { data: stepRows } = await db
    .from('journey_steps')
    .select('journey_id, position, delay_minutes, message_type, template_name, template_language, template_params, text_body')
    .in('journey_id', [...byId.keys()])
    .order('position')
  const stepsByJourney = new Map<string, StepRow[]>()
  for (const s of (stepRows ?? []) as StepRow[]) {
    const list = stepsByJourney.get(s.journey_id) ?? []
    list.push(s)
    stepsByJourney.set(s.journey_id, list)
  }

  const { data: dueRows } = await db
    .from('journey_enrollments')
    .select('id, journey_id, account_id, contact_id, occurrence_key, current_step, next_run_at, claimed_at, enrolled_at')
    .eq('status', 'active')
    .lte('next_run_at', now.toISOString())
    .in('journey_id', [...byId.keys()])
    .order('next_run_at', { ascending: true })
    .limit(MAX_DUE_PER_RUN)

  const journeySentToday = new Map<string, number>()
  const sentTodayFor = async (j: JourneyRow): Promise<number> => {
    const cached = journeySentToday.get(j.id)
    if (cached !== undefined) return cached
    const ctx = await ctxFor(j.account_id)
    const { count } = await db
      .from('journey_sends')
      .select('id', { count: 'exact', head: true })
      .eq('journey_id', j.id)
      .eq('status', 'sent')
      .gte('sent_at', startOfLocalDay(now, ctx.tz).toISOString())
    journeySentToday.set(j.id, count ?? 0)
    return count ?? 0
  }

  let sent = 0
  for (const e of (dueRows ?? []) as EnrollmentRow[]) {
    if (Date.now() - started > TIME_BUDGET_MS) break
    const j = byId.get(e.journey_id)
    const steps = stepsByJourney.get(e.journey_id) ?? []
    if (!j || steps.length === 0) continue

    try {
      const ctx = await ctxFor(e.account_id)
      if (!ctx.ok || ctx.quiet) continue
      if (ctx.sentToday >= ctx.accountCap) continue
      if (ctx.monthCap !== null && ctx.sentMonth >= ctx.monthCap) continue
      if ((await sentTodayFor(j)) >= j.daily_cap) continue

      // Claim (stale claims from a crashed run are taken over after 5 minutes).
      const staleBefore = new Date(now.getTime() - CLAIM_STALE_MS).toISOString()
      const { data: claim } = await db
        .from('journey_enrollments')
        .update({ claimed_at: now.toISOString() })
        .eq('id', e.id)
        .eq('status', 'active')
        .or(`claimed_at.is.null,claimed_at.lt.${staleBefore}`)
        .select('id')
        .maybeSingle()
      if (!claim) continue

      const ok = await runEnrollment(db, j, steps, e, ctx, now)
      if (ok) {
        sent += 1
        ctx.sentToday += 1
        ctx.sentMonth += 1
        journeySentToday.set(j.id, (journeySentToday.get(j.id) ?? 0) + 1)
      }
    } catch (err) {
      console.error('[journeys] enrollment run failed:', e.id, err instanceof Error ? err.message : err)
      await releaseClaim(db, e.id).catch(() => {})
    }
  }

  // 3. Reply tracking, every 5 minutes
  if (now.getUTCMinutes() % 5 === 0) {
    await db.rpc('journey_mark_replies', { p_limit: 500 }).then(
      () => undefined,
      () => undefined,
    )
  }
  return sent
}
