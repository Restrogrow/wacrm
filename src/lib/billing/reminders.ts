// ============================================================
// Trial-ending and plan-renewal reminder emails (migration 050).
//
// Stages (each emailed once to the account owner):
//   trial  — 2 days before the trial ends, on the last day, and once
//            it has ended (account is read-only);
//   paid   — 3 days before plan_expires_at, and once it has passed.
// Payment is manual (UPI / bank transfer), so every email says how to
// pay and links to Settings → Plan & billing.
//
// Runs inside the every-minute automations cron, only between 9 am and
// 8 pm India time so nobody gets a 3 am email.
// ============================================================

import { supabaseAdmin } from '@/lib/flows/admin-client'
import { isEmailConfigured, sendEmail } from '@/lib/email/mailer'
import { PLAN_INFO, type AccountPlan } from '@/lib/billing/plans'
import { SITE_URL, SUPPORT_EMAIL } from '@/lib/seo'

const DAY = 24 * 60 * 60 * 1000
const BATCH = 20

export type ReminderStage = 'trial-2d' | 'trial-today' | 'trial-ended' | 'paid-3d' | 'paid-ended'

export interface ReminderAccount {
  id: string
  name: string
  plan: AccountPlan
  trial_ends_at: string | null
  plan_expires_at: string | null
  billing_reminder_key: string | null
}

/** Which reminder (if any) is due for this account right now. */
export function dueReminder(a: ReminderAccount, now = Date.now()): { stage: ReminderStage; key: string } | null {
  if (a.plan === 'trial') {
    if (!a.trial_ends_at) return null
    const ends = Date.parse(a.trial_ends_at)
    const left = ends - now
    const date = a.trial_ends_at.slice(0, 10)
    let stage: ReminderStage | null = null
    if (left <= 0 && left > -3 * DAY) stage = 'trial-ended'
    else if (left > 0 && left <= DAY) stage = 'trial-today'
    else if (left > DAY && left <= 2 * DAY) stage = 'trial-2d'
    if (!stage) return null
    const key = `${stage}:${date}`
    return key === a.billing_reminder_key ? null : { stage, key }
  }

  if (!a.plan_expires_at) return null
  const expires = Date.parse(a.plan_expires_at)
  const left = expires - now
  const date = a.plan_expires_at.slice(0, 10)
  let stage: ReminderStage | null = null
  if (left <= 0 && left > -3 * DAY) stage = 'paid-ended'
  else if (left > 0 && left <= 3 * DAY) stage = 'paid-3d'
  if (!stage) return null
  const key = `${stage}:${date}`
  return key === a.billing_reminder_key ? null : { stage, key }
}

/** Daytime in India (9:00–19:59 IST). */
export function isIndianDaytime(now = Date.now()): boolean {
  const hour = Number(
    new Intl.DateTimeFormat('en-GB', { hour: 'numeric', hourCycle: 'h23', timeZone: 'Asia/Kolkata' }).format(now),
  )
  return hour >= 9 && hour < 20
}

function formatDate(iso: string): string {
  return new Date(iso).toLocaleDateString('en-IN', { day: 'numeric', month: 'long', timeZone: 'Asia/Kolkata' })
}

