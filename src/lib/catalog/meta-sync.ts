// Sync the product library to the Meta (WhatsApp) catalog.
//
// Uses the account's existing WhatsApp access token and the catalog ID set
// on the Orders & payments page (commerce_settings.catalog_id) and calls
// the Graph "items_batch" endpoint: one UPDATE-with-upsert request per active
// product and one DELETE per removed one. Per-product results are written
// back to products.meta_sync_status / meta_sync_error.
//
// Server-only. Never logs the access token.

import type { SupabaseClient } from '@supabase/supabase-js'

import { supabaseAdmin } from '@/lib/flows/admin-client'
import { SITE_URL } from '@/lib/seo'
import { loadCommerce } from '@/lib/whatsapp/commerce'

import { mapMetaCatalogError, toMetaItem, type GraphErrorShape, type ProductRow } from './core'
import { getProductsByIds } from './products'

const GRAPH = 'https://graph.facebook.com/v21.0'
const CHUNK = 100
/** Products handled by one sync call; the UI calls again while `remaining` > 0. */
const MAX_PER_RUN = 500

export interface SyncResult {
  ok: boolean
  code?: 'no_catalog' | 'no_whatsapp' | 'meta_error'
  message?: string
  synced: number
  skipped: number
  deleted: number
  failed: number
  /** Products still waiting (pending or error) after this run. */
  remaining: number
}

type BatchRequest = { method: 'UPDATE' | 'DELETE'; data: Record<string, unknown> }
type BatchOutcome = { ok: true; handles: string[] } | { ok: false; message: string }

export async function getCatalogId(db: SupabaseClient, accountId: string): Promise<string | null> {
  const { data } = await db.from('commerce_settings').select('catalog_id').eq('account_id', accountId).maybeSingle()
  const id = (data as { catalog_id: string | null } | null)?.catalog_id
  return id && id.trim() ? id.trim() : null
}

async function graphFetch(url: string, init: RequestInit): Promise<{ status: number; json: Record<string, unknown> }> {
  const ctrl = new AbortController()
  const timer = setTimeout(() => ctrl.abort(), 20_000)
  try {
    const res = await fetch(url, { ...init, signal: ctrl.signal })
    const json = (await res.json().catch(() => ({}))) as Record<string, unknown>
    return { status: res.status, json }
  } finally {
    clearTimeout(timer)
  }
}

async function postItemsBatch(catalogId: string, token: string, requests: BatchRequest[]): Promise<BatchOutcome> {
  try {
    const body = new URLSearchParams({
      item_type: 'PRODUCT_ITEM',
      // UPDATE + allow_upsert creates the item when it does not exist yet.
      allow_upsert: 'true',
      requests: JSON.stringify(requests),
    })
    const { status, json } = await graphFetch(`${GRAPH}/${encodeURIComponent(catalogId)}/items_batch`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/x-www-form-urlencoded' },
      body,
    })
    const err = json.error as GraphErrorShape | undefined
    if (err || status >= 400) return { ok: false, message: mapMetaCatalogError(err, status) }
    const handles = Array.isArray(json.handles) ? (json.handles as unknown[]).filter((h): h is string => typeof h === 'string') : []
    return { ok: true, handles }
  } catch (e) {
    const aborted = e instanceof Error && e.name === 'AbortError'
    return { ok: false, message: aborted ? 'Meta took too long to answer. Try again in a minute.' : 'Could not reach Meta. Try again in a minute.' }
  }
}

