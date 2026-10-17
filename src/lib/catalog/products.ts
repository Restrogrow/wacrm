// Server-only database helpers for the product library (migration 076).
// Always call these with the service-role client AFTER checking the caller's
// account and role: every query here is scoped by the accountId you pass.
// Pure helpers (validation, price formatting, Meta mapping) are in ./core and
// re-exported so other code can import everything from one place.

import type { SupabaseClient } from '@supabase/supabase-js'

import { loadEffectivePlan } from '@/lib/billing/server'

import { productLimitFor, slugRetailerId, type ProductInput, type ProductRow, type ProductStatus } from './core'

export * from './core'

const PRODUCT_COLUMNS =
  'id, account_id, retailer_id, title, description, price_paise, sale_price_paise, currency, image_url, additional_image_urls, product_url, brand, category, availability, stock_qty, source, source_id, status, meta_sync_status, meta_sync_error, meta_synced_at, created_at, updated_at'

/** Strip characters that could break out of a PostgREST .or() filter. */
export function sanitizeSearch(raw: string): string {
  return raw.replace(/[^\p{L}\p{N} +@.\-_]/gu, '').trim()
}

// ------------------------------------------------------------
// Reads
// ------------------------------------------------------------

export interface ListProductsOptions {
  q?: string
  status?: ProductStatus | 'all'
  limit?: number
  offset?: number
}

export async function listProducts(
  db: SupabaseClient,
  accountId: string,
  opts: ListProductsOptions = {},
): Promise<{ products: ProductRow[]; total: number }> {
  const limit = Math.min(Math.max(Math.floor(opts.limit ?? 100), 1), 500)
  const offset = Math.max(Math.floor(opts.offset ?? 0), 0)

  let query = db
    .from('products')
    .select(PRODUCT_COLUMNS, { count: 'exact' })
    .eq('account_id', accountId)
    .order('updated_at', { ascending: false })
    .range(offset, offset + limit - 1)

  if (opts.status && opts.status !== 'all') query = query.eq('status', opts.status)
  const q = sanitizeSearch(opts.q ?? '')
  if (q) query = query.or(`title.ilike.%${q}%,retailer_id.ilike.%${q}%,category.ilike.%${q}%`)

  const { data, count, error } = await query
  if (error) throw new Error(error.message)
  return { products: (data ?? []) as ProductRow[], total: count ?? 0 }
}

export async function getProductsByIds(db: SupabaseClient, accountId: string, ids: string[]): Promise<ProductRow[]> {
  if (ids.length === 0) return []
  const out: ProductRow[] = []
  for (let i = 0; i < ids.length; i += 200) {
    const { data, error } = await db
      .from('products')
      .select(PRODUCT_COLUMNS)
      .eq('account_id', accountId)
      .in('id', ids.slice(i, i + 200))
    if (error) throw new Error(error.message)
    out.push(...((data ?? []) as ProductRow[]))
  }
  return out
}

export async function countProducts(db: SupabaseClient, accountId: string): Promise<number> {
  const { count, error } = await db.from('products').select('id', { count: 'exact', head: true }).eq('account_id', accountId)
  if (error) throw new Error(error.message)
  return count ?? 0
}

/** How many more products can this account add right now? */
export async function productCapacity(
  db: SupabaseClient,
  accountId: string,
): Promise<{ limit: number | null; current: number; remaining: number | null }> {
  const [plan, current] = await Promise.all([loadEffectivePlan(accountId, db), countProducts(db, accountId)])
  const limit = productLimitFor(plan)
  return { limit, current, remaining: limit === null ? null : Math.max(0, limit - current) }
}

// ------------------------------------------------------------
// Writes
// ------------------------------------------------------------

/** First free retailer id for a title: "kurta", "kurta-2", "kurta-3"… */
export async function uniqueRetailerId(db: SupabaseClient, accountId: string, title: string, taken: Set<string> = new Set()): Promise<string> {
  const base = slugRetailerId(title)
  const { data } = await db
    .from('products')
    .select('retailer_id')
    .eq('account_id', accountId)
    .like('retailer_id', `${base}%`)
    .limit(500)
  const used = new Set<string>([...taken, ...((data ?? []) as { retailer_id: string }[]).map((r) => r.retailer_id)])
  if (!used.has(base)) return base
  for (let n = 2; n < 10_000; n++) {
    const candidate = `${base}-${n}`
    if (!used.has(candidate)) return candidate
  }
  return `${base}-${Date.now()}`
}

