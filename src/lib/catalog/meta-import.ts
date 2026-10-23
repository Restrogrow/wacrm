// Pull the products that already exist in the account's WhatsApp (Meta)
// catalog into the product library, so nobody has to retype them.
//
// Reads GET /{catalog_id}/products with the account's WhatsApp token (the
// same token and catalog ID the push sync uses). By default only products
// that are not in the library yet are created; with `overwrite` the
// existing ones are refreshed from Meta too. Server-only. Never logs the token.

import type { SupabaseClient } from '@supabase/supabase-js'

import { loadCommerce } from '@/lib/whatsapp/commerce'

import { LIMITS, mapMetaCatalogError, type GraphErrorShape, type ProductInput } from './core'
import { getCatalogId } from './meta-sync'
import { productCapacity, upsertProducts } from './products'

const GRAPH = 'https://graph.facebook.com/v21.0'
const FIELDS = 'retailer_id,name,description,price,sale_price,currency,image_url,additional_image_urls,url,availability,brand,category'
const PAGE_SIZE = 100
const MAX_ITEMS = LIMITS.importRows
const MAX_PAGES = 40

export interface MetaImportResult {
  ok: boolean
  code?: 'no_catalog' | 'no_whatsapp' | 'meta_error'
  message?: string
  fetched: number
  created: number
  updated: number
  skipped: number
  /** True when the catalog had more items than one import handles. */
  truncated: boolean
}

type MetaProduct = Record<string, unknown>

/** "₹1,299.00", "1299.00 INR", "1,29,900" → paise. null when it is not a price. */
export function parseMetaPrice(raw: unknown): number | null {
  if (typeof raw === 'number' && Number.isFinite(raw)) return raw >= 0 ? Math.round(raw * 100) : null
  if (typeof raw !== 'string') return null
  const cleaned = raw.replace(/[^\d.,]/g, '').replace(/,/g, '')
  if (!cleaned || !/\d/.test(cleaned)) return null
  const n = Number.parseFloat(cleaned)
  return Number.isFinite(n) && n >= 0 ? Math.round(n * 100) : null
}

function httpsUrl(v: unknown): string | null {
  if (typeof v !== 'string') return null
  try {
    const u = new URL(v.trim())
    return u.protocol === 'https:' || u.protocol === 'http:' ? u.toString().slice(0, 2000) : null
  } catch {
    return null
  }
}

const str = (v: unknown, max: number): string => (typeof v === 'string' ? v.trim().slice(0, max) : '')

/** One Meta catalog item → a product input, or null when it can't be used. */
export function metaItemToInput(item: MetaProduct): ProductInput | null {
  const retailerId = str(item.retailer_id, LIMITS.retailerId)
  const title = str(item.name, LIMITS.title)
  if (!retailerId || !title) return null
  const price = parseMetaPrice(item.price)
  if (price === null) return null
  const sale = parseMetaPrice(item.sale_price)
  const extra = Array.isArray(item.additional_image_urls)
    ? (item.additional_image_urls as unknown[]).map(httpsUrl).filter((u): u is string => !!u).slice(0, LIMITS.maxImages)
    : []
  const currency = str(item.currency, 3).toUpperCase() || 'INR'
  return {
    retailer_id: retailerId,
    title,
    description: str(item.description, LIMITS.description),
    price_paise: price,
    sale_price_paise: sale !== null && sale < price ? sale : null,
    currency: /^[A-Z]{3}$/.test(currency) ? currency : 'INR',
    image_url: httpsUrl(item.image_url),
    additional_image_urls: extra,
    product_url: httpsUrl(item.url),
    brand: str(item.brand, LIMITS.brand) || null,
    category: str(item.category, LIMITS.category) || null,
    availability: str(item.availability, 30).toLowerCase() === 'in stock' ? 'in stock' : 'out of stock',
    source: 'manual',
    status: 'active',
  }
}

async function graphGet(url: string, token: string): Promise<{ status: number; json: Record<string, unknown> }> {
  const ctrl = new AbortController()
  const timer = setTimeout(() => ctrl.abort(), 20_000)
  try {
    const res = await fetch(url, { headers: { Authorization: `Bearer ${token}` }, signal: ctrl.signal })
    const json = (await res.json().catch(() => ({}))) as Record<string, unknown>
    return { status: res.status, json }
  } finally {
    clearTimeout(timer)
  }
}

