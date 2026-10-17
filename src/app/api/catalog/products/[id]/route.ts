// ============================================================
// /api/catalog/products/[id]
//   PATCH   edit a product (agents and above). The SKU (retailer id) is
//           fixed once created, because Meta links the catalog item to it.
//   DELETE  delete a product, and remove it from the WhatsApp catalog.
// ============================================================

import { NextResponse, after } from 'next/server'

import { requireRole, toErrorResponse } from '@/lib/auth/account'
import { autoSyncProducts, deleteProductsFromMeta } from '@/lib/catalog/meta-sync'
import { getProductsByIds, upsertProduct, validateProductInput } from '@/lib/catalog/products'
import { supabaseAdmin } from '@/lib/flows/admin-client'
import { checkRateLimit, rateLimitResponse } from '@/lib/rate-limit'

type Ctx = { params: Promise<{ id: string }> }

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

export async function PATCH(request: Request, { params }: Ctx) {
  try {
    const ctx = await requireRole('agent')
    const { id } = await params
    if (!UUID.test(id)) return NextResponse.json({ error: 'Not found' }, { status: 404 })

    const limit = checkRateLimit(`catalog-write:${ctx.userId}`, { limit: 120, windowMs: 60_000 })
    if (!limit.success) return rateLimitResponse(limit)

    const patch = ((await request.json().catch(() => null)) ?? {}) as Record<string, unknown>
    const db = supabaseAdmin()
    const [existing] = await getProductsByIds(db, ctx.accountId, [id])
    if (!existing) return NextResponse.json({ error: 'Not found' }, { status: 404 })

    // Merge the edit over the stored product, then validate the whole thing.
    // A new `price` (rupees) replaces the stored paise value.
    const merged: Record<string, unknown> = {
      title: existing.title,
      description: existing.description,
      price_paise: existing.price_paise,
      sale_price_paise: existing.sale_price_paise,
      currency: existing.currency,
      image_url: existing.image_url,
      additional_image_urls: existing.additional_image_urls,
      product_url: existing.product_url,
      brand: existing.brand,
      category: existing.category,
      availability: existing.availability,
      stock_qty: existing.stock_qty,
      status: existing.status,
    }
    for (const key of Object.keys(merged)) {
      if (key in patch) merged[key] = patch[key]
    }
    if ('price' in patch && !('price_paise' in patch)) merged.price_paise = undefined
    if ('price' in patch) merged.price = patch.price
    if ('sale_price' in patch && !('sale_price_paise' in patch)) {
      merged.sale_price_paise = undefined
      merged.sale_price = patch.sale_price
    }

    const parsed = validateProductInput(merged)
    if (!parsed.ok) return NextResponse.json({ error: parsed.errors.join('. ') }, { status: 400 })

    const { product } = await upsertProduct(db, ctx.accountId, {
      ...parsed.value,
      retailer_id: existing.retailer_id,
      source: existing.source,
      source_id: existing.source_id,
    })
    after(() => autoSyncProducts(ctx.accountId, [product.id]))
    return NextResponse.json({ product })
  } catch (err) {
    return toErrorResponse(err)
  }
}

export async function DELETE(_request: Request, { params }: Ctx) {
  try {
    const ctx = await requireRole('agent')
    const { id } = await params
    if (!UUID.test(id)) return NextResponse.json({ error: 'Not found' }, { status: 404 })

    const db = supabaseAdmin()
    const [existing] = await getProductsByIds(db, ctx.accountId, [id])
    if (!existing) return NextResponse.json({ error: 'Not found' }, { status: 404 })

    // Take it off WhatsApp first, so a customer cannot order a deleted product.
    let warning: string | undefined
    if (existing.meta_synced_at) {
      const out = await deleteProductsFromMeta(db, ctx.accountId, [existing.retailer_id])
      if (!out.ok) warning = `Deleted here, but it could not be removed from WhatsApp: ${out.message}`
    }
    const { error } = await db.from('products').delete().eq('id', id).eq('account_id', ctx.accountId)
    if (error) {
      console.error('[catalog] delete failed:', error.message)
      return NextResponse.json({ error: 'Something went wrong. Please try again.' }, { status: 500 })
    }
    return NextResponse.json({ ok: true, warning })
  } catch (err) {
    return toErrorResponse(err)
  }
}
