import { describe, expect, it } from 'vitest'

import { PRODUCT_CSV_TEMPLATE, mapHeaders, parseCsv, parseProductsCsv, productsToCsv, stripHtml } from './csv'
import {
  formatPrice,
  mapMetaCatalogError,
  metaPrice,
  parsePriceToPaise,
  productLimitFor,
  sanitizeRetailerId,
  slugRetailerId,
  toMetaItem,
  validateProductInput,
  type ProductRow,
  type SyncableProduct,
} from './core'

const base: SyncableProduct = {
  retailer_id: 'KURTA-1',
  title: 'Blue Kurta',
  description: 'Soft cotton',
  price_paise: 129900,
  sale_price_paise: null,
  currency: 'INR',
  image_url: 'https://example.com/a.jpg',
  additional_image_urls: [],
  product_url: null,
  brand: null,
  category: null,
  availability: 'in stock',
  stock_qty: null,
}

describe('prices', () => {
  it('formats INR with Indian grouping and other currencies with a code', () => {
    expect(formatPrice(129900)).toBe('₹1,299.00')
    expect(formatPrice(12345678)).toBe('₹1,23,456.78')
    expect(formatPrice(1250, 'usd')).toBe('USD 12.50')
  })
  it('builds the Meta price string', () => {
    expect(metaPrice(129900)).toBe('1299.00 INR')
    expect(metaPrice(5, 'inr')).toBe('0.05 INR')
  })
  it('parses typed prices to paise', () => {
    expect(parsePriceToPaise('1,299.50')).toBe(129950)
    expect(parsePriceToPaise('₹ 499')).toBe(49900)
    expect(parsePriceToPaise('Rs. 99')).toBe(9900)
    expect(parsePriceToPaise(10)).toBe(1000)
    expect(parsePriceToPaise('abc')).toBeNaN()
    expect(parsePriceToPaise('-5')).toBeNaN()
    expect(parsePriceToPaise('')).toBeNaN()
  })
})

describe('retailer ids', () => {
  it('slugs titles', () => {
    expect(slugRetailerId('Blue Cotton Kurta (M)')).toBe('blue-cotton-kurta-m')
    expect(slugRetailerId('Tea & Coffee')).toBe('tea-and-coffee')
    expect(slugRetailerId('!!!')).toBe('product')
    expect(slugRetailerId('x'.repeat(200)).length).toBeLessThanOrEqual(60)
  })
  it('sanitises typed SKUs', () => {
    expect(sanitizeRetailerId(' KURTA BLUE 1 ')).toBe('KURTA-BLUE-1')
    expect(sanitizeRetailerId('a/b?c')).toBe('abc')
    expect(sanitizeRetailerId('///')).toBeNull()
    expect(sanitizeRetailerId('x'.repeat(101))).toBeNull()
  })
})

describe('toMetaItem', () => {
  it('maps the required fields', () => {
    const item = toMetaItem(base, 'https://repeatgrow.com', 'My Shop')!
    expect(item).toMatchObject({
      id: 'KURTA-1',
      title: 'Blue Kurta',
      availability: 'in stock',
      condition: 'new',
      price: '1299.00 INR',
      link: 'https://repeatgrow.com',
      image_link: 'https://example.com/a.jpg',
      brand: 'My Shop',
    })
    expect(item.sale_price).toBeUndefined()
  })
  it('adds a sale price only when it is lower', () => {
    expect(toMetaItem({ ...base, sale_price_paise: 99900 }, 'https://x')!.sale_price).toBe('999.00 INR')
    expect(toMetaItem({ ...base, sale_price_paise: 129900 }, 'https://x')!.sale_price).toBeUndefined()
  })
  it('lets tracked stock decide availability', () => {
    expect(toMetaItem({ ...base, stock_qty: 0 }, 'https://x')!.availability).toBe('out of stock')
    expect(toMetaItem({ ...base, stock_qty: 3, availability: 'out of stock' }, 'https://x')!.availability).toBe('in stock')
    expect(toMetaItem({ ...base, availability: 'out of stock' }, 'https://x')!.availability).toBe('out of stock')
  })
  it('uses the product link and brand when given, and falls back otherwise', () => {
    const item = toMetaItem({ ...base, product_url: 'https://shop.in/k', brand: 'Brand' }, 'https://x', 'Fallback')!
    expect(item.link).toBe('https://shop.in/k')
    expect(item.brand).toBe('Brand')
    expect(toMetaItem({ ...base, description: '' }, 'https://x')!.description).toBe('Blue Kurta')
  })
  it('returns null without an image (Meta rejects those)', () => {
    expect(toMetaItem({ ...base, image_url: null }, 'https://x')).toBeNull()
  })
  it('caps title length', () => {
    expect(toMetaItem({ ...base, title: 'a'.repeat(400) }, 'https://x')!.title).toHaveLength(150)
  })
})

