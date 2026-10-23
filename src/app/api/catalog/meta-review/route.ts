// ============================================================
// GET /api/catalog/meta-review?ids=SKU1,SKU2 — Meta's review status for
// products already on WhatsApp, for the catalog page. Any member. Read-only.
// ============================================================

import { NextResponse } from 'next/server'

import { getCurrentAccount, toErrorResponse } from '@/lib/auth/account'
import { fetchReviewStatuses } from '@/lib/catalog/meta-review'
import { supabaseAdmin } from '@/lib/flows/admin-client'
import { checkRateLimit, rateLimitResponse } from '@/lib/rate-limit'
import { loadCommerce } from '@/lib/whatsapp/commerce'

const MAX_IDS = 100

export async function GET(request: Request) {
  try {
    const ctx = await getCurrentAccount()
    const limit = checkRateLimit(`catalog-meta-review:${ctx.userId}`, { limit: 30, windowMs: 60_000 })
    if (!limit.success) return rateLimitResponse(limit)

    const ids = [...new Set((new URL(request.url).searchParams.get('ids') ?? '').split(',').map((s) => s.trim()).filter(Boolean))].slice(0, MAX_IDS)
    let loaded
    try {
      loaded = await loadCommerce(supabaseAdmin(), ctx.accountId)
    } catch {
      return NextResponse.json({ statuses: null })
    }
    if (!loaded.settings.catalog_id) return NextResponse.json({ statuses: null })
    const statuses = await fetchReviewStatuses(loaded.creds.accessToken, loaded.settings.catalog_id, ids)
    return NextResponse.json({ statuses }, { headers: { 'Cache-Control': 'no-store' } })
  } catch (err) {
    return toErrorResponse(err)
  }
}
