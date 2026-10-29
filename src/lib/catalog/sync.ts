// ============================================================
// Pull products from the account's connected store into `products`.
//
//   Shopify      Admin GraphQL when the store is OAuth-connected and the
//                token has product access; otherwise the store's public
//                /products.json feed (no credentials, no stock counts).
//   WooCommerce  REST v3 with OPTIONAL consumer key / secret (migration 077).
//
// Server-only. Every outbound URL goes through safeFetch (SSRF guard).
// Rows are written with the service-role client to the `products` table
// from catalog part 1 (migration 076).
// ============================================================

import type { SupabaseClient } from '@supabase/supabase-js'

import { getAccessToken, shopifyGraphql, type OAuthStoreRow } from '@/lib/shopify/admin-api'
import { readBodyCapped, safeFetch, UnsafeUrlError } from '@/lib/webhooks/ssrf'
import { decrypt } from '@/lib/whatsapp/encryption'

import { productCapacity } from './products'

import {
  MAX_SYNC_PRODUCTS,
  dedupeRetailerIds,
  flattenShopifyAdmin,
  flattenShopifyPublic,
  flattenWoo,
  type ShopifyAdminProduct,
  type ShopifyPublicProduct,
  type SyncProduct,
  type SyncSource,
  type WooProduct,
  type WooVariation,
} from './flatten'

export class CatalogSyncError extends Error {
  status: number
  constructor(message: string, status = 400) {
    super(message)
    this.name = 'CatalogSyncError'
    this.status = status
  }
}

export interface SyncResult {
  source: SyncSource
  mode: 'shopify-admin' | 'shopify-public' | 'woocommerce'
  fetched: number
  created: number
  updated: number
  /** True when the store has more than MAX_SYNC_PRODUCTS rows. */
  truncated: boolean
  /** New products not added because the plan's product limit was reached. */
  over_limit?: number
  note?: string
}

const MAX_BODY = 12 * 1024 * 1024

async function getJson<T>(url: string, init: RequestInit = {}): Promise<{ status: number; json: T | null }> {
  const res = await safeFetch(url, { ...init, headers: { Accept: 'application/json', ...(init.headers ?? {}) } }, { httpsOnly: true, timeoutMs: 20_000 })
  let json: T | null = null
  try {
    json = JSON.parse(new TextDecoder().decode(await readBodyCapped(res, MAX_BODY))) as T
  } catch {
    json = null
  }
  return { status: res.status, json }
}

// ---------- Shopify ----------

const ADMIN_QUERY = `
query catalogProducts($cursor: String) {
  shop { currencyCode }
  products(first: 25, after: $cursor) {
    pageInfo { hasNextPage endCursor }
    nodes {
      id title handle descriptionHtml vendor productType status onlineStoreUrl
      featuredImage { url }
      images(first: 6) { nodes { url } }
      variants(first: 50) {
        nodes {
          id sku title price compareAtPrice inventoryQuantity availableForSale
          inventoryItem { tracked }
          image { url }
        }
      }
    }
  }
}`

interface AdminPage {
  shop?: { currencyCode?: string }
  products: { pageInfo: { hasNextPage: boolean; endCursor: string | null }; nodes: ShopifyAdminProduct[] }
}

async function fetchShopifyAdmin(store: OAuthStoreRow): Promise<{ rows: SyncProduct[]; truncated: boolean }> {
  const token = await getAccessToken(store)
  const rows: SyncProduct[] = []
  let cursor: string | null = null
  let currency = 'INR'
  let truncated = false
  for (let page = 0; page < 200; page++) {
    const data: AdminPage = await shopifyGraphql<AdminPage>(store.shop_domain, token, ADMIN_QUERY, { cursor })
    currency = data.shop?.currencyCode || currency
    for (const node of data.products.nodes) rows.push(...flattenShopifyAdmin(node, store.shop_domain, currency))
    if (rows.length >= MAX_SYNC_PRODUCTS) {
      truncated = data.products.pageInfo.hasNextPage || rows.length > MAX_SYNC_PRODUCTS
      break
    }
    if (!data.products.pageInfo.hasNextPage) break
    cursor = data.products.pageInfo.endCursor
  }
  return { rows: rows.slice(0, MAX_SYNC_PRODUCTS), truncated }
}

