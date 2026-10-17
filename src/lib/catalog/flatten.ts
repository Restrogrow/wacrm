// ============================================================
// Turns products from a store (Shopify Admin API, Shopify public
// /products.json, WooCommerce REST) into rows for the `products` table:
// ONE row per variant. Pure functions, no network, no database.
// ============================================================

export type SyncSource = 'shopify' | 'woocommerce'

export interface SyncProduct {
  source: SyncSource
  /** Stable id in the store: the variant id (Shopify) or product / variation id (Woo). */
  source_id: string
  retailer_id: string
  title: string
  description: string
  price_paise: number
  sale_price_paise: number | null
  currency: string
  image_url: string | null
  additional_image_urls: string[]
  product_url: string | null
  brand: string | null
  category: string | null
  availability: 'in stock' | 'out of stock'
  /** null = stock is not tracked in the store. */
  stock_qty: number | null
  status: 'active' | 'draft' | 'archived'
}

export const MAX_SYNC_PRODUCTS = 2000

// ---------- small helpers ----------

export function stripHtml(input: unknown, max = 5000): string {
  if (typeof input !== 'string') return ''
  return input
    .replace(/<(script|style)[\s\S]*?<\/\1>/gi, ' ')
    .replace(/<br\s*\/?>/gi, '\n')
    .replace(/<\/(p|div|li|h[1-6])>/gi, '\n')
    .replace(/<[^>]*>/g, ' ')
    .replace(/&nbsp;/g, ' ')
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/[ \t]+/g, ' ')
    .replace(/\n\s*\n+/g, '\n')
    .trim()
    .slice(0, max)
}

/** "1,299.50" / "499" / 499 → paise. Returns null for blanks and junk. */
export function priceToPaise(value: unknown): number | null {
  if (value === null || value === undefined || value === '') return null
  const n = typeof value === 'number' ? value : Number(String(value).replace(/[,\s₹]/g, ''))
  if (!Number.isFinite(n) || n < 0) return null
  return Math.round(n * 100)
}

/** Only https image / product links are kept (Meta's catalog needs https). */
export function httpsUrl(value: unknown): string | null {
  if (typeof value !== 'string') return null
  let s = value.trim()
  if (s.startsWith('//')) s = `https:${s}`
  try {
    const u = new URL(s)
    return u.protocol === 'https:' ? u.toString() : null
  } catch {
    return null
  }
}

/** Meta content IDs: letters, digits, `_ - .`, up to 100 characters. */
export function cleanRetailerId(value: string): string {
  return value
    .trim()
    .replace(/[^A-Za-z0-9_.-]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 100)
}

function lastNumericId(gidOrId: unknown): string {
  const s = String(gidOrId ?? '')
  const m = /(\d+)\s*$/.exec(s)
  return m ? m[1] : s
}

/** Regular price + optional lower sale price → the two paise fields. */
export function resolvePrices(regular: unknown, compareOrSale: { compareAt?: unknown; sale?: unknown }): {
  price_paise: number
  sale_price_paise: number | null
} | null {
  const current = priceToPaise(compareOrSale.sale ?? regular)
  const compareAt = priceToPaise(compareOrSale.compareAt)
  const reg = priceToPaise(regular)
  // Shopify style: `price` is what customers pay, `compare_at_price` the crossed-out one.
  if (compareOrSale.compareAt !== undefined) {
    if (current === null || current <= 0) return null
    if (compareAt !== null && compareAt > current) return { price_paise: compareAt, sale_price_paise: current }
    return { price_paise: current, sale_price_paise: null }
  }
  // Woo style: regular_price + sale_price.
  const base = reg ?? current
  if (base === null || base <= 0) return null
  const sale = priceToPaise(compareOrSale.sale)
  return { price_paise: base, sale_price_paise: sale !== null && sale > 0 && sale < base ? sale : null }
}

function variantTitle(base: string, variant: string | null | undefined): string {
  const v = (variant ?? '').trim()
  const t = !v || /^default title$/i.test(v) ? base : `${base} – ${v}`
  return t.slice(0, 150)
}

// ---------- Shopify (Admin GraphQL) ----------