function toRow(accountId: string, input: ProductInput, retailerId: string) {
  return {
    account_id: accountId,
    retailer_id: retailerId,
    title: input.title,
    description: input.description ?? '',
    price_paise: input.price_paise,
    sale_price_paise: input.sale_price_paise ?? null,
    currency: input.currency ?? 'INR',
    image_url: input.image_url ?? null,
    additional_image_urls: input.additional_image_urls ?? [],
    product_url: input.product_url ?? null,
    brand: input.brand ?? null,
    category: input.category ?? null,
    availability: input.availability ?? 'in stock',
    stock_qty: input.stock_qty ?? null,
    source: input.source ?? 'manual',
    source_id: input.source_id ?? null,
    status: input.status ?? 'active',
    // Any content change has to reach Meta again.
    meta_sync_status: 'pending' as const,
    meta_sync_error: null,
    updated_at: new Date().toISOString(),
  }
}

/**
 * Create or update one product. Matches an existing row by
 * (source, source_id) for store-synced products, otherwise by retailer id.
 * With no retailer id given, one is made from the title and kept unique.
 */
export async function upsertProduct(
  db: SupabaseClient,
  accountId: string,
  input: ProductInput,
): Promise<{ product: ProductRow; created: boolean }> {
  let existing: ProductRow | null = null

  if (input.source_id && input.source && input.source !== 'manual') {
    const { data } = await db
      .from('products')
      .select(PRODUCT_COLUMNS)
      .eq('account_id', accountId)
      .eq('source', input.source)
      .eq('source_id', input.source_id)
      .maybeSingle()
    existing = (data as ProductRow | null) ?? null
  }
  if (!existing && input.retailer_id) {
    const { data } = await db
      .from('products')
      .select(PRODUCT_COLUMNS)
      .eq('account_id', accountId)
      .eq('retailer_id', input.retailer_id)
      .maybeSingle()
    existing = (data as ProductRow | null) ?? null
  }

  if (existing) {
    const row = toRow(accountId, input, existing.retailer_id)
    const { data, error } = await db.from('products').update(row).eq('id', existing.id).eq('account_id', accountId).select(PRODUCT_COLUMNS).single()
    if (error) throw new Error(error.message)
    return { product: data as ProductRow, created: false }
  }

  for (let attempt = 0; attempt < 3; attempt++) {
    const retailerId = input.retailer_id || (await uniqueRetailerId(db, accountId, input.title))
    const { data, error } = await db.from('products').insert(toRow(accountId, input, retailerId)).select(PRODUCT_COLUMNS).single()
    if (!error) return { product: data as ProductRow, created: true }
    // A clash on a generated id (two writers at once): try again with a fresh one.
    if (error.code === '23505' && !input.retailer_id) continue
    if (error.code === '23505') throw new Error('That SKU is already used by another product.')
    throw new Error(error.message)
  }
  throw new Error('Could not create the product. Please try again.')
}

/** Bulk upsert for CSV import. Matches by retailer id; makes ids for rows without one. */
export async function upsertProducts(
  db: SupabaseClient,
  accountId: string,
  inputs: ProductInput[],
): Promise<{ created: number; updated: number }> {
  const taken = new Set<string>()
  const rows: ReturnType<typeof toRow>[] = []
  for (const input of inputs) {
    const id = input.retailer_id || (await uniqueRetailerId(db, accountId, input.title, taken))
    taken.add(id)
    rows.push(toRow(accountId, input, id))
  }
  // Same SKU twice in one file: the last row wins.
  const byId = new Map(rows.map((r) => [r.retailer_id, r]))
  const unique = [...byId.values()]

  const existingIds = new Set<string>()
  for (let i = 0; i < unique.length; i += 200) {
    const { data, error } = await db
      .from('products')
      .select('retailer_id')
      .eq('account_id', accountId)
      .in('retailer_id', unique.slice(i, i + 200).map((r) => r.retailer_id))
    if (error) throw new Error(error.message)
    for (const r of (data ?? []) as { retailer_id: string }[]) existingIds.add(r.retailer_id)
  }

  // Existing rows keep their source (a store-synced product stays linked to
  // its store), so they are written without the source columns.
  const fresh = unique.filter((r) => !existingIds.has(r.retailer_id))
  const existing = unique
    .filter((r) => existingIds.has(r.retailer_id))
    .map((r) => {
      const { source, source_id, ...rest } = r
      void source
      void source_id
      return rest
    })
  for (const batch of [fresh, existing]) {
    for (let i = 0; i < batch.length; i += 200) {
      const { error } = await db.from('products').upsert(batch.slice(i, i + 200), { onConflict: 'account_id,retailer_id' })
      if (error) throw new Error(error.message)
    }
  }
  return { created: fresh.length, updated: existing.length }
}