async function fetchShopifyPublic(domain: string): Promise<{ rows: SyncProduct[]; truncated: boolean }> {
  let currency = 'INR'
  try {
    const meta = await getJson<{ currency?: string }>(`https://${domain}/meta.json`)
    if (meta.status === 200 && meta.json?.currency && /^[A-Z]{3}$/.test(meta.json.currency)) currency = meta.json.currency
  } catch {
    /* currency stays INR */
  }

  const rows: SyncProduct[] = []
  let truncated = false
  for (let page = 1; page <= 40; page++) {
    const { status, json } = await getJson<{ products?: ShopifyPublicProduct[] }>(`https://${domain}/products.json?limit=250&page=${page}`)
    if (status !== 200 || !json || !Array.isArray(json.products)) {
      if (page === 1) {
        throw new CatalogSyncError(
          'Could not read the store’s public product feed (it may be password-protected or turned off). Reconnect Shopify with product access, or make the storefront public.',
        )
      }
      break
    }
    if (!json.products.length) break
    for (const p of json.products) rows.push(...flattenShopifyPublic(p, domain, currency))
    if (rows.length >= MAX_SYNC_PRODUCTS) {
      truncated = true
      break
    }
    if (json.products.length < 250) break
  }
  return { rows: rows.slice(0, MAX_SYNC_PRODUCTS), truncated }
}

// ---------- WooCommerce ----------

async function fetchWoo(storeUrl: string, key: string, secret: string): Promise<{ rows: SyncProduct[]; truncated: boolean; currency: string }> {
  const base = storeUrl.replace(/\/+$/, '')
  const auth = { Authorization: `Basic ${Buffer.from(`${key}:${secret}`).toString('base64')}` }

  let currency = 'INR'
  try {
    const c = await getJson<{ value?: string }>(`${base}/wp-json/wc/v3/settings/general/woocommerce_currency`, { headers: auth })
    if (c.status === 200 && c.json?.value && /^[A-Z]{3}$/.test(c.json.value)) currency = c.json.value
  } catch {
    /* keep INR */
  }

  const rows: SyncProduct[] = []
  let truncated = false
  let variationBudget = 150 // variable products whose variations we fetch per sync
  for (let page = 1; page <= 40; page++) {
    const { status, json } = await getJson<WooProduct[]>(`${base}/wp-json/wc/v3/products?per_page=100&page=${page}&status=any`, { headers: auth })
    if (status === 401 || status === 403) throw new CatalogSyncError('WooCommerce rejected the API keys. Check the consumer key and secret (Read permission is enough).')
    if (status !== 200 || !Array.isArray(json)) {
      if (page === 1) throw new CatalogSyncError(`Could not read products from WooCommerce (HTTP ${status}). Check the store URL and that the REST API is enabled.`)
      break
    }
    if (!json.length) break
    for (const p of json) {
      let variations: WooVariation[] = []
      if (p.type === 'variable' && (p.variations?.length ?? 0) > 0 && variationBudget > 0) {
        variationBudget--
        const v = await getJson<WooVariation[]>(`${base}/wp-json/wc/v3/products/${p.id}/variations?per_page=100`, { headers: auth })
        if (v.status === 200 && Array.isArray(v.json)) variations = v.json
      }
      rows.push(...flattenWoo(p, variations, currency))
    }
    if (rows.length >= MAX_SYNC_PRODUCTS) {
      truncated = true
      break
    }
    if (json.length < 100) break
  }
  return { rows: rows.slice(0, MAX_SYNC_PRODUCTS), truncated, currency }
}

// ---------- persistence ----------

