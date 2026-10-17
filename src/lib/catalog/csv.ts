// CSV import/export for the product library. Pure and client-safe.
//
// Import accepts our own template plus the usual Shopify and WooCommerce
// product exports (headers are matched loosely: "Variant SKU", "Image Src",
// "Regular price", "Stock status"…). Export reuses the formula-injection
// guard from the reports CSV writer.

import { toCsv, type CsvColumn } from '@/lib/reports/csv'

import {
  LIMITS,
  parsePriceToPaise,
  validateProductInput,
  type ProductAvailability,
  type ProductInput,
  type ProductRow,
  type ProductStatus,
} from './core'

// ------------------------------------------------------------
// Tokenizer
// ------------------------------------------------------------

/** RFC 4180 parser: quoted fields, escaped quotes, CRLF/LF, BOM; comma, semicolon or tab separated. */
export function parseCsv(input: string): string[][] {
  const textIn = input.replace(/^﻿/, '')
  const firstLine = textIn.split(/\r?\n/, 1)[0] ?? ''
  const counts = { ',': 0, ';': 0, '\t': 0 }
  let inQ = false
  for (const ch of firstLine) {
    if (ch === '"') inQ = !inQ
    else if (!inQ && ch in counts) counts[ch as keyof typeof counts]++
  }
  const delim = (Object.entries(counts).sort((a, b) => b[1] - a[1])[0][1] > 0
    ? Object.entries(counts).sort((a, b) => b[1] - a[1])[0][0]
    : ',') as string

  const rows: string[][] = []
  let row: string[] = []
  let cell = ''
  let quoted = false
  for (let i = 0; i < textIn.length; i++) {
    const ch = textIn[i]
    if (quoted) {
      if (ch === '"') {
        if (textIn[i + 1] === '"') {
          cell += '"'
          i++
        } else quoted = false
      } else cell += ch
    } else if (ch === '"' && cell === '') {
      quoted = true
    } else if (ch === delim) {
      row.push(cell)
      cell = ''
    } else if (ch === '\n' || ch === '\r') {
      if (ch === '\r' && textIn[i + 1] === '\n') i++
      row.push(cell)
      cell = ''
      rows.push(row)
      row = []
    } else cell += ch
  }
  if (cell !== '' || row.length) {
    row.push(cell)
    rows.push(row)
  }
  return rows.filter((r) => r.some((c) => c.trim() !== ''))
}

// ------------------------------------------------------------
// Header mapping
// ------------------------------------------------------------

type Field =
  | 'retailer_id'
  | 'title'
  | 'description'
  | 'price'
  | 'sale_price'
  | 'compare_at'
  | 'image'
  | 'extra_images'
  | 'stock'
  | 'availability'
  | 'category'
  | 'brand'
  | 'link'
  | 'status'
  | 'currency'

/** Per field, accepted header names (normalised) in priority order. */
const ALIASES: Record<Field, string[]> = {
  retailer_id: ['sku', 'variantsku', 'retailerid', 'contentid', 'itemid', 'id'],
  title: ['title', 'name', 'productname', 'producttitle', 'itemname'],
  description: ['description', 'bodyhtml', 'body', 'productdescription', 'shortdescription'],
  price: ['price', 'regularprice', 'variantprice', 'sellingprice', 'mrp'],
  sale_price: ['saleprice', 'discountedprice', 'offerprice'],
  compare_at: ['compareatprice', 'variantcompareatprice'],
  image: ['imageurl', 'image', 'imagesrc', 'imagelink', 'images', 'photo'],
  extra_images: ['additionalimages', 'additionalimagelink', 'extraimages'],
  stock: ['stock', 'stockquantity', 'quantity', 'inventory', 'inventoryquantity', 'variantinventoryqty', 'qty'],
  availability: ['availability', 'stockstatus', 'instock'],
  category: ['category', 'categories', 'producttype', 'type'],
  brand: ['brand', 'vendor'],
  link: ['producturl', 'link', 'url', 'permalink'],
  status: ['status', 'published'],
  currency: ['currency'],
}

const norm = (h: string) => h.toLowerCase().replace(/[^a-z0-9]/g, '')

