import { describe, expect, it } from 'vitest'

import {
  cleanRetailerId,
  dedupeRetailerIds,
  flattenShopifyAdmin,
  flattenShopifyPublic,
  flattenWoo,
  httpsUrl,
  priceToPaise,
  resolvePrices,
  stripHtml,
  type ShopifyAdminProduct,
  type SyncProduct,
  type WooProduct,
} from './flatten'
import { applyOnce, checkCartStock, crossedLowStock, planRestock, planSale, stockIssueLines } from './stock'
import {
  MAX_PRODUCTS_PER_LIST,
  ProductListError,
  buildProductListMessage,
  groupIntoSections,
  normaliseRetailerIds,
  parseCollectionInput,
  validateProductList,
} from './messages'

describe('price and text helpers', () => {
  it('parses prices to paise', () => {
    expect(priceToPaise('499.00')).toBe(49900)
    expect(priceToPaise('1,299.50')).toBe(129950)
    expect(priceToPaise(10)).toBe(1000)
    expect(priceToPaise('')).toBeNull()
    expect(priceToPaise('free')).toBeNull()
    expect(priceToPaise('-5')).toBeNull()
  })

  it('treats compare-at as the regular price and price as the sale price', () => {
    expect(resolvePrices('799', { compareAt: '999' })).toEqual({ price_paise: 99900, sale_price_paise: 79900 })
    expect(resolvePrices('799', { compareAt: null })).toEqual({ price_paise: 79900, sale_price_paise: null })
    // A compare-at LOWER than the price is ignored.
    expect(resolvePrices('799', { compareAt: '500' })).toEqual({ price_paise: 79900, sale_price_paise: null })
    expect(resolvePrices('0', { compareAt: null })).toBeNull()
  })

  it('handles Woo regular/sale prices', () => {
    expect(resolvePrices('1000', { sale: '800' })).toEqual({ price_paise: 100000, sale_price_paise: 80000 })
    expect(resolvePrices('1000', { sale: '' })).toEqual({ price_paise: 100000, sale_price_paise: null })
    expect(resolvePrices('1000', { sale: '1200' })).toEqual({ price_paise: 100000, sale_price_paise: null })
  })

  it('keeps only https links and strips html', () => {
    expect(httpsUrl('http://x.com/a.jpg')).toBeNull()
    expect(httpsUrl('//cdn.x.com/a.jpg')).toBe('https://cdn.x.com/a.jpg')
    expect(httpsUrl('javascript:alert(1)')).toBeNull()
    expect(stripHtml('<p>Soft <b>cotton</b></p><script>x()</script>')).toBe('Soft cotton')
    expect(cleanRetailerId(' Blue Kurta / M ')).toBe('Blue-Kurta-M')
    expect(cleanRetailerId('a'.repeat(150))).toHaveLength(100)
  })
})