/** Ask Meta whether it rejected any item in a batch. Returns invalid retailer ids → reason. Best effort. */
async function checkBatch(catalogId: string, token: string, handle: string): Promise<Map<string, string>> {
  const invalid = new Map<string, string>()
  try {
    await new Promise((r) => setTimeout(r, 1500))
    const url = `${GRAPH}/${encodeURIComponent(catalogId)}/check_batch_request_status?handle=${encodeURIComponent(handle)}&load_ids_of_invalid_requests=true`
    const { json } = await graphFetch(url, { headers: { Authorization: `Bearer ${token}` } })
    const first = Array.isArray(json.data) ? (json.data[0] as Record<string, unknown> | undefined) : undefined
    if (!first) return invalid
    const ids = Array.isArray(first.ids_of_invalid_requests) ? (first.ids_of_invalid_requests as unknown[]) : []
    const errors = Array.isArray(first.errors) ? (first.errors as Array<Record<string, unknown>>) : []
    const reason = (typeof errors[0]?.message === 'string' ? (errors[0].message as string) : 'Meta rejected this product.').slice(0, 300)
    for (const id of ids) if (typeof id === 'string') invalid.set(id, reason)
  } catch {
    /* polling is optional */
  }
  return invalid
}

async function setStatus(
  db: SupabaseClient,
  accountId: string,
  ids: string[],
  patch: { meta_sync_status: 'synced' | 'error' | 'skipped' | 'pending'; meta_sync_error?: string | null; meta_synced_at?: string | null },
) {
  if (ids.length === 0) return
  for (let i = 0; i < ids.length; i += 200) {
    await db
      .from('products')
      .update({ meta_sync_error: null, ...patch })
      .eq('account_id', accountId)
      .in('id', ids.slice(i, i + 200))
  }
}

export async function pendingCount(db: SupabaseClient, accountId: string): Promise<number> {
  const { count } = await db
    .from('products')
    .select('id', { count: 'exact', head: true })
    .eq('account_id', accountId)
    .in('meta_sync_status', ['pending', 'error'])
  return count ?? 0
}

/**
 * Push products to the Meta catalog.
 * - `ids` given: just those. Otherwise everything pending or in error.
 * - Active products are created/updated; archived or draft ones that were on
 *   WhatsApp are removed; products without an image are skipped with a reason.
 */