const CHUNK = 200

function isMissingTable(err: { code?: string; message?: string } | null): boolean {
  return !!err && (err.code === '42P01' || err.code === 'PGRST205' || /does not exist|schema cache/i.test(err.message ?? ''))
}

// Store-owned fields a sync writes. A known product whose values all
// match is left alone, so the 30-minute auto-sync doesn't flag the whole
// library as "needs WhatsApp sync" (meta_sync_status) on every run.
const SYNCED_FIELDS = [
  'title',
  'description',
  'price_paise',
  'sale_price_paise',
  'currency',
  'image_url',
  'additional_image_urls',
  'product_url',
  'brand',
  'category',
  'availability',
  'stock_qty',
  'status',
] as const

type KnownProduct = { id: string; retailer_id: string } & Partial<Record<(typeof SYNCED_FIELDS)[number], unknown>>

export function productChanged(known: KnownProduct, incoming: SyncProduct): boolean {
  return SYNCED_FIELDS.some((f) => JSON.stringify(known[f] ?? null) !== JSON.stringify(incoming[f] ?? null))
}

/** Insert new rows, update known ones that changed (matched on source + source_id). */
export async function persistProducts(
  db: SupabaseClient,
  accountId: string,
  source: SyncSource,
  incoming: SyncProduct[],
): Promise<{ created: number; updated: number; over_limit: number }> {
  const existing = new Map<string, KnownProduct>()
  const taken = new Set<string>()

  for (let from = 0; ; from += 1000) {
    const { data, error } = await db
      .from('products')
      .select(`id, source, source_id, retailer_id, ${SYNCED_FIELDS.join(', ')}`)
      .eq('account_id', accountId)
      .range(from, from + 999)
    if (error) {
      if (isMissingTable(error)) throw new CatalogSyncError('The product library is not set up yet. Apply the catalog migration (076) first.', 503)
      throw new CatalogSyncError('Could not read your products.', 500)
    }
    for (const r of (data ?? []) as unknown as Array<KnownProduct & { source: string; source_id: string | null }>) {
      taken.add(r.retailer_id)
      if (r.source === source && r.source_id) existing.set(r.source_id, r)
    }
    if (!data || data.length < 1000) break
  }

  const now = new Date().toISOString()
  const toUpdate: SyncProduct[] = incoming.filter((r) => {
    const known = existing.get(r.source_id)
    return known !== undefined && productChanged(known, r)
  })
  let toCreate = dedupeRetailerIds(
    incoming.filter((r) => !existing.has(r.source_id)),
    taken,
  )

  // Respect the plan's product limit (catalog part 1 owns the numbers).
  let overLimit = 0
  try {
    const cap = await productCapacity(db, accountId)
    if (cap.remaining !== null && toCreate.length > cap.remaining) {
      overLimit = toCreate.length - cap.remaining
      toCreate = toCreate.slice(0, cap.remaining)
    }
  } catch {
    /* if the limit cannot be read, do not block the sync */
  }

  const fields = (r: SyncProduct) => ({
    title: r.title,
    description: r.description,
    price_paise: r.price_paise,
    sale_price_paise: r.sale_price_paise,
    currency: r.currency,
    image_url: r.image_url,
    additional_image_urls: r.additional_image_urls,
    product_url: r.product_url,
    brand: r.brand,
    category: r.category,
    availability: r.availability,
    stock_qty: r.stock_qty,
    status: r.status,
    meta_sync_status: 'pending',
    meta_sync_error: null,
    updated_at: now,
  })

  for (let i = 0; i < toCreate.length; i += CHUNK) {
    const batch = toCreate.slice(i, i + CHUNK).map((r) => ({
      account_id: accountId,
      retailer_id: r.retailer_id,
      source: r.source,
      source_id: r.source_id,
      ...fields(r),
    }))
    const { error } = await db.from('products').insert(batch)
    if (error) throw new CatalogSyncError(`Could not save products: ${error.message}`.slice(0, 200), 500)
  }

  for (let i = 0; i < toUpdate.length; i += CHUNK) {
    const batch = toUpdate.slice(i, i + CHUNK).map((r) => {
      const known = existing.get(r.source_id)!
      // The retailer_id (Meta content ID) of a known product never changes.
      return { id: known.id, account_id: accountId, retailer_id: known.retailer_id, source: r.source, source_id: r.source_id, ...fields(r) }
    })
    const { error } = await db.from('products').upsert(batch, { onConflict: 'id' })
    if (error) throw new CatalogSyncError(`Could not update products: ${error.message}`.slice(0, 200), 500)
  }

  return { created: toCreate.length, updated: toUpdate.length, over_limit: overLimit }
}

