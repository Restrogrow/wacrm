// Pure (client-safe) catalog helpers: types, validation, price formatting,
// retailer-id generation, the Meta item mapper and the plan caps.
// Server-only database helpers live in ./products.ts, which re-exports this.

import { isHttpUrl } from '@/lib/url'

export const PRODUCT_AVAILABILITY = ['in stock', 'out of stock'] as const
export type ProductAvailability = (typeof PRODUCT_AVAILABILITY)[number]
export const PRODUCT_STATUSES = ['active', 'draft', 'archived'] as const
export type ProductStatus = (typeof PRODUCT_STATUSES)[number]
export const PRODUCT_SOURCES = ['manual', 'csv', 'shopify', 'woocommerce'] as const
export type ProductSource = (typeof PRODUCT_SOURCES)[number]
export type MetaSyncStatus = 'pending' | 'synced' | 'error' | 'skipped'

export interface ProductRow {
  id: string
  account_id: string
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
  availability: ProductAvailability
  stock_qty: number | null
  source: ProductSource
  source_id: string | null
  status: ProductStatus
  meta_sync_status: MetaSyncStatus
  meta_sync_error: string | null
  meta_synced_at: string | null
  created_at: string
  updated_at: string
}

/** What callers pass to upsertProduct. Everything but title and price is optional. */
export interface ProductInput {
  retailer_id?: string | null
  title: string
  description?: string
  price_paise: number
  sale_price_paise?: number | null
  currency?: string
  image_url?: string | null
  additional_image_urls?: string[]
  product_url?: string | null
  brand?: string | null
  category?: string | null
  availability?: ProductAvailability
  stock_qty?: number | null
  source?: ProductSource
  source_id?: string | null
  status?: ProductStatus
}

export const LIMITS = {
  title: 150,
  description: 5000,
  retailerId: 100,
  maxImages: 10,
  importRows: 2000,
  brand: 100,
  category: 100,
} as const

/** Products an account may keep, by effective plan. null = no cap. */
export const PRODUCT_LIMITS: Record<string, number | null> = {
  trial: 500,
  expired: 500,
  starter: 500,
  growth: 2000,
  pro: 10000,
  enterprise: null,
}

export function productLimitFor(plan: string | null | undefined): number | null {
  if (!plan) return PRODUCT_LIMITS.starter
  return plan in PRODUCT_LIMITS ? PRODUCT_LIMITS[plan] : PRODUCT_LIMITS.starter
}

// ------------------------------------------------------------
// Prices
// ------------------------------------------------------------

/** "₹1,299.00" for INR, "USD 12.50" for anything else. */
export function formatPrice(paise: number, currency = 'INR'): string {
  const value = (Number.isFinite(paise) ? paise : 0) / 100
  const cur = (currency || 'INR').toUpperCase()
  if (cur === 'INR') {
    return `₹${value.toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`
  }
  return `${cur} ${value.toFixed(2)}`
}

/** Meta wants "1299.00 INR". */
export function metaPrice(paise: number, currency = 'INR'): string {
  return `${(Math.max(0, Math.round(paise)) / 100).toFixed(2)} ${(currency || 'INR').toUpperCase()}`
}

/** "1,299.50", "₹ 1299", "Rs. 99" → paise. NaN when it is not a price. */
export function parsePriceToPaise(raw: unknown): number {
  if (typeof raw === 'number') return Number.isFinite(raw) && raw >= 0 ? Math.round(raw * 100) : NaN
  if (typeof raw !== 'string') return NaN
  const cleaned = raw.replace(/rs\.?|inr|₹|\s/gi, '').replace(/,/g, '')
  if (!/^\d+(\.\d{1,4})?$/.test(cleaned)) return NaN
  return Math.round(parseFloat(cleaned) * 100)
}

// ------------------------------------------------------------
// Retailer ids
// ------------------------------------------------------------

const RETAILER_ID_RE = /^[A-Za-z0-9._-]{1,100}$/

/** Make a Meta-safe retailer id from a SKU the merchant typed (spaces become dashes). */
export function sanitizeRetailerId(raw: string): string | null {
  const id = raw.trim().replace(/\s+/g, '-').replace(/[^A-Za-z0-9._-]/g, '')
  return RETAILER_ID_RE.test(id) ? id : null
}