export async function syncProductsToMeta(
  db: SupabaseClient,
  accountId: string,
  opts: { ids?: string[] } = {},
): Promise<SyncResult> {
  const result: SyncResult = { ok: true, synced: 0, skipped: 0, deleted: 0, failed: 0, remaining: 0 }

  const catalogId = await getCatalogId(db, accountId)
  if (!catalogId) {
    return { ...result, ok: false, code: 'no_catalog', message: 'Add your catalog ID in Orders & payments first.' }
  }

  let token: string
  try {
    token = (await loadCommerce(db, accountId)).creds.accessToken
  } catch {
    return { ...result, ok: false, code: 'no_whatsapp', message: 'Connect WhatsApp first (Settings → WhatsApp).' }
  }

  let products: ProductRow[]
  if (opts.ids) {
    products = await getProductsByIds(db, accountId, opts.ids)
  } else {
    const { data } = await db
      .from('products')
      .select('*')
      .eq('account_id', accountId)
      .in('meta_sync_status', ['pending', 'error'])
      .order('updated_at', { ascending: true })
      .limit(MAX_PER_RUN)
    products = (data ?? []) as ProductRow[]
  }
  products = products.slice(0, MAX_PER_RUN)

  const { data: acct } = await db.from('accounts').select('name').eq('id', accountId).maybeSingle()
  const brand = (acct as { name?: string } | null)?.name || 'Store'

  const upserts: Array<{ product: ProductRow; item: NonNullable<ReturnType<typeof toMetaItem>> }> = []
  const removals: ProductRow[] = []
  const skipNoImage: ProductRow[] = []
  const skipInactive: ProductRow[] = []

  for (const p of products) {
    if (p.status === 'active') {
      const item = toMetaItem(p, SITE_URL, brand)
      if (item) upserts.push({ product: p, item })
      else skipNoImage.push(p)
    } else if (p.meta_synced_at) removals.push(p)
    else skipInactive.push(p)
  }

  await setStatus(db, accountId, skipNoImage.map((p) => p.id), {
    meta_sync_status: 'skipped',
    meta_sync_error: 'Add a product photo. WhatsApp catalogs need one.',
  })
  await setStatus(db, accountId, skipInactive.map((p) => p.id), {
    meta_sync_status: 'skipped',
    meta_sync_error: 'Draft and archived products are not shown on WhatsApp.',
  })
  result.skipped = skipNoImage.length + skipInactive.length

  const fail = async (ids: string[], message: string) => {
    await setStatus(db, accountId, ids, { meta_sync_status: 'error', meta_sync_error: message })
    result.failed += ids.length
    result.ok = false
    result.code = 'meta_error'
    result.message = message
  }

  for (let i = 0; i < upserts.length && result.ok; i += CHUNK) {
    const chunk = upserts.slice(i, i + CHUNK)
    const out = await postItemsBatch(
      catalogId,
      token,
      chunk.map((c) => ({ method: 'UPDATE' as const, data: { ...c.item } })),
    )
    if (!out.ok) {
      await fail(chunk.map((c) => c.product.id), out.message)
      break
    }
    const ids = chunk.map((c) => c.product.id)
    await setStatus(db, accountId, ids, { meta_sync_status: 'synced', meta_synced_at: new Date().toISOString() })
    result.synced += ids.length

    if (out.handles[0]) {
      const invalid = await checkBatch(catalogId, token, out.handles[0])
      if (invalid.size > 0) {
        const bad = chunk.filter((c) => invalid.has(c.product.retailer_id))
        for (const c of bad) {
          await setStatus(db, accountId, [c.product.id], {
            meta_sync_status: 'error',
            meta_sync_error: invalid.get(c.product.retailer_id) ?? 'Meta rejected this product.',
            meta_synced_at: null,
          })
        }
        result.synced -= bad.length
        result.failed += bad.length
      }
    }
  }

  for (let i = 0; i < removals.length && result.ok; i += CHUNK) {
    const chunk = removals.slice(i, i + CHUNK)
    const out = await postItemsBatch(
      catalogId,
      token,
      chunk.map((p) => ({ method: 'DELETE' as const, data: { id: p.retailer_id } })),
    )
    if (!out.ok) {
      await fail(chunk.map((p) => p.id), out.message)
      break
    }
    await setStatus(db, accountId, chunk.map((p) => p.id), {
      meta_sync_status: 'skipped',
      meta_sync_error: 'Draft and archived products are not shown on WhatsApp.',
      meta_synced_at: null,
    })
    result.deleted += chunk.length
  }

  result.remaining = await pendingCount(db, accountId)
  return result
}

/** Remove products from the Meta catalog (used before deleting them). Best effort. */
export async function deleteProductsFromMeta(
  db: SupabaseClient,
  accountId: string,
  retailerIds: string[],
): Promise<{ ok: boolean; message?: string }> {
  if (retailerIds.length === 0) return { ok: true }
  const catalogId = await getCatalogId(db, accountId)
  if (!catalogId) return { ok: true }
  let token: string
  try {
    token = (await loadCommerce(db, accountId)).creds.accessToken
  } catch {
    return { ok: true }
  }
  for (let i = 0; i < retailerIds.length; i += CHUNK) {
    const out = await postItemsBatch(
      catalogId,
      token,
      retailerIds.slice(i, i + CHUNK).map((id) => ({ method: 'DELETE' as const, data: { id } })),
    )
    if (!out.ok) return { ok: false, message: out.message }
  }
  return { ok: true }
}

/** Fire-and-forget sync after an edit (no ids = everything pending). Does nothing without a catalog ID and never throws. */
export async function autoSyncProducts(accountId: string, ids?: string[]): Promise<void> {
  try {
    const db = supabaseAdmin()
    if (!(await getCatalogId(db, accountId))) return
    await syncProductsToMeta(db, accountId, ids ? { ids } : {})
  } catch (e) {
    console.error('[catalog] auto-sync failed:', e instanceof Error ? e.message : 'unknown error')
  }
}