// ---------- entry points ----------

export async function syncFromShopify(db: SupabaseClient, accountId: string): Promise<SyncResult> {
  const { data: store } = await db
    .from('shopify_stores')
    .select('id, shop_domain, connection_type, access_token, refresh_token, access_token_expires_at, status')
    .eq('account_id', accountId)
    .eq('status', 'active')
    .maybeSingle()
  if (!store) throw new CatalogSyncError('Connect your Shopify store first (Integrations → Shopify).')

  let fetched: { rows: SyncProduct[]; truncated: boolean }
  let mode: SyncResult['mode'] = 'shopify-admin'
  let note: string | undefined
  try {
    if (store.connection_type !== 'oauth' || !store.access_token) throw new Error('no-token')
    fetched = await fetchShopifyAdmin(store as OAuthStoreRow)
  } catch (err) {
    if (err instanceof UnsafeUrlError) throw new CatalogSyncError(err.message)
    // Missing product scope, expired token, or a manually-connected store:
    // fall back to the public feed.
    mode = 'shopify-public'
    note =
      store.connection_type === 'oauth'
        ? 'Used the store’s public product feed: stock counts are not available. Reconnect Shopify with product access to sync stock.'
        : 'Used the store’s public product feed: stock counts are not available.'
    try {
      fetched = await fetchShopifyPublic(store.shop_domain as string)
    } catch (e) {
      if (e instanceof UnsafeUrlError) throw new CatalogSyncError(e.message)
      throw e
    }
  }

  const saved = await persistProducts(db, accountId, 'shopify', fetched.rows)
  return { source: 'shopify', mode, fetched: fetched.rows.length, ...saved, truncated: fetched.truncated, note }
}

export async function syncFromWoo(db: SupabaseClient, accountId: string): Promise<SyncResult> {
  const { data: store } = await db
    .from('woocommerce_stores')
    .select('store_url, api_consumer_key, api_consumer_secret, status')
    .eq('account_id', accountId)
    .eq('status', 'active')
    .maybeSingle()
  if (!store) throw new CatalogSyncError('Connect your WooCommerce store first (Integrations → WooCommerce).')
  if (!store.api_consumer_key || !store.api_consumer_secret) {
    throw new CatalogSyncError('Add your WooCommerce REST API keys first (optional step on the WooCommerce page: WooCommerce → Settings → Advanced → REST API, Read access).')
  }

  let key: string
  let secret: string
  try {
    key = decrypt(store.api_consumer_key as string)
    secret = decrypt(store.api_consumer_secret as string)
  } catch {
    throw new CatalogSyncError('The saved API keys could not be read. Save them again.', 500)
  }

  let fetched: Awaited<ReturnType<typeof fetchWoo>>
  try {
    fetched = await fetchWoo(store.store_url as string, key, secret)
  } catch (err) {
    if (err instanceof UnsafeUrlError) throw new CatalogSyncError(err.message)
    throw err
  }
  const saved = await persistProducts(db, accountId, 'woocommerce', fetched.rows)
  return { source: 'woocommerce', mode: 'woocommerce', fetched: fetched.rows.length, ...saved, truncated: fetched.truncated }
}
