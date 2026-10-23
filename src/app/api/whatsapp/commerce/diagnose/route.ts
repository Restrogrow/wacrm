// ============================================================
// GET /api/whatsapp/commerce/diagnose — "Check catalog connection".
// Asks Meta about every link a product message needs: the sending number,
// its WhatsApp Business Account, the connected catalogs, catalog/cart
// settings and the products Meta sees. Read-only. Admins and above.
// ============================================================

import { NextResponse } from 'next/server'

import { requireRole, toErrorResponse } from '@/lib/auth/account'
import { runCatalogSetupChecks } from '@/lib/catalog/meta-diagnose'
import { supabaseAdmin } from '@/lib/flows/admin-client'
import { checkRateLimit, rateLimitResponse } from '@/lib/rate-limit'
import { loadCommerce } from '@/lib/whatsapp/commerce'

export async function GET() {
  try {
    const ctx = await requireRole('admin')
    const limit = checkRateLimit(`commerce-diagnose:${ctx.userId}`, { limit: 5, windowMs: 60_000 })
    if (!limit.success) return rateLimitResponse(limit)
    let loaded
    try {
      loaded = await loadCommerce(supabaseAdmin(), ctx.accountId)
    } catch (err) {
      return NextResponse.json({ error: err instanceof Error ? err.message : 'Connect WhatsApp first.' }, { status: 400 })
    }
    const checks = await runCatalogSetupChecks(loaded.creds, loaded.settings.catalog_id)
    return NextResponse.json({ checks }, { headers: { 'Cache-Control': 'no-store' } })
  } catch (err) {
    return toErrorResponse(err)
  }
}