describe('Shopify flattening', () => {
  const product: ShopifyAdminProduct = {
    id: 'gid://shopify/Product/1',
    title: 'Cotton Kurta',
    handle: 'cotton-kurta',
    descriptionHtml: '<p>Soft</p>',
    vendor: 'Loom',
    productType: 'Kurtas',
    status: 'ACTIVE',
    onlineStoreUrl: null,
    featuredImage: { url: 'https://cdn.shopify.com/a.jpg' },
    images: { nodes: [{ url: 'https://cdn.shopify.com/a.jpg' }, { url: 'https://cdn.shopify.com/b.jpg' }] },
    variants: {
      nodes: [
        { id: 'gid://shopify/ProductVariant/11', sku: 'KUR-M', title: 'M', price: '799.00', compareAtPrice: '999.00', inventoryQuantity: 4, availableForSale: true, inventoryItem: { tracked: true } },
        { id: 'gid://shopify/ProductVariant/12', sku: '', title: 'Default Title', price: '599.00', compareAtPrice: null, inventoryQuantity: 0, availableForSale: true, inventoryItem: { tracked: false } },
        { id: 'gid://shopify/ProductVariant/13', sku: 'KUR-XL', title: 'XL', price: '0.00', inventoryItem: { tracked: true }, inventoryQuantity: 3 },
      ],
    },
  }

  it('makes one row per variant with SKU or handle-based retailer ids', () => {
    const rows = flattenShopifyAdmin(product, 'shop.myshopify.com')
    expect(rows).toHaveLength(2) // the ₹0 variant is skipped
    expect(rows[0]).toMatchObject({
      source: 'shopify',
      source_id: '11',
      retailer_id: 'KUR-M',
      title: 'Cotton Kurta – M',
      price_paise: 99900,
      sale_price_paise: 79900,
      stock_qty: 4,
      availability: 'in stock',
      brand: 'Loom',
      category: 'Kurtas',
      status: 'active',
      product_url: 'https://shop.myshopify.com/products/cotton-kurta',
    })
    expect(rows[1]).toMatchObject({ source_id: '12', retailer_id: 'cotton-kurta-12', title: 'Cotton Kurta', stock_qty: null, availability: 'in stock' })
    expect(rows[0].additional_image_urls).toEqual(['https://cdn.shopify.com/b.jpg'])
  })

  it('marks tracked variants with zero stock out of stock', () => {
    const rows = flattenShopifyAdmin(
      { ...product, variants: { nodes: [{ id: '5', sku: 'Z', price: '10', inventoryQuantity: 0, inventoryItem: { tracked: true } }] } },
      's.myshopify.com',
    )
    expect(rows[0]).toMatchObject({ stock_qty: 0, availability: 'out of stock' })
  })

  it('flattens the public feed (no stock counts)', () => {
    const rows = flattenShopifyPublic(
      {
        id: 9,
        title: 'Tote',
        handle: 'tote',
        body_html: '<p>Bag</p>',
        vendor: 'X',
        product_type: 'Bags',
        images: [{ src: 'https://cdn.shopify.com/t.jpg' }],
        variants: [{ id: 91, title: 'Default Title', sku: 'T1', price: '250.00', compare_at_price: '300.00', available: false }],
      },
      'store.com',
    )
    expect(rows).toEqual([
      expect.objectContaining({ source_id: '91', retailer_id: 'T1', price_paise: 30000, sale_price_paise: 25000, stock_qty: null, availability: 'out of stock' }),
    ])
  })
})

describe('WooCommerce flattening', () => {
  it('flattens a simple product', () => {
    const p: WooProduct = {
      id: 7,
      name: 'Diya set',
      type: 'simple',
      status: 'publish',
      sku: '',
      regular_price: '500',
      sale_price: '450',
      permalink: 'https://shop.example.com/diya',
      description: '<p>Set of 6</p>',
      images: [{ src: 'https://shop.example.com/1.jpg' }, { src: 'https://shop.example.com/2.jpg' }],
      categories: [{ name: 'Decor' }],
      manage_stock: true,
      stock_quantity: 12,
    }
    const [row] = flattenWoo(p)
    expect(row).toMatchObject({
      source: 'woocommerce',
      source_id: '7',
      retailer_id: 'woo-7',
      price_paise: 50000,
      sale_price_paise: 45000,
      stock_qty: 12,
      availability: 'in stock',
      category: 'Decor',
      description: 'Set of 6',
    })
    expect(row.additional_image_urls).toEqual(['https://shop.example.com/2.jpg'])
  })

  it('flattens variations into one row each and drafts for unpublished', () => {
    const p: WooProduct = { id: 3, name: 'Tee', type: 'variable', status: 'draft', variations: [31, 32] }
    const rows = flattenWoo(p, [
      { id: 31, sku: 'TEE-S', regular_price: '300', attributes: [{ name: 'Size', option: 'S' }], stock_status: 'instock' },
      { id: 32, regular_price: '320', attributes: [{ name: 'Size', option: 'L' }], stock_status: 'outofstock' },
    ])
    expect(rows.map((r) => [r.source_id, r.retailer_id, r.title, r.availability, r.status])).toEqual([
      ['3-31', 'TEE-S', 'Tee – S', 'in stock', 'draft'],
      ['3-32', 'woo-3-32', 'Tee – L', 'out of stock', 'draft'],
    ])
  })

  it('skips products without a price', () => {
    expect(flattenWoo({ id: 1, name: 'No price', type: 'simple', status: 'publish' })).toEqual([])
  })
})

