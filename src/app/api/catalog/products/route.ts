// ============================================================
// /api/catalog/products
//   GET   list products (any member) — ?q=&status=&limit=&offset=
//   POST  create a product (agents and above)
// ============================================================

import { NextResponse, after } from 'next/server'

import { getCurrentAccount, requireRole, toErrorResponse } from '@/lib/auth/account'
import { autoSyncProducts, getCatalogId, pendingCount } from '@/lib/catalog/meta-sync'
import { listProducts, productCapacity, upsertProduct, validateProductInput, PRODUCT_STATUSES, type ProductStatus } from '@/lib/catalog/products'
import { supabaseAdmin } from '@/lib/flows/admin-client'
import { checkRateLimit, rateLimitResponse } from '@/lib/rate-limit'

export async function GET(request: Request) {
  try {
    const ctx = await getCurrentAccount()
    const url = new URL(request.url)
    const rawStatus = url.searchParams.get('status') ?? 'all'
    const status = (PRODUCT_STATUSES as readonly string[]).includes(rawStatus) ? (rawStatus as ProductStatus) : 'all'

    const admin = supabaseAdmin()
    const [{ products, total }, capacity, catalogId, needsSync] = await Promise.all([
      listProducts(ctx.supabase, ctx.accountId, {
        q: url.searchParams.get('q') ?? '',
        status,
        limit: Number(url.searchParams.get('limit')) || 100,
        offset: Number(url.searchParams.get('offset')) || 0,
      }),
      productCapacity(admin, ctx.accountId),
      getCatalogId(admin, ctx.accountId),
      // Whole account, not just this page: what "Sync to WhatsApp" will pick up.
      pendingCount(admin, ctx.accountId),
    ])
    return NextResponse.json({
      products,
      total,
      limit: capacity.limit,
      used: capacity.current,
      catalog_configured: !!catalogId,
      needs_sync: needsSync,
    })
  } catch (err) {
    // Migration 076 not applied yet: tell the page instead of failing.
    if (err instanceof Error && /relation .*products.* does not exist|schema cache/i.test(err.message)) {
      return NextResponse.json({ products: [], total: 0, limit: null, used: 0, catalog_configured: false, unavailable: true })
    }
    return toErrorResponse(err)
  }
}

export async function POST(request: Request) {
  try {
    const ctx = await requireRole('agent')
    const limit = checkRateLimit(`catalog-write:${ctx.userId}`, { limit: 120, windowMs: 60_000 })
    if (!limit.success) return rateLimitResponse(limit)

    const parsed = validateProductInput(await request.json().catch(() => null))
    if (!parsed.ok) return NextResponse.json({ error: parsed.errors.join('. ') }, { status: 400 })

    const db = supabaseAdmin()
    const capacity = await productCapacity(db, ctx.accountId)
    if (capacity.remaining !== null && capacity.remaining < 1) {
      return NextResponse.json(
        { error: `Your plan allows up to ${capacity.limit} products. Archive or delete some, or upgrade your plan.`, code: 'product_limit' },
        { status: 403 },
      )
    }

    const { product, created } = await upsertProduct(db, ctx.accountId, { ...parsed.value, source: 'manual', source_id: null })
    after(() => autoSyncProducts(ctx.accountId, [product.id]))
    return NextResponse.json({ product, created }, { status: created ? 201 : 200 })
  } catch (err) {
    if (err instanceof Error && /already used/i.test(err.message)) {
      return NextResponse.json({ error: err.message }, { status: 409 })
    }
    return toErrorResponse(err)
  }
}
