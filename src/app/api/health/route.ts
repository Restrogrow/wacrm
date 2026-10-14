import { NextResponse } from 'next/server'
import { checkRateLimit, getClientIp, rateLimitResponse, RATE_LIMITS } from '@/lib/rate-limit'

import { getSystemHealth } from '@/lib/ops/health'

export const dynamic = 'force-dynamic'

/**
 * Public health check for uptime monitors (UptimeRobot, Better Stack…).
 *
 * 200 → status "ok" or "degraded"; 503 → status "down" (database
 * unreachable, or a cron endpoint stopped running or keeps failing).
 * Only states are returned — error messages, missing env var names
 * and webhook details are on /admin/system for platform admins.
 */
export async function GET(request: Request) {
  // Public: cap per IP so it can't be used to hammer the database.
  const limit = checkRateLimit(`health:${getClientIp(request)}`, RATE_LIMITS.healthCheck)
  if (!limit.success) return rateLimitResponse(limit)

  const health = await getSystemHealth()
  return NextResponse.json(
    {
      status: health.status,
      checked_at: health.checkedAt,
      checks: {
        database: health.database.state,
        database_latency_ms: health.database.latencyMs,
        config: health.config.state,
        jobs: health.jobs.state,
        webhooks: health.webhooks.state,
      },
    },
    {
      status: health.status === 'down' ? 503 : 200,
      headers: { 'Cache-Control': 'no-store' },
    },
  )
}