export async function importFromMetaCatalog(
  db: SupabaseClient,
  accountId: string,
  opts: { overwrite?: boolean } = {},
): Promise<MetaImportResult> {
  const out: MetaImportResult = { ok: true, fetched: 0, created: 0, updated: 0, skipped: 0, truncated: false }

  const catalogId = await getCatalogId(db, accountId)
  if (!catalogId) return { ...out, ok: false, code: 'no_catalog', message: 'Add your catalog ID in Orders & payments first.' }

  let token: string
  try {
    token = (await loadCommerce(db, accountId)).creds.accessToken
  } catch {
    return { ...out, ok: false, code: 'no_whatsapp', message: 'Connect WhatsApp first (Settings → WhatsApp).' }
  }

  // 1. Fetch every page (bounded).
  const items: MetaProduct[] = []
  let url: string | null = `${GRAPH}/${encodeURIComponent(catalogId)}/products?fields=${FIELDS}&limit=${PAGE_SIZE}`
  try {
    for (let page = 0; url && page < MAX_PAGES; page++) {
      const { status, json } = await graphGet(url, token)
      const err = json.error as GraphErrorShape | undefined
      if (err || status >= 400) return { ...out, ok: false, code: 'meta_error', message: mapMetaCatalogError(err, status) }
      for (const it of Array.isArray(json.data) ? (json.data as MetaProduct[]) : []) {
        if (items.length >= MAX_ITEMS) {
          out.truncated = true
          break
        }
        items.push(it)
      }
      const next = (json.paging as { next?: unknown } | undefined)?.next
      // Only follow pagination links that stay on Meta's Graph host.
      url = typeof next === 'string' && /^https:\/\/graph\.facebook\.com\//.test(next) && !out.truncated ? next : null
      if (url && page === MAX_PAGES - 1) out.truncated = true
    }
  } catch (e) {
    const aborted = e instanceof Error && e.name === 'AbortError'
    return { ...out, ok: false, code: 'meta_error', message: aborted ? 'Meta took too long to answer. Try again in a minute.' : 'Could not reach Meta. Try again in a minute.' }
  }
  out.fetched = items.length

  // 2. Map to inputs, dropping unusable items.
  const mapped = new Map<string, ProductInput>()
  for (const it of items) {
    const input = metaItemToInput(it)
    if (input?.retailer_id) mapped.set(input.retailer_id, input)
    else out.skipped++
  }

  // 3. Decide which are new, apply the plan's product cap.
  const ids = [...mapped.keys()]
  const existing = new Set<string>()
  for (let i = 0; i < ids.length; i += 200) {
    const { data } = await db.from('products').select('retailer_id').eq('account_id', accountId).in('retailer_id', ids.slice(i, i + 200))
    for (const r of (data ?? []) as { retailer_id: string }[]) existing.add(r.retailer_id)
  }
  let toWrite = [...mapped.values()].filter((p) => opts.overwrite || !existing.has(p.retailer_id as string))
  const cap = await productCapacity(db, accountId)
  if (cap.remaining !== null) {
    const newOnes = toWrite.filter((p) => !existing.has(p.retailer_id as string))
    const allowedNew = new Set(newOnes.slice(0, cap.remaining).map((p) => p.retailer_id))
    const dropped = newOnes.length - allowedNew.size
    if (dropped > 0) {
      out.skipped += dropped
      toWrite = toWrite.filter((p) => existing.has(p.retailer_id as string) || allowedNew.has(p.retailer_id))
      out.message = `Your plan allows ${cap.limit} products, so ${dropped} were not imported.`
    }
  }
  // Products already in the library are left alone unless `overwrite` is set.
  if (!opts.overwrite) out.skipped += ids.filter((id) => existing.has(id)).length

  // 4. Write, then mark them as already on WhatsApp (they came from there).
  if (toWrite.length > 0) {
    const res = await upsertProducts(db, accountId, toWrite)
    out.created = res.created
    out.updated = res.updated
    const written = toWrite.map((p) => p.retailer_id as string)
    const now = new Date().toISOString()
    for (let i = 0; i < written.length; i += 200) {
      await db
        .from('products')
        .update({ meta_sync_status: 'synced', meta_sync_error: null, meta_synced_at: now })
        .eq('account_id', accountId)
        .in('retailer_id', written.slice(i, i + 200))
    }
  }
  return out
}
