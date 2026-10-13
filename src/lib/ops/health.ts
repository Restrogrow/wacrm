// ============================================================
// System health — shared by GET /api/health (uptime monitors) and
// the /admin/system page.
//
//   database   a trivial query through the service-role client
//   config     required server env vars are set
//   jobs       background-job heartbeats (migration 045)
//   webhooks   failed inbound webhooks in the last hour
//
// Overall status:
//   down      database unreachable, or a cron endpoint stopped /
//             keeps failing → /api/health returns 503 so monitors alert
//   degraded  a task inside a cron is failing, config is missing, or
//             webhooks are failing → 200 with status "degraded"
//   ok        everything else
// ============================================================

import { supabaseAdmin } from '@/lib/automations/admin-client'
import { evaluateJobs, type HeartbeatRow, type JobStatus } from '@/lib/ops/monitoring'

/** Server env vars the app can't work without. */
export const REQUIRED_ENV = [
  'NEXT_PUBLIC_SUPABASE_URL',
  'NEXT_PUBLIC_SUPABASE_ANON_KEY',
  'SUPABASE_SERVICE_ROLE_KEY',
  'ENCRYPTION_KEY',
  'META_APP_SECRET',
  'AUTOMATION_CRON_SECRET',
] as const

/** Cron endpoints whose silence means background work has stopped. */
const CRITICAL_JOBS = new Set(['automations-cron', 'flows-cron'])

export type CheckState = 'ok' | 'fail' | 'warn' | 'unknown'
export type OverallStatus = 'ok' | 'degraded' | 'down'

export interface WebhookFailureRow {
  id: string
  source: string
  account_id: string | null
  error: string
  context: unknown
  created_at: string
}

export interface SystemHealth {
  status: OverallStatus
  checkedAt: string
  database: { state: CheckState; latencyMs: number | null; error: string | null }
  config: { state: CheckState; missing: string[] }
  jobs: { state: CheckState; items: JobStatus[]; migrationMissing: boolean }
  webhooks: { state: CheckState; failuresLastHour: number; recent: WebhookFailureRow[] }
}

/** Postgres "relation does not exist" — migration 045 not run yet. */
function isMissingTable(error: { code?: string; message?: string } | null): boolean {
  if (!error) return false
  return error.code === '42P01' || error.code === 'PGRST205' || /does not exist|schema cache/i.test(error.message ?? '')
}

export async function getSystemHealth(options: { recentFailures?: number } = {}): Promise<SystemHealth> {
  const now = new Date()
  const missing = REQUIRED_ENV.filter((name) => !process.env[name])
  const config = { state: (missing.length ? 'fail' : 'ok') as CheckState, missing }

  // Without the service-role key nothing else can be checked.
  if (!process.env.NEXT_PUBLIC_SUPABASE_URL || !process.env.SUPABASE_SERVICE_ROLE_KEY) {
    return {
      status: 'down',
      checkedAt: now.toISOString(),
      database: { state: 'fail', latencyMs: null, error: 'Supabase is not configured' },
      config,
      jobs: { state: 'unknown', items: evaluateJobs([], now), migrationMissing: false },
      webhooks: { state: 'unknown', failuresLastHour: 0, recent: [] },
    }
  }

  const admin = supabaseAdmin()

  const dbStarted = Date.now()
  let database: SystemHealth['database']
  try {
    const { error } = await admin.from('accounts').select('id', { head: true, count: 'exact' }).limit(1)
    database = error
      ? { state: 'fail', latencyMs: null, error: error.message }
      : { state: 'ok', latencyMs: Date.now() - dbStarted, error: null }
  } catch (err) {
    database = { state: 'fail', latencyMs: null, error: err instanceof Error ? err.message : String(err) }
  }

  let jobs: SystemHealth['jobs'] = { state: 'unknown', items: evaluateJobs([], now), migrationMissing: false }
  let webhooks: SystemHealth['webhooks'] = { state: 'unknown', failuresLastHour: 0, recent: [] }

  if (database.state === 'ok') {
    const hourAgo = new Date(now.getTime() - 60 * 60 * 1000).toISOString()
    const [beats, failCount, recent] = await Promise.all([
      admin.from('system_heartbeats').select('*'),
      admin.from('webhook_failures').select('id', { head: true, count: 'exact' }).gte('created_at', hourAgo),
      admin
        .from('webhook_failures')
        .select('id, source, account_id, error, context, created_at')
        .order('created_at', { ascending: false })
        .limit(Math.max(1, options.recentFailures ?? 1)),
    ])

    if (isMissingTable(beats.error)) {
      jobs = { state: 'unknown', items: evaluateJobs([], now), migrationMissing: true }
    } else if (!beats.error) {
      const items = evaluateJobs((beats.data ?? []) as HeartbeatRow[], now)
      const criticalBad = items.some((j) => CRITICAL_JOBS.has(j.job) && (j.state === 'stale' || j.state === 'failing'))
      const anyBad = items.some((j) => j.state === 'stale' || j.state === 'failing')
      const allNever = items.every((j) => j.state === 'never')
      jobs = {
        state: criticalBad ? 'fail' : anyBad ? 'warn' : allNever ? 'unknown' : 'ok',
        items,
        migrationMissing: false,
      }
    }

    if (!isMissingTable(failCount.error) && !failCount.error) {
      const failuresLastHour = failCount.count ?? 0
      webhooks = {
        state: failuresLastHour > 0 ? 'warn' : 'ok',
        failuresLastHour,
        recent: options.recentFailures ? ((recent.data ?? []) as WebhookFailureRow[]) : [],
      }
    }
  }

  let status: OverallStatus = 'ok'
  if (database.state === 'fail' || jobs.state === 'fail') status = 'down'
  else if (config.state === 'fail' || jobs.state === 'warn' || webhooks.state === 'warn') status = 'degraded'

  return { status, checkedAt: now.toISOString(), database, config, jobs, webhooks }
}
