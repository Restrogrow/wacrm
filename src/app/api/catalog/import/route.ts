// ============================================================
// POST /api/catalog/import  { csv: string, dry_run?: boolean }
// Agents and above. Up to 2,000 rows and 5 MB of text. With dry_run the
// file is only checked and nothing is written, so the page can show a
// validation report before the real import.
// ============================================================

import { NextResponse, after } from 'next/server'

import { requireRole, toErrorResponse } from '@/lib/auth/account'
import { parseProductsCsv } from '@/lib/catalog/csv'
import { autoSyncProducts } from '@/lib/catalog/meta-sync'
import { productCapacity, upsertProducts } from '@/lib/catalog/products'
import { supabaseAdmin } from '@/lib/flows/admin-client'
import { checkRateLimit, rateLimitResponse } from '@/lib/rate-limit'

const MAX_CHARS = 5_000_000

export async function POST(request: Request) {
  try {
    const ctx = await requireRole('agent')
    const limit = checkRateLimit(`catalog-import:${ctx.userId}`, { limit: 10, windowMs: 60_000 })
    if (!limit.success) return rateLimitResponse(limit)

    const body = (await request.json().catch(() => null)) as { csv?: unknown; dry_run?: unknown } | null
    if (typeof body?.csv !== 'string' || !body.csv.trim()) return NextResponse.json({ error: 'Choose a CSV file first.' }, { status: 400 })
    if (body.csv.length > MAX_CHARS) return NextResponse.json({ error: 'That file is too large. Keep it under 5 MB.' }, { status: 413 })

    const parsed = parseProductsCsv(body.csv)
    const summary = {
      valid: parsed.rows.length,
      invalid: parsed.errors.length,
      ignored: parsed.ignored,
      errors: parsed.errors.slice(0, 50),
      mapped: parsed.mapped,
      unmapped: parsed.unmapped,
    }

    // A file-level problem (missing columns, too many rows).
    if (parsed.rows.length === 0 && parsed.errors.length > 0 && parsed.dataRows === 0) {
      return NextResponse.json({ ...summary, error: parsed.errors[0].message }, { status: 400 })
    }
    if (parsed.errors.length > 0 && parsed.rows.length === 0 && parsed.errors[0].line === 1) {
      return NextResponse.json({ ...summary, error: parsed.errors[0].message }, { status: 400 })
    }

    const db = supabaseAdmin()
    const capacity = await productCapacity(db, ctx.accountId)
    // Rows can update existing products, so this is an upper bound on growth.
    if (capacity.remaining !== null && parsed.rows.length > capacity.remaining) {
      const note = `Your plan allows up to ${capacity.limit} products and you have ${capacity.current}. This file has ${parsed.rows.length}.`
      if (body.dry_run) return NextResponse.json({ ...summary, warning: `${note} Remove some rows, archive products, or upgrade.` })
      // Only block when the file would really exceed the cap: count genuinely new SKUs.
      const skus = parsed.rows.map((r) => r.input.retailer_id).filter((s): s is string => !!s)
      let existingCount = 0
      for (let i = 0; i < skus.length; i += 200) {
        const { count } = await db
          .from('products')
          .select('id', { count: 'exact', head: true })
          .eq('account_id', ctx.accountId)
          .in('retailer_id', skus.slice(i, i + 200))
        existingCount += count ?? 0
      }
      const newRows = parsed.rows.length - existingCount
      if (newRows > capacity.remaining) {
        return NextResponse.json({ ...summary, error: `${note} Remove some rows or upgrade your plan.`, code: 'product_limit' }, { status: 403 })
      }
    }

    if (body.dry_run === true) return NextResponse.json({ ...summary, dry_run: true })
    if (parsed.rows.length === 0) return NextResponse.json({ ...summary, error: 'No valid rows to import.' }, { status: 400 })

    const { created, updated } = await upsertProducts(db, ctx.accountId, parsed.rows.map((r) => r.input))
    after(() => autoSyncProducts(ctx.accountId))
    return NextResponse.json({ ...summary, created, updated })
  } catch (err) {
    return toErrorResponse(err)
  }
}
