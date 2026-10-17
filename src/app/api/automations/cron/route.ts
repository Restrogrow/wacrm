import { timingSafeEqual } from 'node:crypto'
import { NextResponse } from 'next/server'
import { supabaseAdmin } from '@/lib/automations/admin-client'
import { resumePendingExecution } from '@/lib/automations/engine'
import type { AutomationContext } from '@/lib/automations/engine'
import { processDueCheckouts } from '@/lib/shopify/process'
import { processDueCalendlyReminders } from '@/lib/calendly/process'
import { processDueCalComReminders } from '@/lib/calcom/process'
import { processScheduledBroadcasts } from '@/lib/broadcasts/scheduled'
import { processScheduledMessages } from '@/lib/scheduled-messages/process'
import { processDailySummaries } from '@/lib/summary/daily'
import { withHeartbeat } from '@/lib/ops/monitoring'
import { processDueNumberHealth } from '@/lib/whatsapp/number-health'
import { processBillingReminders } from '@/lib/billing/reminders'
import { processSlaAlerts } from '@/lib/business-hours/sla-server'
import { processJourneys } from '@/lib/journeys/process'
import { processAiAnalysis } from '@/lib/ai/analyze-server'

/**
 * Drain due `automation_pending_executions` rows. Meant to be hit
 * on a schedule (Vercel Cron / external pinger) — requires a shared
 * secret via the `x-cron-secret` header to match
 * `AUTOMATION_CRON_SECRET`.
 *
 * The claim step (status = 'running') serves as a simple lock so
 * overlapping invocations don't double-process rows. Best-effort
 * only; expensive SELECT ... FOR UPDATE is avoided in favor of a
 * two-step UPDATE-by-id.
 */
export async function GET(request: Request) {
  const expected = process.env.AUTOMATION_CRON_SECRET
  if (!expected) {
    return NextResponse.json({ error: 'cron not configured' }, { status: 503 })
  }
  // Constant-time compare, same as /api/flows/cron.
  const suppliedBuf = Buffer.from(request.headers.get('x-cron-secret') ?? '')
  const expectedBuf = Buffer.from(expected)
  if (suppliedBuf.length !== expectedBuf.length || !timingSafeEqual(suppliedBuf, expectedBuf)) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  // Each task records a heartbeat (see /api/health and /admin/system);
  // the run as a whole records `automations-cron`.
  try {
    const summary = await withHeartbeat('automations-cron', runCron)
    return NextResponse.json(summary)
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : 'cron failed' },
      { status: 500 },
    )
  }
}

async function runCron() {
  const processed = await withHeartbeat('automation-steps', processPendingSteps).catch((err) => {
    console.error('[cron] delayed automation steps failed:', err)
    return 0
  })

  // Shopify abandoned-cart reminders and Calendly booking reminders ride
  // on the same every-minute schedule, so no extra cron job is needed.
  // Never let them fail the run.
  const shopifyReminders = await withHeartbeat('shopify-reminders', processDueCheckouts).catch((err) => {
    console.error('[cron] shopify abandoned checkouts failed:', err)
    return 0
  })
  const calendlyReminders = await withHeartbeat('calendly-reminders', processDueCalendlyReminders).catch((err) => {
    console.error('[cron] calendly reminders failed:', err)
    return 0
  })

  const calcomReminders = await withHeartbeat('calcom-reminders', processDueCalComReminders).catch((err) => {
    console.error('[cron] cal.com reminders failed:', err)
    return 0
  })

  const scheduledBroadcastSends = await withHeartbeat('scheduled-broadcasts', processScheduledBroadcasts).catch((err) => {
    console.error('[cron] scheduled broadcasts failed:', err)
    return 0
  })

  // "Send later" chat messages scheduled from the inbox composer.
  const scheduledMessageSends = await withHeartbeat('scheduled-messages', processScheduledMessages).catch((err) => {
    console.error('[cron] scheduled messages failed:', err)
    return 0
  })

  const dailySummaries = await withHeartbeat('daily-summaries', processDailySummaries).catch((err) => {
    console.error('[cron] daily summaries failed:', err)
    return 0
  })

  // Daily WhatsApp number health check, a few accounts per run.
  const numberHealthChecks = await withHeartbeat('number-health', processDueNumberHealth).catch((err) => {
    console.error('[cron] number health failed:', err)
    return 0
  })

  // Trial-ending / plan-renewal emails (daytime IST, once per stage).
  const billingReminders = await withHeartbeat('billing-reminders', () => processBillingReminders()).catch((err) => {
    console.error('[cron] billing reminders failed:', err)
    return 0
  })

  // First-response SLA: notify when a chat has waited too long for a human reply.
  const slaAlerts = await withHeartbeat('sla-alerts', processSlaAlerts).catch((err) => {
    console.error('[cron] sla alerts failed:', err)
    return 0
  })

  // AI lead scoring (intent, sentiment, 0-100 score): a few chats a minute,
  // quota-limited, and a no-op without a Gemini key.
  const aiScored = await withHeartbeat('ai-analysis', () => processAiAnalysis()).catch((err) => {
    console.error('[cron] ai analysis failed:', err)
    return 0
  })

  // Birthday / drip / win-back journeys (quiet hours, caps and opt-outs apply).
  const journeySends = await withHeartbeat('journeys', processJourneys).catch((err) => {
    console.error('[cron] journeys failed:', err)
    return 0
  })

  return {
    processed,
    journey_sends: journeySends,
    ai_scored: aiScored,
    sla_alerts: slaAlerts,
    number_health_checks: numberHealthChecks,
    billing_reminders: billingReminders,
    scheduled_broadcast_sends: scheduledBroadcastSends,
    scheduled_message_sends: scheduledMessageSends,
    daily_summaries: dailySummaries,
    shopify_reminders: shopifyReminders,
    calendly_reminders: calendlyReminders,
    calcom_reminders: calcomReminders,
  }
}

/** Drain due delayed automation steps. Returns how many ran. */
async function processPendingSteps(): Promise<number> {
  const admin = supabaseAdmin()
  const { data: due, error } = await admin
    .from('automation_pending_executions')
    .select('*')
    .eq('status', 'pending')
    .lte('run_at', new Date().toISOString())
    .order('run_at', { ascending: true })
    .limit(50)

  if (error) throw new Error(error.message)

  let processed = 0
  for (const row of due ?? []) {
    const { data: claim } = await admin
      .from('automation_pending_executions')
      .update({ status: 'running' })
      .eq('id', row.id)
      .eq('status', 'pending')
      .select('id')
      .maybeSingle()
    if (!claim) continue

    await resumePendingExecution({
      id: row.id as string,
      automation_id: row.automation_id as string,
      // account_id is NOT NULL on automation_pending_executions
      // post-017; the engine uses it for tenant-scoped lookups.
      account_id: row.account_id as string,
      user_id: row.user_id as string,
      contact_id: (row.contact_id as string | null) ?? null,
      log_id: (row.log_id as string | null) ?? null,
      parent_step_id: (row.parent_step_id as string | null) ?? null,
      branch: (row.branch as 'yes' | 'no' | null) ?? null,
      next_step_position: row.next_step_position as number,
      context: (row.context as AutomationContext) ?? {},
    })
    processed++
  }

  return processed
}
