// ============================================================
// /api/whatsapp/number-health — the business number's health.
//
//   GET  → stored health (checks Meta first if never checked or older
//          than a day), plus { level, reasons } for the UI.
//   POST → check Meta now ("Check now"). Rate limited.
// Any member can view. Data: lib/whatsapp/number-health.ts.
// ============================================================

import { NextResponse } from 'next/server'

import { getCurrentAccount, toErrorResponse } from '@/lib/auth/account'
import { supabaseAdmin } from '@/lib/flows/admin-client'
import { checkRateLimit, rateLimitResponse, RATE_LIMITS } from '@/lib/rate-limit'
import { assessHealth, refreshNumberHealth, type NumberHealth } from '@/lib/whatsapp/number-health'

export const dynamic = 'force-dynamic'

const STALE_MS = 24 * 60 * 60 * 1000

function respond(health: NumberHealth | null, available = true) {
  if (!health) return NextResponse.json({ available, health: null })
  return NextResponse.json({ available, health, ...assessHealth(health) })
}

export async function GET() {
  try {
    const ctx = await getCurrentAccount()
    const { data, error } = await supabaseAdmin()
      .from('whatsapp_number_health')
      .select('*')
      .eq('account_id', ctx.accountId)
      .maybeSingle()
    if (error) return respond(null, false) // migration 049 not run yet

    const stale = !data?.checked_at || Date.now() - new Date(data.checked_at).getTime() > STALE_MS
    if (stale) return respond(await refreshNumberHealth(ctx.accountId))
    return respond(data as NumberHealth)
  } catch (err) {
    return toErrorResponse(err)
  }
}

export async function POST() {
  try {
    const ctx = await getCurrentAccount()
    const limit = checkRateLimit(`number-health:${ctx.accountId}`, RATE_LIMITS.numberHealthCheck)
    if (!limit.success) return rateLimitResponse(limit)
    return respond(await refreshNumberHealth(ctx.accountId))
  } catch (err) {
    return toErrorResponse(err)
  }
}
