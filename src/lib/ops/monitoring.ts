// ============================================================
// Background-job heartbeats and webhook failure logging.
//
// Everything here fails open: if migration 045 hasn't been run (or
// the database is unreachable) the job / webhook carries on and only
// a console warning is written. Errors are also sent to Sentry when
// it's configured.
// ============================================================

import * as Sentry from '@sentry/nextjs'

import { supabaseAdmin } from '@/lib/automations/admin-client'

/** Every job that reports a heartbeat, and how stale it may get. */
export const MONITORED_JOBS = {
  'automations-cron': { label: 'Automations cron', maxAgeMinutes: 10 },
  'flows-cron': { label: 'Flows cron', maxAgeMinutes: 30 },
  'automation-steps': { label: 'Delayed automation steps', maxAgeMinutes: 10 },
  'scheduled-broadcasts': { label: 'Scheduled broadcasts', maxAgeMinutes: 10 },
  'shopify-reminders': { label: 'Shopify abandoned carts', maxAgeMinutes: 10 },
  'calendly-reminders': { label: 'Calendly reminders', maxAgeMinutes: 10 },
  'daily-summaries': { label: 'Daily summary emails', maxAgeMinutes: 10 },
} as const

export type MonitoredJob = keyof typeof MONITORED_JOBS

export type WebhookSource = 'whatsapp' | 'shopify' | 'calendly'

function errorMessage(err: unknown): string {
  if (err instanceof Error) return err.message
  if (typeof err === 'string') return err
  try {
    return JSON.stringify(err)
  } catch {
    return String(err)
  }
}

/**
 * Run `fn` and record the outcome in `system_heartbeats`. Rethrows the
 * job's own error so callers keep their existing error handling.
 */
export async function withHeartbeat<T>(job: MonitoredJob, fn: () => Promise<T>): Promise<T> {
  const startedAt = new Date()
  try {
    const result = await fn()
    const finishedAt = new Date()
    await writeHeartbeat(job, {
      last_started_at: startedAt.toISOString(),
      last_finished_at: finishedAt.toISOString(),
      last_ok_at: finishedAt.toISOString(),
      last_duration_ms: finishedAt.getTime() - startedAt.getTime(),
      last_result: toJsonResult(result),
    })
    return result
  } catch (err) {
    const finishedAt = new Date()
    Sentry.captureException(err, { tags: { job } })
    await writeHeartbeat(job, {
      last_started_at: startedAt.toISOString(),
      last_finished_at: finishedAt.toISOString(),
      last_error: errorMessage(err).slice(0, 2000),
      last_error_at: finishedAt.toISOString(),
      last_duration_ms: finishedAt.getTime() - startedAt.getTime(),
    })
    throw err
  }
}

function toJsonResult(result: unknown): unknown {
  if (result === undefined) return null
  if (typeof result === 'number' || typeof result === 'string' || typeof result === 'boolean') {
    return { value: result }
  }
  return result
}

async function writeHeartbeat(job: MonitoredJob, fields: Record<string, unknown>) {
  try {
    const { error } = await supabaseAdmin()
      .from('system_heartbeats')
      .upsert({ job, ...fields, updated_at: new Date().toISOString() }, { onConflict: 'job' })
    if (error) console.warn(`[monitoring] heartbeat ${job} not saved:`, error.message)
  } catch (err) {
    console.warn(`[monitoring] heartbeat ${job} not saved:`, errorMessage(err))
  }
}

/** Fraction of failure writes that also prune rows older than 30 days. */
const PRUNE_PROBABILITY = 0.05
const RETENTION_DAYS = 30

/**
 * Record an inbound webhook that failed while being processed. Never
 * throws — the webhook response must not depend on this.
 */
export async function recordWebhookFailure(
  source: WebhookSource,
  err: unknown,
  details: { accountId?: string | null; context?: Record<string, unknown> } = {},
): Promise<void> {
  Sentry.captureException(err, { tags: { webhook: source } })
  try {
    const admin = supabaseAdmin()
    const { error } = await admin.from('webhook_failures').insert({
      source,
      account_id: details.accountId ?? null,
      error: errorMessage(err).slice(0, 2000),
      context: details.context ?? null,
    })
    if (error) {
      console.warn(`[monitoring] ${source} webhook failure not saved:`, error.message)
      return
    }
    if (Math.random() < PRUNE_PROBABILITY) {
      const cutoff = new Date(Date.now() - RETENTION_DAYS * 24 * 60 * 60 * 1000).toISOString()
      await admin.from('webhook_failures').delete().lt('created_at', cutoff)
    }
  } catch (e) {
    console.warn(`[monitoring] ${source} webhook failure not saved:`, errorMessage(e))
  }
}

export interface HeartbeatRow {
  job: string
  last_started_at: string | null
  last_finished_at: string | null
  last_ok_at: string | null
  last_error: string | null
  last_error_at: string | null
  last_duration_ms: number | null
  last_result: unknown
}

export type JobState = 'ok' | 'failing' | 'stale' | 'never'

export interface JobStatus {
  job: MonitoredJob
  label: string
  state: JobState
  lastOkAt: string | null
  lastError: string | null
  lastErrorAt: string | null
  lastDurationMs: number | null
}

/**
 * Turn heartbeat rows into per-job states. A job is `failing` when its
 * latest run errored, `stale` when it hasn't succeeded within its
 * allowed window, and `never` when it has no heartbeat at all.
 */
export function evaluateJobs(rows: HeartbeatRow[], now: Date = new Date()): JobStatus[] {
  const byJob = new Map(rows.map((r) => [r.job, r]))
  return (Object.keys(MONITORED_JOBS) as MonitoredJob[]).map((job) => {
    const { label, maxAgeMinutes } = MONITORED_JOBS[job]
    const row = byJob.get(job)
    if (!row) {
      return { job, label, state: 'never', lastOkAt: null, lastError: null, lastErrorAt: null, lastDurationMs: null }
    }
    const lastOk = row.last_ok_at ? new Date(row.last_ok_at).getTime() : 0
    const lastErr = row.last_error_at ? new Date(row.last_error_at).getTime() : 0
    let state: JobState = 'ok'
    if (lastErr > lastOk) state = 'failing'
    else if (now.getTime() - lastOk > maxAgeMinutes * 60_000) state = 'stale'
    return {
      job,
      label,
      state,
      lastOkAt: row.last_ok_at,
      lastError: lastErr > lastOk ? row.last_error : null,
      lastErrorAt: row.last_error_at,
      lastDurationMs: row.last_duration_ms,
    }
  })
}
