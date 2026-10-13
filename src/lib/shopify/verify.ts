// ============================================================
// Shopify request verification — pure, no I/O.
//
//   Webhooks:  X-Shopify-Hmac-Sha256 = base64(HMAC-SHA256(raw body, secret))
//              secret = the app's client secret (OAuth stores) or the
//              key Shopify admin shows under Settings → Notifications →
//              Webhooks (manual stores).
//   OAuth:     the callback query's `hmac` = hex(HMAC-SHA256(the other
//              params sorted and joined as k=v&k=v, client secret)).
// https://shopify.dev/docs/apps/build/authentication-authorization/access-tokens/authorization-code-grant
// ============================================================

import { createHmac, timingSafeEqual } from 'node:crypto';

function safeEqual(a: string, b: string): boolean {
  const ab = Buffer.from(a);
  const bb = Buffer.from(b);
  return ab.length === bb.length && timingSafeEqual(ab, bb);
}

export function verifyShopifyWebhook(
  rawBody: string,
  hmacHeader: string | null,
  secret: string
): boolean {
  if (!hmacHeader || !secret) return false;
  const digest = createHmac('sha256', secret)
    .update(rawBody, 'utf8')
    .digest('base64');
  return safeEqual(digest, hmacHeader.trim());
}

export function verifyShopifyOAuthQuery(
  params: URLSearchParams,
  secret: string
): boolean {
  const hmac = params.get('hmac');
  if (!hmac || !secret) return false;
  const message = [...params.entries()]
    .filter(([key]) => key !== 'hmac' && key !== 'signature')
    .sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0))
    .map(([key, value]) => `${key}=${value}`)
    .join('&');
  const digest = createHmac('sha256', secret).update(message).digest('hex');
  return safeEqual(digest, hmac);
}

const SHOP_DOMAIN_RE = /^[a-zA-Z0-9][a-zA-Z0-9-]*\.myshopify\.com$/;

/** Anchored per Shopify's guidance, so "x.myshopify.com.evil.com" fails. */
export function isValidShopDomain(
  shop: string | null | undefined
): shop is string {
  return !!shop && SHOP_DOMAIN_RE.test(shop);
}

/**
 * Accept what merchants actually paste — "mystore", "mystore.myshopify.com",
 * "https://mystore.myshopify.com/admin" — and return "mystore.myshopify.com",
 * or null when it can't be a Shopify store domain.
 */
export function normalizeShopDomain(
  input: string | null | undefined
): string | null {
  if (!input) return null;
  let shop = input.trim().toLowerCase();
  shop = shop.replace(/^https?:\/\//, '').split(/[/?#]/)[0];
  if (shop && !shop.includes('.')) shop = `${shop}.myshopify.com`;
  return isValidShopDomain(shop) ? shop : null;
}