describe('retailer id de-duplication', () => {
  const mk = (rid: string, sid: string): SyncProduct => ({
    source: 'shopify', source_id: sid, retailer_id: rid, title: 't', description: '', price_paise: 100, sale_price_paise: null,
    currency: 'INR', image_url: null, additional_image_urls: [], product_url: null, brand: null, category: null,
    availability: 'in stock', stock_qty: null, status: 'active',
  })

  it('suffixes clashes with existing ids and inside one batch', () => {
    const out = dedupeRetailerIds([mk('A', '1'), mk('A', '2'), mk('B', '3')], new Set(['B']))
    const ids = out.map((r) => r.retailer_id)
    expect(new Set(ids).size).toBe(3)
    expect(ids[0]).toBe('A')
    expect(ids[1]).toBe('A-2')
    expect(ids[2]).toBe('B-3')
  })
})

describe('stock checks', () => {
  const products = {
    A: { retailer_id: 'A', title: 'Kurta', stock_qty: 3 },
    B: { retailer_id: 'B', title: 'Dupatta', stock_qty: 0 },
    C: { retailer_id: 'C', title: 'Scarf', stock_qty: null },
  }

  it('flags out-of-stock and short items, ignores untracked and unknown', () => {
    const issues = checkCartStock(
      [
        { retailer_id: 'A', quantity: 5 },
        { retailer_id: 'B', quantity: 1 },
        { retailer_id: 'C', quantity: 99 },
        { retailer_id: 'Z', quantity: 1 },
        { retailer_id: null, quantity: 1 },
      ],
      products,
    )
    expect(issues).toEqual([
      { retailer_id: 'A', title: 'Kurta', wanted: 5, available: 3, kind: 'short' },
      { retailer_id: 'B', title: 'Dupatta', wanted: 1, available: 0, kind: 'out' },
    ])
    expect(stockIssueLines(issues).join('\n')).toContain('only 3 left')
    expect(stockIssueLines(issues).join('\n')).toContain('out of stock')
  })

  it('sums the same product across lines and accepts exact stock', () => {
    expect(checkCartStock([{ retailer_id: 'A', quantity: 2 }, { retailer_id: 'A', quantity: 2 }], products)).toHaveLength(1)
    expect(checkCartStock([{ retailer_id: 'A', quantity: 3 }], products)).toEqual([])
    expect(stockIssueLines([])).toEqual([])
  })

  it('does stock maths the way the SQL function does', () => {
    expect(planSale(10, 3)).toEqual({ after: 7, moved: 3 })
    expect(planSale(2, 5)).toEqual({ after: 0, moved: 2 }) // never negative; only what existed moves
    expect(planRestock(7, 3)).toEqual({ after: 10 })
    expect(planRestock(0, 2)).toEqual({ after: 2 })
    expect(crossedLowStock(8, 5)).toBe(true)
    expect(crossedLowStock(5, 3)).toBe(false) // already low, no second alert
    expect(crossedLowStock(9, 7)).toBe(false)
  })

  it('never applies the same order+product+kind twice (idempotent ledger)', () => {
    const ledger = new Set<string>()
    expect(applyOnce(ledger, { orderId: 'o1', retailerId: 'A', kind: 'sale' })).toBe(true)
    expect(applyOnce(ledger, { orderId: 'o1', retailerId: 'A', kind: 'sale' })).toBe(false)
    expect(applyOnce(ledger, { orderId: 'o1', retailerId: 'A', kind: 'restock' })).toBe(true)
    expect(applyOnce(ledger, { orderId: 'o2', retailerId: 'A', kind: 'sale' })).toBe(true)
  })
})

