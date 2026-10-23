// ============================================================
// POST /api/whatsapp/commerce/enable-cart — turn on "show catalog" and
// "cart" for the connected WhatsApp number (Meta's per-number commerce
// settings). Offered by "Check catalog connection". Admins and above.
// ============================================================

import { NextResponse } from 'next/server'

import { requireRole, toErrorResponse } from '@/lib/auth/account'
import { enableCatalogAndCart } from '@/lib/catalog/meta-diagnose'
import { supabaseAdmin } from '@/lib/flows/admin-client'
import { checkRateLimit, rateLimitResponse } from '@/lib/rate-limit'
import { loadCommerce } from '@/lib/whatsapp/commerce'

export async function POST() {
  try {
    const ctx = await requireRole('admin')
    const limit = checkRateLimit(`commerce-enable-cart:${ctx.userId}`, { limit: 3, windowMs: 60_000 })
    if (!limit.success) return rateLimitResponse(limit)
    let loaded
    try {
      loaded = await loadCommerce(supabaseAdmin(), ctx.accountId)
    } catch (err) {
      return NextResponse.json({ error: err instanceof Error ? err.message : 'Connect WhatsApp first.' }, { status: 400 })
    }
    const result = await enableCatalogAndCart(loaded.creds)
    if (!result.ok) return NextResponse.json({ error: result.message }, { status: 502 })
    return NextResponse.json({ ok: true })
  } catch (err) {
    return toErrorResponse(err)
  }
}
