// ============================================================
// Share products as plain WhatsApp messages (photo + name, price and
// store link) when the account has no Meta catalog connected, so the
// inbox product picker still works for synced Shopify / WooCommerce
// products. Pure functions; the share route sends them.
// ============================================================

import { formatPrice } from './core'

/** Each product is its own message, so keep one share small. */
export const MAX_LINK_PRODUCTS = 10

export interface LinkProduct {
  title: string
  price_paise: number
  sale_price_paise: number | null
  currency: string
  image_url: string | null
  product_url: string | null
}

/** "*Cotton kurta*\n₹799.00 (was ₹999.00)\nhttps://…" — fits an image caption (1024). */
export function productCaption(p: LinkProduct, intro?: string): string {
  const price =
    p.sale_price_paise !== null && p.sale_price_paise < p.price_paise
      ? `${formatPrice(p.sale_price_paise, p.currency)} (was ${formatPrice(p.price_paise, p.currency)})`
      : formatPrice(p.sale_price_paise ?? p.price_paise, p.currency)
  const lines = [intro?.trim(), `*${p.title.trim()}*`, price, p.product_url?.trim()].filter(Boolean) as string[]
  return lines.join('\n').slice(0, 1024)
}

/** Image message with caption, or text with link preview when there is no photo. */
export function productLinkMessage(p: LinkProduct, intro?: string): Record<string, unknown> {
  const caption = productCaption(p, intro)
  if (p.image_url && /^https:\/\//i.test(p.image_url)) {
    return { type: 'image', image: { link: p.image_url, caption } }
  }
  return productTextMessage(p, intro)
}

export function productTextMessage(p: LinkProduct, intro?: string): Record<string, unknown> {
  return { type: 'text', text: { body: productCaption(p, intro), preview_url: Boolean(p.product_url) } }
}