export interface ShopifyAdminProduct {
  id: string
  title: string
  handle: string
  descriptionHtml?: string | null
  vendor?: string | null
  productType?: string | null
  status?: string | null
  onlineStoreUrl?: string | null
  featuredImage?: { url?: string | null } | null
  images?: { nodes?: { url?: string | null }[] } | null
  variants?: {
    nodes?: {
      id: string
      sku?: string | null
      title?: string | null
      price?: string | null
      compareAtPrice?: string | null
      inventoryQuantity?: number | null
      availableForSale?: boolean | null
      inventoryItem?: { tracked?: boolean | null } | null
      image?: { url?: string | null } | null
    }[]
  } | null
}

export function flattenShopifyAdmin(p: ShopifyAdminProduct, shopDomain: string, currency = 'INR'): SyncProduct[] {
  const out: SyncProduct[] = []
  const images = [p.featuredImage?.url, ...(p.images?.nodes ?? []).map((i) => i.url)].map(httpsUrl).filter((u): u is string => !!u)
  const status: SyncProduct['status'] = p.status === 'DRAFT' ? 'draft' : p.status === 'ARCHIVED' ? 'archived' : 'active'
  const url = httpsUrl(p.onlineStoreUrl) ?? httpsUrl(`https://${shopDomain}/products/${p.handle}`)

  for (const v of p.variants?.nodes ?? []) {
    const prices = resolvePrices(v.price, { compareAt: v.compareAtPrice })
    if (!prices) continue
    const variantId = lastNumericId(v.id)
    const tracked = !!v.inventoryItem?.tracked
    const qty = tracked ? Math.max(0, Math.floor(Number(v.inventoryQuantity ?? 0))) : null
    const image = httpsUrl(v.image?.url) ?? images[0] ?? null
    out.push({
      source: 'shopify',
      source_id: variantId,
      retailer_id: cleanRetailerId(v.sku?.trim() || `${p.handle}-${variantId}`) || `shopify-${variantId}`,
      title: variantTitle(p.title, v.title),
      description: stripHtml(p.descriptionHtml),
      ...prices,
      currency,
      image_url: image,
      additional_image_urls: images.filter((i) => i !== image).slice(0, 9),
      product_url: url,
      brand: p.vendor?.trim() || null,
      category: p.productType?.trim() || null,
      availability: qty !== null ? (qty > 0 ? 'in stock' : 'out of stock') : v.availableForSale === false ? 'out of stock' : 'in stock',
      stock_qty: qty,
      status,
    })
  }
  return out
}

// ---------- Shopify (public /products.json, no credentials) ----------

export interface ShopifyPublicProduct {
  id: number | string
  title: string
  handle: string
  body_html?: string | null
  vendor?: string | null
  product_type?: string | null
  images?: { id?: number | string; src?: string | null }[]
  variants?: {
    id: number | string
    title?: string | null
    sku?: string | null
    price?: string | null
    compare_at_price?: string | null
    available?: boolean | null
    featured_image?: { src?: string | null } | null
  }[]
}

export function flattenShopifyPublic(p: ShopifyPublicProduct, shopDomain: string, currency = 'INR'): SyncProduct[] {
  const out: SyncProduct[] = []
  const images = (p.images ?? []).map((i) => httpsUrl(i.src)).filter((u): u is string => !!u)
  const url = httpsUrl(`https://${shopDomain}/products/${p.handle}`)
  for (const v of p.variants ?? []) {
    const prices = resolvePrices(v.price, { compareAt: v.compare_at_price })
    if (!prices) continue
    const variantId = lastNumericId(v.id)
    const image = httpsUrl(v.featured_image?.src) ?? images[0] ?? null
    out.push({
      source: 'shopify',
      source_id: variantId,
      retailer_id: cleanRetailerId(v.sku?.trim() || `${p.handle}-${variantId}`) || `shopify-${variantId}`,
      title: variantTitle(p.title, v.title),
      description: stripHtml(p.body_html),
      ...prices,
      currency,
      image_url: image,
      additional_image_urls: images.filter((i) => i !== image).slice(0, 9),
      product_url: url,
      brand: p.vendor?.trim() || null,
      category: p.product_type?.trim() || null,
      availability: v.available === false ? 'out of stock' : 'in stock',
      stock_qty: null, // the public feed never exposes quantities
      status: 'active',
    })
  }
  return out
}

// ---------- WooCommerce REST v3 ----------

export interface WooVariation {
  id: number
  sku?: string | null
  price?: string | null
  regular_price?: string | null
  sale_price?: string | null
  stock_status?: string | null
  manage_stock?: boolean | null
  stock_quantity?: number | null
  image?: { src?: string | null } | null
  attributes?: { name?: string; option?: string }[]
}

