// ============================================================
// POST /api/catalog/meta-sync  { ids?: string[] }
// Push products to the WhatsApp (Meta) catalog. Agents and above. With no
// ids it syncs everything pending or in error (up to 500 per call; the
// response says how many remain so the page can call again).
// (Pulling products FROM Shopify/WooCommerce is /api/catalog/sync.)
// ============================================================

import { NextResponse } from 'next/server'

import { requireRole, toErrorResponse } from '@/lib/auth/account'
import { syncProductsToMeta } from '@/lib/catalog/meta-sync'
import { supabaseAdmin } from '@/lib/flows/admin-client'
import { checkRateLimit, rateLimitResponse } from '@/lib/rate-limit'

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

export async function POST(request: Request) {
  try {
    const ctx = await requireRole('agent')
    const limit = checkRateLimit(`catalog-meta-sync:${ctx.userId}`, { limit: 6, windowMs: 60_000 })
    if (!limit.success) return rateLimitResponse(limit)

    const body = (await request.json().catch(() => null)) as { ids?: unknown } | null
    let ids: string[] | undefined
    if (Array.isArray(body?.ids)) {
      ids = body.ids.filter((i): i is string => typeof i === 'string' && UUID.test(i)).slice(0, 500)
      if (ids.length === 0) return NextResponse.json({ error: 'Invalid selection' }, { status: 400 })
    }

    const result = await syncProductsToMeta(supabaseAdmin(), ctx.accountId, { ids })
    const status = result.ok ? 200 : result.code === 'meta_error' ? 502 : 400
    return NextResponse.json(result, { status })
  } catch (err) {
    return toErrorResponse(err)
  }
}