/** "Blue Cotton Kurta (M)" → "blue-cotton-kurta-m". */
export function slugRetailerId(title: string): string {
  const slug = title
    .toLowerCase()
    .normalize('NFKD')
    .replace(/[̀-ͯ]/g, '')
    .replace(/&/g, ' and ')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 60)
    .replace(/-+$/g, '')
  return slug || 'product'
}

// ------------------------------------------------------------
// Validation
// ------------------------------------------------------------

function text(v: unknown, max: number): string {
  return typeof v === 'string' ? v.trim().slice(0, max) : ''
}

export type ValidationResult = { ok: true; value: ProductInput } | { ok: false; errors: string[] }

/**
 * Validate and normalise a product from the API or the CSV importer.
 * `price` (rupees) and `price_paise` are both accepted; paise wins.
 * Unknown keys are dropped.
 */
export function validateProductInput(raw: unknown): ValidationResult {
  if (!raw || typeof raw !== 'object') return { ok: false, errors: ['Invalid product'] }
  const b = raw as Record<string, unknown>
  const errors: string[] = []

  const title = text(b.title, LIMITS.title)
  if (!title) errors.push('Title is required')

  let price = NaN
  if (b.price_paise !== undefined && b.price_paise !== null && b.price_paise !== '') {
    const n = Number(b.price_paise)
    price = Number.isInteger(n) && n >= 0 && n <= 2_000_000_000 ? n : NaN
  } else if (b.price !== undefined && b.price !== null && b.price !== '') {
    price = parsePriceToPaise(b.price)
  }
  if (!Number.isFinite(price)) errors.push('Price must be a number, like 499 or 1299.50')

  let sale: number | null = null
  const rawSale = b.sale_price_paise !== undefined ? b.sale_price_paise : b.sale_price
  if (rawSale !== undefined && rawSale !== null && rawSale !== '') {
    sale = b.sale_price_paise !== undefined ? Number(rawSale) : parsePriceToPaise(rawSale)
    if (!Number.isInteger(sale) || sale < 0) {
      errors.push('Sale price must be a number')
      sale = null
    } else if (Number.isFinite(price) && sale >= price) {
      errors.push('Sale price must be lower than the price')
      sale = null
    }
  }

  let retailerId: string | null = null
  if (typeof b.retailer_id === 'string' && b.retailer_id.trim()) {
    retailerId = sanitizeRetailerId(b.retailer_id)
    if (!retailerId) errors.push('SKU can only contain letters, numbers, dots, dashes and underscores (max 100)')
  }

  const image = text(b.image_url, 2000)
  if (image && !isHttpUrl(image)) errors.push('Image must be a web link starting with https://')
  const link = text(b.product_url, 2000)
  if (link && !isHttpUrl(link)) errors.push('Product link must start with https://')

  const extra: string[] = []
  if (Array.isArray(b.additional_image_urls)) {
    for (const u of b.additional_image_urls) {
      const s = text(u, 2000)
      if (!s) continue
      if (!isHttpUrl(s)) errors.push(`Extra image is not a web link: ${s.slice(0, 40)}`)
      else extra.push(s)
    }
  }

  let stock: number | null = null
  if (b.stock_qty !== undefined && b.stock_qty !== null && b.stock_qty !== '') {
    const n = Number(b.stock_qty)
    if (!Number.isInteger(n) || n < 0 || n > 10_000_000) errors.push('Stock must be a whole number, 0 or more')
    else stock = n
  }

  let availability: ProductAvailability = 'in stock'
  if (b.availability !== undefined && b.availability !== null && b.availability !== '') {
    if (!(PRODUCT_AVAILABILITY as readonly string[]).includes(b.availability as string)) {
      errors.push('Availability must be "in stock" or "out of stock"')
    } else availability = b.availability as ProductAvailability
  }
  // Tracked stock decides availability.
  if (stock !== null) availability = stock > 0 ? 'in stock' : 'out of stock'

  let status: ProductStatus = 'active'
  if (b.status !== undefined && b.status !== null && b.status !== '') {
    if (!(PRODUCT_STATUSES as readonly string[]).includes(b.status as string)) errors.push('Status must be active, draft or archived')
    else status = b.status as ProductStatus
  }

  let source: ProductSource = 'manual'
  if (typeof b.source === 'string' && (PRODUCT_SOURCES as readonly string[]).includes(b.source)) source = b.source as ProductSource

  const currency = text(b.currency, 3).toUpperCase() || 'INR'
  if (!/^[A-Z]{3}$/.test(currency)) errors.push('Currency must be a 3-letter code like INR')

  if (errors.length) return { ok: false, errors }

  return {
    ok: true,
    value: {
      retailer_id: retailerId,
      title,
      description: text(b.description, LIMITS.description),
      price_paise: price,
      sale_price_paise: sale,
      currency,
      image_url: image || null,
      additional_image_urls: extra.slice(0, LIMITS.maxImages),
      product_url: link || null,
      brand: text(b.brand, LIMITS.brand) || null,
      category: text(b.category, LIMITS.category) || null,
      availability,
      stock_qty: stock,
      source,
      source_id: text(b.source_id, 200) || null,
      status,
    },
  }
}

