import { describe, expect, it } from 'vitest'

import { metaItemToInput, parseMetaPrice } from './meta-import'

describe('parseMetaPrice', () => {
  it('reads formatted prices into paise', () => {
    expect(parseMetaPrice('₹1,299.00')).toBe(129900)
    expect(parseMetaPrice('1299.00 INR')).toBe(129900)
    expect(parseMetaPrice('1,29,900')).toBe(12990000)
    expect(parseMetaPrice('499')).toBe(49900)
    expect(parseMetaPrice(250)).toBe(25000)
  })
  it('rejects things that are not prices', () => {
    expect(parseMetaPrice('')).toBeNull()
    expect(parseMetaPrice('free')).toBeNull()
    expect(parseMetaPrice(undefined)).toBeNull()
    expect(parseMetaPrice(-5)).toBeNull()
  })
})

describe('metaItemToInput', () => {
  const base = { retailer_id: 'kurta-1', name: 'Blue Kurta', price: '₹999.00', currency: 'INR', availability: 'in stock', image_url: 'https://cdn.example.com/a.jpg' }
  it('maps a normal item', () => {
    const p = metaItemToInput({ ...base, sale_price: '₹799.00', url: 'https://shop.example.com/kurta', brand: 'Acme' })
    expect(p).toMatchObject({ retailer_id: 'kurta-1', title: 'Blue Kurta', price_paise: 99900, sale_price_paise: 79900, availability: 'in stock', brand: 'Acme' })
    expect(p?.image_url).toBe('https://cdn.example.com/a.jpg')
  })
  it('ignores a sale price that is not lower, and non-http links', () => {
    const p = metaItemToInput({ ...base, sale_price: '₹1,999.00', image_url: 'javascript:alert(1)', url: 'ftp://x' })
    expect(p?.sale_price_paise).toBeNull()
    expect(p?.image_url).toBeNull()
    expect(p?.product_url).toBeNull()
  })
  it('treats anything but "in stock" as out of stock', () => {
    expect(metaItemToInput({ ...base, availability: 'out of stock' })?.availability).toBe('out of stock')
    expect(metaItemToInput({ ...base, availability: 'preorder' })?.availability).toBe('out of stock')
  })
  it('drops items without an id, name or price', () => {
    expect(metaItemToInput({ ...base, retailer_id: '' })).toBeNull()
    expect(metaItemToInput({ ...base, name: '' })).toBeNull()
    expect(metaItemToInput({ ...base, price: 'n/a' })).toBeNull()
  })
})