describe('product_list payload', () => {
  it('builds the interactive multi-product message', () => {
    const sections = groupIntoSections([
      { retailer_id: 'A', category: 'Kurtas' },
      { retailer_id: 'B', category: 'Kurtas' },
      { retailer_id: 'C', category: null },
    ])
    expect(sections).toEqual([
      { title: 'Kurtas', retailer_ids: ['A', 'B'] },
      { title: 'Products', retailer_ids: ['C'] },
    ])
    const msg = buildProductListMessage({ catalogId: 'cat1', header: 'Festive picks', body: 'Take a look', sections })
    expect(msg).toEqual({
      type: 'interactive',
      interactive: {
        type: 'product_list',
        header: { type: 'text', text: 'Festive picks' },
        body: { text: 'Take a look' },
        action: {
          catalog_id: 'cat1',
          sections: [
            { title: 'Kurtas', product_items: [{ product_retailer_id: 'A' }, { product_retailer_id: 'B' }] },
            { title: 'Products', product_items: [{ product_retailer_id: 'C' }] },
          ],
        },
      },
    })
  })

  it('enforces WhatsApp limits', () => {
    const many = Array.from({ length: MAX_PRODUCTS_PER_LIST + 1 }, (_, i) => `P${i}`)
    expect(() => validateProductList([{ title: 'All', retailer_ids: many }])).toThrow(ProductListError)
    expect(() => validateProductList([])).toThrow(/at least one/)
    expect(() => validateProductList([{ title: 'x'.repeat(25), retailer_ids: ['A'] }])).toThrow(/24 characters/)
    expect(() => validateProductList([{ title: 'A', retailer_ids: ['X'] }, { title: 'B', retailer_ids: ['X'] }])).toThrow(/twice/)
    expect(() => buildProductListMessage({ catalogId: '', body: 'b', sections: [{ title: 'A', retailer_ids: ['X'] }] })).toThrow(/catalog ID/)
    expect(() => validateProductList([{ title: 'A', retailer_ids: many.slice(0, 30) }])).not.toThrow()
  })

  it('groups beyond 10 categories into the last section instead of dropping products', () => {
    const items = Array.from({ length: 12 }, (_, i) => ({ retailer_id: `P${i}`, category: `Cat ${i}` }))
    const sections = groupIntoSections(items)
    expect(sections).toHaveLength(10)
    expect(sections.flatMap((s) => s.retailer_ids)).toHaveLength(12)
  })

  it('normalises retailer ids', () => {
    expect(normaliseRetailerIds([' A ', 'A', '', 5, 'B', 'x'.repeat(101)])).toEqual(['A', 'B'])
    expect(normaliseRetailerIds('nope')).toEqual([])
  })
})

describe('collection input', () => {
  it('validates name and products', () => {
    expect(parseCollectionInput({ name: '  Best sellers ', retailer_ids: ['A', 'B', 'A'] })).toEqual({
      ok: true,
      value: { name: 'Best sellers', retailer_ids: ['A', 'B'] },
    })
    expect(parseCollectionInput({ name: '', retailer_ids: ['A'] }).ok).toBe(false)
    expect(parseCollectionInput({ name: 'X', retailer_ids: [] }).ok).toBe(false)
    expect(parseCollectionInput(null).ok).toBe(false)
    const tooMany = Array.from({ length: 31 }, (_, i) => `P${i}`)
    expect(parseCollectionInput({ name: 'X', retailer_ids: tooMany }).ok).toBe(false)
    // Names are trimmed to WhatsApp's 24-character section title limit.
    const long = parseCollectionInput({ name: 'x'.repeat(40), retailer_ids: ['A'] })
    expect(long.ok && long.value.name.length).toBe(24)
  })
})