export function mapHeaders(headers: string[]): { index: Partial<Record<Field, number>>; unmapped: string[] } {
  const normed = headers.map(norm)
  const index: Partial<Record<Field, number>> = {}
  const used = new Set<number>()
  for (const field of Object.keys(ALIASES) as Field[]) {
    for (const alias of ALIASES[field]) {
      const i = normed.indexOf(alias)
      if (i !== -1 && !used.has(i)) {
        index[field] = i
        used.add(i)
        break
      }
    }
  }
  const unmapped = headers.filter((_, i) => !used.has(i) && headers[i].trim() !== '')
  return { index, unmapped }
}

// ------------------------------------------------------------
// Cell cleaners
// ------------------------------------------------------------

export function stripHtml(html: string): string {
  return html
    .replace(/<\s*br\s*\/?>/gi, '\n')
    .replace(/<\/(p|div|li|h[1-6])>/gi, '\n')
    .replace(/<[^>]*>/g, '')
    .replace(/&nbsp;/gi, ' ')
    .replace(/&amp;/gi, '&')
    .replace(/&lt;/gi, '<')
    .replace(/&gt;/gi, '>')
    .replace(/&quot;/gi, '"')
    .replace(/&#0?39;/g, "'")
    .replace(/[ \t]+/g, ' ')
    .replace(/\n\s*\n+/g, '\n')
    .trim()
}

function parseAvailability(v: string): ProductAvailability | undefined {
  const s = v.trim().toLowerCase().replace(/[\s_-]/g, '')
  if (['instock', 'yes', 'true', '1', 'onbackorder', 'available'].includes(s)) return 'in stock'
  if (['outofstock', 'no', 'false', '0', 'soldout', 'unavailable'].includes(s)) return 'out of stock'
  return undefined
}

function parseStatus(v: string): ProductStatus | undefined {
  const s = v.trim().toLowerCase()
  if (['active', 'publish', 'published', 'true', 'yes', '1'].includes(s)) return 'active'
  if (['draft', 'private', 'pending', 'false', 'no', '0', 'unpublished'].includes(s)) return 'draft'
  if (s === 'archived') return 'archived'
  return undefined
}

function splitImages(v: string): string[] {
  return v
    .split(/[\s,|]+/)
    .map((s) => s.trim())
    .filter(Boolean)
}

// ------------------------------------------------------------
// Import
// ------------------------------------------------------------

export interface ParsedProductsCsv {
  rows: { line: number; input: ProductInput }[]
  errors: { line: number; message: string }[]
  /** Rows that only carried extra images/variants (no title, price or SKU). */
  ignored: number
  /** Columns we did not recognise. */
  unmapped: string[]
  /** Fields we found, for the "we read your file like this" summary. */
  mapped: Partial<Record<Field, string>>
  dataRows: number
}

export function parseProductsCsv(csvText: string): ParsedProductsCsv {
  const table = parseCsv(csvText)
  const empty: ParsedProductsCsv = { rows: [], errors: [], ignored: 0, unmapped: [], mapped: {}, dataRows: 0 }
  if (table.length === 0) return { ...empty, errors: [{ line: 1, message: 'The file is empty.' }] }

  const headers = table[0]
  const { index, unmapped } = mapHeaders(headers)
  const mapped: ParsedProductsCsv['mapped'] = {}
  for (const f of Object.keys(index) as Field[]) mapped[f] = headers[index[f]!]
  const data = table.slice(1)

  if (index.title === undefined || index.price === undefined) {
    return {
      ...empty,
      unmapped,
      mapped,
      errors: [{ line: 1, message: `We need a "title" (or "name") column and a "price" column. Found: ${headers.join(', ').slice(0, 200)}` }],
    }
  }
  if (data.length > LIMITS.importRows) {
    return { ...empty, unmapped, mapped, dataRows: data.length, errors: [{ line: 1, message: `Too many rows (${data.length}). Import up to ${LIMITS.importRows} products at a time.` }] }
  }

  const cell = (r: string[], f: Field) => (index[f] === undefined ? '' : (r[index[f]!] ?? '').trim())
  const out: ParsedProductsCsv = { ...empty, unmapped, mapped, dataRows: data.length }

  data.forEach((r, i) => {
    const line = i + 2
    const title = cell(r, 'title')
    const priceRaw = cell(r, 'price')
    const sku = cell(r, 'retailer_id')

    if (!title && !priceRaw && !sku) {
      out.ignored++
      return
    }

    // Shopify: "Compare At Price" is the original price when the sold price is lower.
    let price = priceRaw
    let sale = cell(r, 'sale_price')
    const compare = cell(r, 'compare_at')
    if (compare && parsePriceToPaise(compare) > parsePriceToPaise(priceRaw || '0')) {
      sale = priceRaw
      price = compare
    }
    // WooCommerce: a sale price equal to or above the price is meaningless; drop it quietly.
    if (sale && parsePriceToPaise(sale) >= parsePriceToPaise(price)) sale = ''

    const images = splitImages(cell(r, 'image'))
    const extra = [...images.slice(1), ...splitImages(cell(r, 'extra_images'))]
    const category = cell(r, 'category').split(',')[0].trim()

    const candidate: Record<string, unknown> = {
      retailer_id: sku || undefined,
      title,
      description: stripHtml(cell(r, 'description')),
      price: price,
      sale_price: sale || undefined,
      currency: cell(r, 'currency') || undefined,
      image_url: images[0] ?? '',
      additional_image_urls: extra,
      product_url: cell(r, 'link'),
      brand: cell(r, 'brand'),
      category,
      stock_qty: cell(r, 'stock') === '' ? undefined : cell(r, 'stock'),
      availability: parseAvailability(cell(r, 'availability')),
      status: parseStatus(cell(r, 'status')),
      source: 'csv',
    }

    // Stock like "12.0" from spreadsheets: whole numbers only.
    if (typeof candidate.stock_qty === 'string') {
      const n = Number(candidate.stock_qty)
      candidate.stock_qty = Number.isFinite(n) ? Math.floor(n) : candidate.stock_qty
    }

    const result = validateProductInput(candidate)
    if (result.ok) out.rows.push({ line, input: result.value })
    else out.errors.push({ line, message: result.errors.join('; ') })
  })

  return out
}

// ------------------------------------------------------------
// Export + template
// ------------------------------------------------------------

const rupees = (paise: number | null) => (paise === null || paise === undefined ? '' : (paise / 100).toFixed(2))

const EXPORT_COLUMNS: CsvColumn<ProductRow>[] = [
  { header: 'sku', value: (p) => p.retailer_id },
  { header: 'title', value: (p) => p.title },
  { header: 'description', value: (p) => p.description },
  { header: 'price', value: (p) => rupees(p.price_paise) },
  { header: 'sale_price', value: (p) => rupees(p.sale_price_paise) },
  { header: 'currency', value: (p) => p.currency },
  { header: 'stock', value: (p) => p.stock_qty },
  { header: 'availability', value: (p) => p.availability },
  { header: 'image_url', value: (p) => p.image_url },
  { header: 'additional_images', value: (p) => (p.additional_image_urls ?? []).join(' ') },
  { header: 'product_url', value: (p) => p.product_url },
  { header: 'brand', value: (p) => p.brand },
  { header: 'category', value: (p) => p.category },
  { header: 'status', value: (p) => p.status },
]

export function productsToCsv(products: ProductRow[]): string {
  return toCsv(EXPORT_COLUMNS, products)
}

export const PRODUCT_CSV_TEMPLATE = [
  'sku,title,description,price,sale_price,currency,stock,availability,image_url,additional_images,product_url,brand,category,status',
  'KURTA-BLUE-M,Blue Cotton Kurta,Soft cotton kurta for everyday wear,1299,999,INR,25,in stock,https://example.com/images/kurta.jpg,,https://example.com/kurta,Your Brand,Clothing,active',
  'MUG-WHITE,White Ceramic Mug,350 ml dishwasher-safe mug,349,,INR,,in stock,https://example.com/images/mug.jpg,,,,Home,active',
].join('\r\n')
