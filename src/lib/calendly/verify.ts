// ============================================================
// Calendly webhook signature check — server-only (node:crypto).
// ============================================================

import { createHmac, timingSafeEqual } from 'node:crypto';

/**
 * Verify `Calendly-Webhook-Signature: t=<unix>,v1=<hex>` where
 * v1 = HMAC-SHA256(signingKey, `${t}.${rawBody}`), rejecting stale
 * timestamps (replays).
 * https://developer.calendly.com/api-docs/overview/webhooks/webhook-signatures
 */
export function verifyCalendlySignature(
  rawBody: string,
  header: string | null,
  signingKey: string,
  nowMs = Date.now(),
  toleranceMs = 5 * 60_000
): boolean {
  if (!header || !signingKey) return false;
  const parts = Object.fromEntries(
    header.split(',').map((kv) => {
      const [k, ...v] = kv.trim().split('=');
      return [k, v.join('=')];
    })
  );
  const t = parts.t;
  const v1 = parts.v1;
  if (!t || !v1 || !/^\d+$/.test(t)) return false;
  if (Math.abs(nowMs - Number(t) * 1000) > toleranceMs) return false;
  const expected = createHmac('sha256', signingKey)
    .update(`${t}.${rawBody}`, 'utf8')
    .digest('hex');
  const a = Buffer.from(expected);
  const b = Buffer.from(v1);
  return a.length === b.length && timingSafeEqual(a, b);
}
