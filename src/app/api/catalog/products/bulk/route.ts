// ============================================================
// POST /api/catalog/products/bulk  { action: 'archive' | 'activate' | 'delete', ids: string[] }
// Agents and above. At most 200 ids per call; every id must belong to the
// caller's account (others are ignored, never touched).
// ============================================================

import { NextResponse, after } from 'next/server'

import { requireRole, toErrorResponse } from '@/lib/auth/account'
import { autoSyncProducts, deleteProductsFromMeta } from '@/lib/catalog/meta-sync'
import { getProductsByIds } from '@/lib/catalog/products'
import { supabaseAdmin } from '@/lib/flows/admin-client'
import { checkRateLimit, rateLimitResponse } from '@/lib/rate-limit'

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i
const ACTIONS = ['archive', 'activate', 'delete'] as const

export async function POST(request: Request) {
  try {
    const ctx = await requireRole('agent')
    const limit = checkRateLimit(`catalog-write:${ctx.userId}`, { limit: 60, windowMs: 60_000 })
    if (!limit.success) return rateLimitResponse(limit)

    const body = (await request.json().catch(() => null)) as { action?: unknown; ids?: unknown } | null
    const action = body?.action
    if (typeof action !== 'string' || !(ACTIONS as readonly string[]).includes(action)) {
      return NextResponse.json({ error: 'Unknown action' }, { status: 400 })
    }
    if (!Array.isArray(body?.ids) || body.ids.length === 0) return NextResponse.json({ error: 'Select at least one product' }, { status: 400 })
    if (body.ids.length > 200) return NextResponse.json({ error: 'Select at most 200 products at a time' }, { status: 400 })
    const ids = Array.from(new Set(body.ids.filter((i): i is string => typeof i === 'string' && UUID.test(i))))
    if (ids.length === 0) return NextResponse.json({ error: 'Invalid selection' }, { status: 400 })

    const db = supabaseAdmin()
    const found = await getProductsByIds(db, ctx.accountId, ids)
    if (found.length === 0) return NextResponse.json({ error: 'Not found' }, { status: 404 })
    const foundIds = found.map((p) => p.id)

    if (action === 'delete') {
      const onMeta = found.filter((p) => p.meta_synced_at).map((p) => p.retailer_id)
      let warning: string | undefined
      if (onMeta.length) {
        const out = await deleteProductsFromMeta(db, ctx.accountId, onMeta)
        if (!out.ok) warning = `Deleted here, but some could not be removed from WhatsApp: ${out.message}`
      }
      const { error } = await db.from('products').delete().eq('account_id', ctx.accountId).in('id', foundIds)
      if (error) {
        console.error('[catalog] bulk delete failed:', error.message)
        return NextResponse.json({ error: 'Something went wrong. Please try again.' }, { status: 500 })
      }
      return NextResponse.json({ ok: true, count: foundIds.length, warning })
    }

    const { error } = await db
      .from('products')
      .update({
        status: action === 'archive' ? 'archived' : 'active',
        meta_sync_status: 'pending',
        meta_sync_error: null,
        updated_at: new Date().toISOString(),
      })
      .eq('account_id', ctx.accountId)
      .in('id', foundIds)
    if (error) {
      console.error('[catalog] bulk update failed:', error.message)
      return NextResponse.json({ error: 'Something went wrong. Please try again.' }, { status: 500 })
    }
    after(() => autoSyncProducts(ctx.accountId, foundIds))
    return NextResponse.json({ ok: true, count: foundIds.length })
  } catch (err) {
    return toErrorResponse(err)
  }
}
