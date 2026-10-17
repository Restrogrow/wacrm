// ============================================================
// Shiprocket webhook check — pure, no I/O.
//
// Shiprocket (Settings > API > Webhooks) sends the "Token" the merchant
// typed in the x-api-key header. We generated that token, so a delivery
// is genuine when the header equals it. Compared in constant time.
// ============================================================

import { createHash, timingSafeEqual } from 'node:crypto';

function digest(value: string): Buffer {
  return createHash('sha256').update(value, 'utf8').digest();
}

export function verifyShiprocketWebhook(
  apiKeyHeader: string | null,
  token: string
): boolean {
  if (!apiKeyHeader || !token) return false;
  // Hash both sides so the compare is constant-time for any input length.
  return timingSafeEqual(digest(apiKeyHeader.trim()), digest(token));
}
