// ============================================================
// /api/catalog/sync
//   GET  — which stores can be synced + product counts per source (agent+)
//   POST — { source: 'shopify' | 'woocommerce' } pull products into the
//          product library (admin+). Rate limited; capped at 2000 rows.
// ============================================================

import { NextResponse } from 'next/server'

import { requireRole, toErrorResponse } from '@/lib/auth/account'
import { supabaseAdmin } from '@/lib/flows/admin-client'
import { CatalogSyncError, syncFromShopify, syncFromWoo } from '@/lib/catalog/sync'
import { checkRateLimit, rateLimitResponse } from '@/lib/rate-limit'

export async function GET() {
  try {
    const ctx = await requireRole('agent')
    const db = supabaseAdmin()
    const [shopify, woo] = await Promise.all([
      db.from('shopify_stores').select('shop_domain, connection_type, access_token').eq('account_id', ctx.accountId).eq('status', 'active').maybeSingle(),
      db.from('woocommerce_stores').select('store_url, api_consumer_key').eq('account_id', ctx.accountId).eq('status', 'active').maybeSingle(),
    ])
    const counts: Record<string, number> = {}
    for (const source of ['shopify', 'woocommerce']) {
      const { count } = await db.from('products').select('id', { count: 'exact', head: true }).eq('account_id', ctx.accountId).eq('source', source)
      counts[source] = count ?? 0
    }
    return NextResponse.json({
      shopify: shopify.data
        ? { connected: true, domain: shopify.data.shop_domain, has_admin_access: shopify.data.connection_type === 'oauth' && !!shopify.data.access_token }
        : { connected: false },
      woocommerce: woo.data ? { connected: true, url: woo.data.store_url, has_api_keys: !!woo.data.api_consumer_key } : { connected: false },
      counts,
    })
  } catch (err) {
    return toErrorResponse(err)
  }
}

export async function POST(request: Request) {
  try {
    const ctx = await requireRole('admin')
    const limit = checkRateLimit(`catalog-sync:${ctx.userId}`, { limit: 6, windowMs: 10 * 60_000 })
    if (!limit.success) return rateLimitResponse(limit)

    const body = (await request.json().catch(() => null)) as { source?: unknown } | null
    const db = supabaseAdmin()
    try {
      if (body?.source === 'shopify') return NextResponse.json(await syncFromShopify(db, ctx.accountId))
      if (body?.source === 'woocommerce') return NextResponse.json(await syncFromWoo(db, ctx.accountId))
    } catch (err) {
      if (err instanceof CatalogSyncError) return NextResponse.json({ error: err.message }, { status: err.status })
      console.error('[catalog-sync] failed:', err instanceof Error ? err.message : err)
      return NextResponse.json({ error: 'Sync failed. Please try again.' }, { status: 500 })
    }
    return NextResponse.json({ error: 'Choose a store to sync.' }, { status: 400 })
  } catch (err) {
    return toErrorResponse(err)
  }
}