export interface WooProduct {
  id: number
  name: string
  type?: string
  status?: string
  sku?: string | null
  price?: string | null
  regular_price?: string | null
  sale_price?: string | null
  permalink?: string | null
  description?: string | null
  short_description?: string | null
  images?: { src?: string | null }[]
  categories?: { name?: string }[]
  brands?: { name?: string }[]
  stock_status?: string | null
  manage_stock?: boolean | null
  stock_quantity?: number | null
  variations?: number[]
}

function wooStatus(status: string | undefined): SyncProduct['status'] {
  return status === 'publish' ? 'active' : 'draft'
}

function wooStock(v: { stock_status?: string | null; manage_stock?: boolean | null; stock_quantity?: number | null }): {
  availability: SyncProduct['availability']
  stock_qty: number | null
} {
  const qty = v.manage_stock && typeof v.stock_quantity === 'number' ? Math.max(0, Math.floor(v.stock_quantity)) : null
  if (qty !== null) return { availability: qty > 0 ? 'in stock' : 'out of stock', stock_qty: qty }
  return { availability: v.stock_status === 'outofstock' ? 'out of stock' : 'in stock', stock_qty: null }
}

/** `variations` are only needed for variable products (fetched by the caller). */
export function flattenWoo(p: WooProduct, variations: WooVariation[] = [], currency = 'INR'): SyncProduct[] {
  const images = (p.images ?? []).map((i) => httpsUrl(i.src)).filter((u): u is string => !!u)
  const description = stripHtml(p.description || p.short_description)
  const category = p.categories?.[0]?.name?.trim() || null
  const brand = p.brands?.[0]?.name?.trim() || null
  const url = httpsUrl(p.permalink)
  const status = wooStatus(p.status)

  const base = (): Omit<SyncProduct, 'source_id' | 'retailer_id' | 'title' | 'price_paise' | 'sale_price_paise' | 'image_url' | 'availability' | 'stock_qty'> => ({
    source: 'woocommerce',
    description,
    currency,
    additional_image_urls: [],
    product_url: url,
    brand,
    category,
    status,
  })

  if (p.type === 'variable' && variations.length) {
    const out: SyncProduct[] = []
    for (const v of variations) {
      const prices = resolvePrices(v.regular_price || v.price, { sale: v.sale_price })
      if (!prices) continue
      const label = (v.attributes ?? []).map((a) => a.option).filter(Boolean).join(' / ')
      const image = httpsUrl(v.image?.src) ?? images[0] ?? null
      out.push({
        ...base(),
        source_id: `${p.id}-${v.id}`,
        retailer_id: cleanRetailerId(v.sku?.trim() || `woo-${p.id}-${v.id}`) || `woo-${p.id}-${v.id}`,
        title: variantTitle(p.name, label),
        ...prices,
        image_url: image,
        additional_image_urls: images.filter((i) => i !== image).slice(0, 9),
        ...wooStock(v),
      })
    }
    return out
  }

  const prices = resolvePrices(p.regular_price || p.price, { sale: p.sale_price })
  if (!prices) return []
  return [
    {
      ...base(),
      source_id: String(p.id),
      retailer_id: cleanRetailerId(p.sku?.trim() || `woo-${p.id}`) || `woo-${p.id}`,
      title: p.name.slice(0, 150),
      ...prices,
      image_url: images[0] ?? null,
      additional_image_urls: images.slice(1, 10),
      ...wooStock(p),
    },
  ]
}

// ---------- shared ----------

/** Make retailer IDs unique inside one batch and against ones already used. */
export function dedupeRetailerIds(rows: SyncProduct[], taken: Set<string>): SyncProduct[] {
  const used = new Set(taken)
  return rows.map((r) => {
    let id = r.retailer_id
    if (used.has(id)) {
      const suffix = `-${r.source_id}`.replace(/[^A-Za-z0-9_.-]+/g, '-')
      id = cleanRetailerId(`${r.retailer_id.slice(0, 100 - suffix.length)}${suffix}`)
      let n = 2
      while (used.has(id)) id = cleanRetailerId(`${r.retailer_id.slice(0, 96 - String(n).length)}-${n++}`)
    }
    used.add(id)
    return id === r.retailer_id ? r : { ...r, retailer_id: id }
  })
}
