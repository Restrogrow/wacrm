// wa.me click-to-chat links (used by the QR & WhatsApp link tool).
// https://faq.whatsapp.com/5913398998672934: the number is digits only,
// with country code and no "+", zeros or brackets; the message goes in
// the `text` query parameter, URL-encoded.

/** Ready-made starting messages, so each QR can tell you where a lead came from. */
export const WA_LINK_PRESETS = [
  { id: 'counter', label: 'Shop counter', message: 'Hi! I am at your shop and want to know more.' },
  { id: 'flyer', label: 'Flyer / poster', message: 'Hi! I saw your flyer and want to know more.' },
  { id: 'packaging', label: 'Product packaging', message: 'Hi! I bought your product and have a question.' },
  { id: 'card', label: 'Visiting card', message: 'Hi! I got your visiting card. Please share your details.' },
  { id: 'instagram', label: 'Instagram bio', message: 'Hi! I found you on Instagram.' },
  { id: 'offer', label: 'Offer / sale', message: 'Hi! I want to know about your current offer.' },
] as const;

/** Longest pre-filled message we allow (keeps QR codes scannable). */
export const WA_LINK_MAX_MESSAGE = 300;

/**
 * Digits-only international number for wa.me, or null if it can't be one.
 * A bare 10-digit number (or one with a leading 0) is treated as Indian.
 */
export function normalizeWaNumber(raw: string): string | null {
  let digits = raw.replace(/\D/g, '');
  if (digits.startsWith('00')) digits = digits.slice(2);
  if (digits.length === 11 && digits.startsWith('0')) digits = digits.slice(1);
  if (digits.length === 10) digits = `91${digits}`;
  if (digits.length < 8 || digits.length > 15) return null;
  return digits;
}

export function buildWaLink(phone: string, message: string): string | null {
  const number = normalizeWaNumber(phone);
  if (!number) return null;
  const text = message.trim().slice(0, WA_LINK_MAX_MESSAGE);
  return text ? `https://wa.me/${number}?text=${encodeURIComponent(text)}` : `https://wa.me/${number}`;
}

/** File-name-safe slug for downloads, e.g. "whatsapp-qr-flyer". */
export function qrFileName(label: string): string {
  const slug = label
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-|-$/g, '')
    .slice(0, 40);
  return `whatsapp-qr${slug ? `-${slug}` : ''}`;
}
