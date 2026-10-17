// ============================================================
// Server helper for catalog orders: look up the product-library rows
// behind a customer's cart so the order can show real product names and a
// stock check. Never throws — if the library is missing (migration 076)
// or the query fails, the order flow simply carries on without it.
// ============================================================

import type { SupabaseClient } from '@supabase/supabase-js'

import type { StockProduct } from './stock'

export async function lookupCartProducts(
  db: SupabaseClient,
  accountId: string,
  retailerIds: (string | null | undefined)[],
): Promise<Record<string, StockProduct>> {
  const ids = Array.from(new Set(retailerIds.filter((v): v is string => typeof v === 'string' && v.length > 0))).slice(0, 100)
  if (!ids.length) return {}
  try {
    const res = (await db
      .from('products')
      .select('retailer_id, title, stock_qty, availability')
      .eq('account_id', accountId)
      .in('retailer_id', ids)) as { data?: unknown; error?: unknown } | undefined
    const rows = Array.isArray(res?.data) ? (res!.data as StockProduct[]) : []
    const out: Record<string, StockProduct> = {}
    for (const r of rows) {
      if (r && typeof r.retailer_id === 'string') {
        out[r.retailer_id] = {
          retailer_id: r.retailer_id,
          title: String(r.title ?? r.retailer_id),
          stock_qty: typeof r.stock_qty === 'number' ? r.stock_qty : null,
          availability: r.availability ?? null,
        }
      }
    }
    return out
  } catch {
    return {}
  }
}