describe('validateProductInput', () => {
  it('accepts rupees or paise and normalises', () => {
    const a = validateProductInput({ title: ' Mug ', price: '349' })
    expect(a.ok && a.value.price_paise).toBe(34900)
    const b = validateProductInput({ title: 'Mug', price_paise: 34900, sale_price: '299' })
    expect(b.ok && b.value.sale_price_paise).toBe(29900)
  })
  it('requires a title and a price', () => {
    const r = validateProductInput({ title: '', price: 'x' })
    expect(r.ok).toBe(false)
    if (!r.ok) expect(r.errors.join(' ')).toMatch(/Title/)
  })
  it('rejects a sale price that is not lower, and bad urls', () => {
    expect(validateProductInput({ title: 'a', price: '100', sale_price: '100' }).ok).toBe(false)
    expect(validateProductInput({ title: 'a', price: '100', image_url: 'javascript:alert(1)' }).ok).toBe(false)
    expect(validateProductInput({ title: 'a', price: '100', product_url: 'ftp://x' }).ok).toBe(false)
  })
  it('derives availability from tracked stock', () => {
    const r = validateProductInput({ title: 'a', price: '1', stock_qty: 0, availability: 'in stock' })
    expect(r.ok && r.value.availability).toBe('out of stock')
    const s = validateProductInput({ title: 'a', price: '1', stock_qty: '5' })
    expect(s.ok && s.value.availability).toBe('in stock')
    expect(validateProductInput({ title: 'a', price: '1', stock_qty: -1 }).ok).toBe(false)
    expect(validateProductInput({ title: 'a', price: '1', stock_qty: '' }).ok).toBe(true)
  })
  it('ignores unknown keys and rejects bad enums', () => {
    const r = validateProductInput({ title: 'a', price: '1', account_id: 'evil', status: 'active' })
    expect(r.ok && 'account_id' in r.value).toBe(false)
    expect(validateProductInput({ title: 'a', price: '1', status: 'weird' }).ok).toBe(false)
  })
})

describe('plan caps and error mapping', () => {
  it('has a cap per plan and none for enterprise', () => {
    expect(productLimitFor('starter')).toBe(500)
    expect(productLimitFor('enterprise')).toBeNull()
    expect(productLimitFor(null)).toBe(500)
  })
  it('explains Graph errors in plain language', () => {
    expect(mapMetaCatalogError({ code: 200, message: '(#200) Requires catalog_management permission' })).toMatch(/catalog_management/)
    expect(mapMetaCatalogError({ code: 10, message: 'Application does not have permission' })).toMatch(/catalog_management/)
    expect(mapMetaCatalogError({ code: 190, message: 'expired' })).toMatch(/expired/)
    expect(mapMetaCatalogError({ code: 100, message: 'Unsupported get request. Object with ID 123 does not exist' })).toMatch(/catalog ID/)
    expect(mapMetaCatalogError({ code: 4, message: 'rate' })).toMatch(/rate limiting/)
    expect(mapMetaCatalogError({ code: 1, error_user_msg: 'Custom text' })).toBe('Custom text')
    expect(mapMetaCatalogError(undefined, 500)).toMatch(/500/)
  })
})

describe('csv tokenizer', () => {
  it('handles quotes, escaped quotes, newlines in cells, CRLF and BOM', () => {
    const rows = parseCsv('﻿a,b\r\n"x, y","say ""hi"""\r\n"line1\nline2",z\r\n')
    expect(rows).toEqual([
      ['a', 'b'],
      ['x, y', 'say "hi"'],
      ['line1\nline2', 'z'],
    ])
  })
  it('detects semicolons and tabs and skips blank lines', () => {
    expect(parseCsv('a;b\n1;2\n\n3;4')).toEqual([['a', 'b'], ['1', '2'], ['3', '4']])
    expect(parseCsv('a\tb\n1\t2')).toEqual([['a', 'b'], ['1', '2']])
  })
  it('strips html from descriptions', () => {
    expect(stripHtml('<p>Soft &amp; warm</p><p>Wash cold<br>only</p>')).toBe('Soft & warm\nWash cold\nonly')
  })
})

