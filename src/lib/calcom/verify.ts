// ============================================================
// Cal.com webhook signature check — pure (node:crypto only).
//
//   X-Cal-Signature-256 = hex( HMAC-SHA256(raw body, secret) )
// where `secret` is the value in the webhook's "Secret" field (we
// generate it for the merchant). Compared in constant time.
// https://cal.com/docs/developing/guides/automation/webhooks
// ============================================================

import { createHmac, timingSafeEqual } from 'node:crypto';

export function verifyCalComWebhook(
  rawBody: string,
  signatureHeader: string | null,
  secret: string
): boolean {
  if (!signatureHeader || !secret) return false;
  const expected = createHmac('sha256', secret).update(rawBody, 'utf8').digest('hex');
  const given = signatureHeader.trim().toLowerCase();
  const a = Buffer.from(expected);
  const b = Buffer.from(given);
  return a.length === b.length && timingSafeEqual(a, b);
}

/**
 * Accept what merchants paste for a Cal.com host — "cal.com",
 * "https://cal.mycompany.com/" — and return the origin, or null when it
 * can't be a public host. Used only to build reschedule / cancel links.
 */
export function normalizeBookingHost(input: string | null | undefined): string | null {
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
  if (!/^(?:[a-z0-9](?:[a-z0-9-]*[a-z0-9])?\.)+[a-z]{2,}$/.test(host)) return null;
  return `${url.protocol}//${host}${url.port ? `:${url.port}` : ''}`;
}
