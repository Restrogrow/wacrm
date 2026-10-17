// ============================================================
// WooCommerce request verification — pure, no I/O.
//
//   Webhooks: X-WC-Webhook-Signature = base64(HMAC-SHA256(raw body, secret))
//             where `secret` is the value the merchant typed into the
//             webhook's "Secret" field (we generate it for them).
// https://woocommerce.github.io/woocommerce-rest-api-docs/#webhooks
// ============================================================

import { createHmac, timingSafeEqual } from 'node:crypto';

function safeEqual(a: string, b: string): boolean {
  const ab = Buffer.from(a);
  const bb = Buffer.from(b);
  return ab.length === bb.length && timingSafeEqual(ab, bb);
}

export function verifyWooCommerceWebhook(
  rawBody: string,
  signatureHeader: string | null,
  secret: string
): boolean {
  if (!signatureHeader || !secret) return false;
  const digest = createHmac('sha256', secret)
    .update(rawBody, 'utf8')
    .digest('base64');
  return safeEqual(digest, signatureHeader.trim());
}

/**
 * Accept what merchants paste — "shop.example.com", "https://shop.example.com/",
 * "http://shop.example.com/wp-admin" — and return the origin
 * ("https://shop.example.com"), or null when it can't be a public store URL.
 * Only used for display and a sanity check, never fetched.
 */
export function normalizeStoreUrl(input: string | null | undefined): string | null {
  if (!input) return null;
  let raw = input.trim();
  if (!raw || raw.length > 253) return null;
  if (!/^https?:\/\//i.test(raw)) raw = `https://${raw}`;
  let url: URL;
  try {
    url = new URL(raw);
  } catch {
    return null;
  }
  if (url.protocol !== 'https:' && url.protocol !== 'http:') return null;
  const host = url.hostname.toLowerCase();
  // A real domain: letters/digits/dashes with at least one dot and a TLD.
  if (!/^(?:[a-z0-9](?:[a-z0-9-]*[a-z0-9])?\.)+[a-z]{2,}$/.test(host)) return null;
  return `${url.protocol}//${host}${url.port ? `:${url.port}` : ''}`;
}