describe('csv import', () => {
  it('reads our own template', () => {
    const r = parseProductsCsv(PRODUCT_CSV_TEMPLATE)
    expect(r.errors).toEqual([])
    expect(r.rows).toHaveLength(2)
    expect(r.rows[0].input).toMatchObject({ retailer_id: 'KURTA-BLUE-M', price_paise: 129900, sale_price_paise: 99900, stock_qty: 25, source: 'csv' })
    expect(r.rows[1].input.sale_price_paise).toBeNull()
  })
  it('maps Shopify headers, uses Compare At Price as the original price and ignores image-only rows', () => {
    const csv = [
      'Handle,Title,Body (HTML),Vendor,Type,Variant SKU,Variant Inventory Qty,Variant Price,Variant Compare At Price,Image Src,Status',
      'kurta,Blue Kurta,<p>Nice</p>,Acme,Clothing,K-1,7,999,1299,https://x.com/1.jpg,active',
      'kurta,,,,,,,,,https://x.com/2.jpg,',
    ].join('\n')
    const r = parseProductsCsv(csv)
    expect(r.errors).toEqual([])
    expect(r.ignored).toBe(1)
    expect(r.rows).toHaveLength(1)
    expect(r.rows[0].input).toMatchObject({
      retailer_id: 'K-1',
      title: 'Blue Kurta',
      description: 'Nice',
      brand: 'Acme',
      category: 'Clothing',
      price_paise: 129900,
      sale_price_paise: 99900,
      stock_qty: 7,
      image_url: 'https://x.com/1.jpg',
      status: 'active',
    })
  })
  it('maps WooCommerce headers, first image and stock status', () => {
    const csv = [
      'ID,Name,Regular price,Sale price,Images,Categories,Stock status,Published',
      '12,Mug,"1,000",750,"https://x.com/a.jpg, https://x.com/b.jpg","Home > Kitchen, Sale",outofstock,1',
    ].join('\n')
    const r = parseProductsCsv(csv)
    expect(r.errors).toEqual([])
    expect(r.rows[0].input).toMatchObject({
      retailer_id: '12',
      price_paise: 100000,
      sale_price_paise: 75000,
      image_url: 'https://x.com/a.jpg',
      additional_image_urls: ['https://x.com/b.jpg'],
      category: 'Home > Kitchen',
      availability: 'out of stock',
      status: 'active',
    })
  })
  it('prefers SKU over id and drops a sale price that is not lower', () => {
    const r = parseProductsCsv('ID,SKU,Name,Price,Sale price\n1,ABC,Thing,100,100')
    expect(r.rows[0].input.retailer_id).toBe('ABC')
    expect(r.rows[0].input.sale_price_paise).toBeNull()
  })
  it('reports bad rows with line numbers and still returns the good ones', () => {
    const r = parseProductsCsv('title,price,image_url\nGood,10,https://x.com/a.jpg\nBad,abc,\nWorse,5,notaurl')
    expect(r.rows).toHaveLength(1)
    expect(r.errors.map((e) => e.line)).toEqual([3, 4])
    expect(r.errors[0].message).toMatch(/Price/)
  })
  it('explains a missing title or price column', () => {
    const r = parseProductsCsv('sku,colour\nA,red')
    expect(r.rows).toHaveLength(0)
    expect(r.errors[0].message).toMatch(/title/)
    expect(parseProductsCsv('').errors[0].message).toMatch(/empty/)
  })
  it('rejects files over 2000 rows', () => {
    const lines = ['title,price']
    for (let i = 0; i < 2001; i++) lines.push(`P${i},1`)
    const r = parseProductsCsv(lines.join('\n'))
    expect(r.rows).toHaveLength(0)
    expect(r.errors[0].message).toMatch(/Too many rows/)
  })
  it('lists columns it did not use', () => {
    const r = parseProductsCsv('title,price,favourite colour\nA,1,red')
    expect(r.unmapped).toEqual(['favourite colour'])
    expect(mapHeaders(['Name', 'Price']).index).toEqual({ title: 0, price: 1 })
  })
})

describe('csv export', () => {
  const row: ProductRow = {
    id: '1',
    account_id: 'a',
    ...base,
    title: '=HYPERLINK("http://evil")',
    stock_qty: 4,
    source: 'manual',
    source_id: null,
    status: 'active',
    meta_sync_status: 'pending',
    meta_sync_error: null,
    meta_synced_at: null,
    created_at: '',
    updated_at: '',
  }
  it('guards against spreadsheet formulas and writes rupees', () => {
    const csv = productsToCsv([row])
    expect(csv.split('\r\n')[0]).toContain('sku,title,description,price')
    expect(csv).toContain(`"'=HYPERLINK(""http://evil"")"`)
    expect(csv).toContain('1299.00')
  })
  it('round-trips through the importer', () => {
    const csv = productsToCsv([{ ...row, title: 'Plain title' }])
    const r = parseProductsCsv(csv)
    expect(r.errors).toEqual([])
    expect(r.rows[0].input).toMatchObject({ retailer_id: 'KURTA-1', title: 'Plain title', price_paise: 129900, stock_qty: 4 })
  })
})