export function reminderEmail(a: ReminderAccount, stage: ReminderStage): { subject: string; text: string } {
  const billing = `${SITE_URL}/settings?tab=billing`
  const prices = (['starter', 'growth', 'pro', 'enterprise'] as const)
    .map((p) => {
      const pr = PLAN_INFO[p].prices
      return pr
        ? `• ${PLAN_INFO[p].label}: ₹${pr.monthly.toLocaleString('en-IN')}/month, ₹${pr.quarterly.toLocaleString('en-IN')}/quarter or ₹${pr.yearly.toLocaleString('en-IN')}/year`
        : `• ${PLAN_INFO[p].label}: custom pricing`
    })
    .join('\n')
  const howToPay = `To continue, pick a plan in Settings → Plan & billing (${billing}) and click Choose — our team will share UPI / bank details and switch it on as soon as it's paid. Questions? Reply to this email or write to ${SUPPORT_EMAIL}.`
  const planLabel = a.plan === 'trial' ? 'free trial' : `${PLAN_INFO[a.plan as keyof typeof PLAN_INFO]?.label ?? a.plan} plan`

  switch (stage) {
    case 'trial-2d':
      return {
        subject: `Your Repeat Grow trial ends in 2 days`,
        text: `Hi,\n\nYour free trial for ${a.name} ends on ${formatDate(a.trial_ends_at!)}. After that the account becomes read-only: you'll still see every chat, but sending messages, broadcasts and automations pause.\n\nPlans:\n${prices}\n(+ WhatsApp conversation fees billed by Meta)\n\n${howToPay}`,
      }
    case 'trial-today':
      return {
        subject: `Last day of your Repeat Grow trial`,
        text: `Hi,\n\nToday is the last day of the free trial for ${a.name}. Choose a plan to keep replying, broadcasting and running automations without a break.\n\nPlans:\n${prices}\n\n${howToPay}`,
      }
    case 'trial-ended':
      return {
        subject: `Your Repeat Grow trial has ended`,
        text: `Hi,\n\nThe free trial for ${a.name} has ended, so the account is read-only for now. Nothing is deleted — your chats, contacts and settings are all still there, and new WhatsApp messages keep arriving.\n\nChoose a plan to start sending again:\n${prices}\n\n${howToPay}`,
      }
    case 'paid-3d':
      return {
        subject: `Your Repeat Grow ${planLabel} renews in 3 days`,
        text: `Hi,\n\nThe ${planLabel} for ${a.name} is paid until ${formatDate(a.plan_expires_at!)}. To avoid a break, renew before then.\n\n${howToPay}`,
      }
    case 'paid-ended':
      return {
        subject: `Your Repeat Grow ${planLabel} has expired`,
        text: `Hi,\n\nThe ${planLabel} for ${a.name} expired on ${formatDate(a.plan_expires_at!)}, so the account is read-only for now. Nothing is deleted.\n\n${howToPay}`,
      }
  }
}

/** Cron task. Returns how many reminders were sent. */
export async function processBillingReminders(now = Date.now()): Promise<number> {
  if (!isEmailConfigured() || !isIndianDaytime(now)) return 0
  const db = supabaseAdmin()

  const soon = new Date(now + 3 * DAY).toISOString()
  const recent = new Date(now - 3 * DAY).toISOString()
  const { data, error } = await db
    .from('accounts')
    .select('id, name, owner_user_id, plan, trial_ends_at, plan_expires_at, billing_reminder_key')
    .or(
      `and(plan.eq.trial,trial_ends_at.gte.${recent},trial_ends_at.lte.${soon}),and(plan.neq.trial,plan_expires_at.gte.${recent},plan_expires_at.lte.${soon})`,
    )
    .limit(200)
  // Migration 050 (or 041) not run yet — skip quietly.
  if (error) return 0

  let sent = 0
  for (const a of (data ?? []) as (ReminderAccount & { owner_user_id: string })[]) {
    if (sent >= BATCH) break
    const due = dueReminder(a, now)
    if (!due) continue

    // Claim first so overlapping cron runs can't double-send.
    const claim = db.from('accounts').update({ billing_reminder_key: due.key, billing_reminder_sent_at: new Date(now).toISOString() }).eq('id', a.id)
    const { data: claimed } = await (a.billing_reminder_key === null
      ? claim.is('billing_reminder_key', null)
      : claim.eq('billing_reminder_key', a.billing_reminder_key)
    )
      .select('id')
      .maybeSingle()
    if (!claimed) continue

    const { data: owner } = await db.from('profiles').select('email').eq('user_id', a.owner_user_id).maybeSingle()
    if (!owner?.email) continue

    const { subject, text } = reminderEmail(a, due.stage)
    try {
      await sendEmail({
        to: [owner.email],
        subject,
        text,
        html: `<div style="font-family:Arial,sans-serif;font-size:14px;line-height:1.6;white-space:pre-line">${text.replace(
          /[&<>]/g,
          (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;' })[c]!,
        )}</div>`,
      })
      sent++
    } catch (err) {
      console.warn('[billing-reminders] email not sent:', err instanceof Error ? err.message : err)
    }
  }
  return sent
}
