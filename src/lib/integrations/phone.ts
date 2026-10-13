// ============================================================
// Customer phone numbers from integrations (Shopify orders, Calendly
// bookings, …) → WhatsApp E.164 digits — pure.
//
// Customers type numbers however they like. Indian ones in particular
// often arrive as "98765 43210" or "098765 43210" with no +91, which
// Meta rejects. We add the calling code from the customer's country
// (or the connection's default) when the number is national.
// ============================================================

import { isValidE164 } from '@/lib/whatsapp/phone-utils';

const CALLING_CODES: Record<string, string> = {
  IN: '91',
  US: '1',
  CA: '1',
  GB: '44',
  AE: '971',
  SA: '966',
  QA: '974',
  KW: '965',
  OM: '968',
  BH: '973',
  SG: '65',
  MY: '60',
  ID: '62',
  AU: '61',
  NZ: '64',
  PK: '92',
  BD: '880',
  NP: '977',
  LK: '94',
  NG: '234',
  ZA: '27',
  KE: '254',
  DE: '49',
  FR: '33',
  IT: '39',
  ES: '34',
  NL: '31',
  BR: '55',
  MX: '52',
};

/** National significant number length, where it's fixed and well known. */
const NATIONAL_LENGTH: Record<string, number> = { '91': 10, '1': 10 };

export function callingCodeFor(
  countryCode: string | null | undefined
): string | null {
  return (countryCode && CALLING_CODES[countryCode.toUpperCase()]) || null;
}

/**
 * Digits-only international number, or null if it can't be made valid.
 * `countryCode` is the ISO code from the order address (e.g. "IN");
 * `defaultCallingCode` is the store setting used when that's missing.
 */
export function normalizeIntegrationPhone(
  raw: string | null | undefined,
  countryCode: string | null | undefined,
  defaultCallingCode: string
): string | null {
  if (!raw) return null;
  const trimmed = raw.trim();
  let digits = trimmed.replace(/\D/g, '');
  if (!digits) return null;

  if (trimmed.startsWith('+')) {
    return isValidE164(digits) ? digits : null;
  }
  if (digits.startsWith('00')) {
    digits = digits.slice(2);
    return isValidE164(digits) ? digits : null;
  }

  const cc =
    callingCodeFor(countryCode) ?? defaultCallingCode.replace(/\D/g, '');
  const national = NATIONAL_LENGTH[cc];

  if (national) {
    const withoutTrunk = digits.replace(/^0+/, '');
    if (withoutTrunk.length === national) digits = cc + withoutTrunk;
    // else: already carries the country code (e.g. 919876543210)
  } else if (digits.startsWith('0')) {
    // Domestic format with a trunk 0 — international form drops it.
    digits = cc + digits.replace(/^0+/, '');
  } else if (cc && !digits.startsWith(cc)) {
    digits = cc + digits;
  }

  return isValidE164(digits) ? digits : null;
}
