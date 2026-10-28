import { describe, expect, it } from 'vitest'

import { productCaption, productLinkMessage, type LinkProduct } from './link-share'

const kurta: LinkProduct = {
  title: 'Cotton kurta',
  price_paise: 99900,
  sale_price_paise: 79900,
  currency: 'INR',
  image_url: 'https://cdn.shopify.com/a.jpg',
  product_url: 'https://shop.myshopify.com/products/cotton-kurta',
}

describe('product link share', () => {
  it('shows the sale price, the original price and the link', () => {
    expect(productCaption(kurta)).toBe('*Cotton kurta*\n₹799.00 (was ₹999.00)\nhttps://shop.myshopify.com/products/cotton-kurta')
  })

  it('puts the optional message first', () => {
    expect(productCaption(kurta, ' Here you go ').startsWith('Here you go\n*Cotton kurta*')).toBe(true)
  })

  it('sends a photo with caption when there is an https image', () => {
    expect(productLinkMessage(kurta)).toMatchObject({ type: 'image', image: { link: kurta.image_url } })
  })

  it('falls back to text with link preview without a photo', () => {
    const msg = productLinkMessage({ ...kurta, image_url: null, sale_price_paise: null })
    expect(msg).toEqual({
      type: 'text',
      text: { body: '*Cotton kurta*\n₹999.00\nhttps://shop.myshopify.com/products/cotton-kurta', preview_url: true },
    })
  })
})