// ------------------------------------------------------------
// Meta catalog mapping
// ------------------------------------------------------------

export interface MetaItem {
  id: string
  title: string
  description: string
  availability: ProductAvailability
  condition: 'new'
  price: string
  link: string
  image_link: string
  brand: string
  sale_price?: string
  google_product_category?: string
  additional_image_link?: string
}

export type SyncableProduct = Pick<
  ProductRow,
  | 'retailer_id'
  | 'title'
  | 'description'
  | 'price_paise'
  | 'sale_price_paise'
  | 'currency'
  | 'image_url'
  | 'additional_image_urls'
  | 'product_url'
  | 'brand'
  | 'category'
  | 'availability'
  | 'stock_qty'
>

/**
 * Map a product to the fields the Meta catalog batch API expects.
 * Meta requires a link, an image and a brand: `siteUrl` and `defaultBrand`
 * fill in when the merchant left them empty. Returns null when the product
 * has no image (Meta rejects those), so callers can mark it as skipped.
 */
export function toMetaItem(product: SyncableProduct, siteUrl: string, defaultBrand = 'Store'): MetaItem | null {
  if (!product.image_url) return null
  const stock = product.stock_qty
  const availability: ProductAvailability = stock !== null && stock !== undefined ? (stock > 0 ? 'in stock' : 'out of stock') : product.availability

  const item: MetaItem = {
    id: product.retailer_id,
    title: product.title.slice(0, 150),
    description: (product.description || product.title).slice(0, 5000),
    availability,
    condition: 'new',
    price: metaPrice(product.price_paise, product.currency),
    link: product.product_url || siteUrl,
    image_link: product.image_url,
    brand: (product.brand || defaultBrand).slice(0, 100),
  }
  if (product.sale_price_paise !== null && product.sale_price_paise !== undefined && product.sale_price_paise < product.price_paise) {
    item.sale_price = metaPrice(product.sale_price_paise, product.currency)
  }
  if (product.category) item.google_product_category = product.category.slice(0, 250)
  if (product.additional_image_urls?.length) item.additional_image_link = product.additional_image_urls.slice(0, 9).join(',')
  return item
}

// ------------------------------------------------------------
// Meta (Graph) error mapping
// ------------------------------------------------------------

export interface GraphErrorShape {
  code?: number
  error_subcode?: number
  message?: string
  error_user_msg?: string
  type?: string
}

/** Turn a Graph API error into plain language for the merchant. */
export function mapMetaCatalogError(err: GraphErrorShape | null | undefined, httpStatus?: number): string {
  if (!err) return httpStatus ? `Meta returned an error (HTTP ${httpStatus}).` : 'Meta returned an error.'
  const msg = `${err.error_user_msg ?? ''} ${err.message ?? ''}`.toLowerCase()
  if (err.code === 190) return 'Your WhatsApp access token has expired. Reconnect WhatsApp in Settings, then sync again.'
  if (err.code === 10 || err.code === 200 || err.code === 299 || msg.includes('permission')) {
    return 'Your WhatsApp access token needs catalog_management permission. Add it to your Meta system user, then sync again.'
  }
  if (err.code === 100 && /(object with id|does not exist|unsupported get request|unknown path)/.test(msg)) {
    return 'Meta could not find that catalog. Check the catalog ID in Orders & payments.'
  }
  if (err.code === 4 || err.code === 17 || err.code === 32 || err.code === 613) {
    return 'Meta is rate limiting catalog updates. Wait a few minutes and sync again.'
  }
  return (err.error_user_msg || err.message || 'Meta rejected the catalog update.').slice(0, 300)
}
