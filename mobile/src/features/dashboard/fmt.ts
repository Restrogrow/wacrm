// Small pure formatting helpers shared by contacts, overview and deals.

/** "5m", "3h", "2d", or a short date for older timestamps. */
export function fmtRelative(iso: string | null | undefined, now: number = Date.now()): string {
  if (!iso) return '';
  const t = new Date(iso).getTime();
  if (!Number.isFinite(t)) return '';
  const s = Math.max(0, Math.round((now - t) / 1000));
  if (s < 45) return 'just now';
  if (s < 3600) return `${Math.max(1, Math.round(s / 60))}m ago`;
  if (s < 86400) return `${Math.round(s / 3600)}h ago`;
  if (s < 86400 * 7) return `${Math.round(s / 86400)}d ago`;
  return fmtDate(iso);
}

export function fmtDate(iso: string | null | undefined): string {
  if (!iso) return '';
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return '';
  return d.toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric' });
}

export function fmtDateTime(iso: string | null | undefined): string {
  if (!iso) return '';
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return '';
  return d.toLocaleString('en-IN', { day: 'numeric', month: 'short', hour: 'numeric', minute: '2-digit' });
}

/** Indian digit grouping: 123456 -> "1,23,456". Handles decimals and negatives. */
export function groupIndian(n: number, maxFraction = 0): string {
  if (!Number.isFinite(n)) return '0';
  const neg = n < 0;
  const [intPart, frac] = Math.abs(n).toFixed(maxFraction).split('.');
  let out = intPart;
  if (intPart.length > 3) {
    const last3 = intPart.slice(-3);
    const rest = intPart.slice(0, -3).replace(/\B(?=(\d{2})+(?!\d))/g, ',');
    out = `${rest},${last3}`;
  }
  return `${neg ? '-' : ''}${out}${frac && Number(frac) > 0 ? `.${frac}` : ''}`;
}

const SYMBOLS: Record<string, string> = { INR: '₹', USD: '$', EUR: '€', GBP: '£', AED: 'AED ', SGD: 'S$' };

/** Amount in major units (rupees, not paise). */
export function fmtMoney(amount: number | string | null | undefined, currency: string | null | undefined = 'INR'): string {
  const n = typeof amount === 'string' ? Number(amount) : amount ?? 0;
  const cur = (currency || 'INR').toUpperCase();
  const sym = SYMBOLS[cur] ?? `${cur} `;
  const body = cur === 'INR' ? groupIndian(Number.isFinite(n) ? n : 0, 2) : (Number.isFinite(n) ? n : 0).toLocaleString('en-US', { maximumFractionDigits: 2 });
  return `${sym}${body}`;
}

/** Compact money for tight cards: ₹1.2L, ₹3.4Cr, ₹12.5K. */
export function fmtMoneyCompact(amount: number | null | undefined, currency: string | null | undefined = 'INR'): string {
  const n = amount ?? 0;
  const cur = (currency || 'INR').toUpperCase();
  const sym = SYMBOLS[cur] ?? `${cur} `;
  const abs = Math.abs(n);
  const trim = (x: number) => String(Math.round(x * 10) / 10);
  if (cur === 'INR') {
    if (abs >= 1e7) return `${sym}${trim(n / 1e7)}Cr`;
    if (abs >= 1e5) return `${sym}${trim(n / 1e5)}L`;
    if (abs >= 1e3) return `${sym}${trim(n / 1e3)}K`;
  } else {
    if (abs >= 1e9) return `${sym}${trim(n / 1e9)}B`;
    if (abs >= 1e6) return `${sym}${trim(n / 1e6)}M`;
    if (abs >= 1e3) return `${sym}${trim(n / 1e3)}K`;
  }
  return `${sym}${groupIndian(n, 0)}`;
}

/** "9810000001" / "+919810000001" -> "+91 98100 00001" when it looks Indian, else "+<digits>". */
export function fmtPhone(phone: string | null | undefined): string {
  if (!phone) return '';
  const digits = phone.replace(/\D/g, '');
  if (digits.length === 12 && digits.startsWith('91')) return `+91 ${digits.slice(2, 7)} ${digits.slice(7)}`;
  return digits ? `+${digits}` : phone;
}

/**
 * Build the number to store: digits with a leading "+".
 * A bare 10-digit number gets `defaultCode` (default 91); a leading 0 is dropped.
 * Returns null if it can't be a valid E.164 number (7-15 digits).
 */
export function toStoredPhone(raw: string, defaultCode = '91'): string | null {
  const hasPlus = raw.trim().startsWith('+');
  let digits = raw.replace(/\D/g, '');
  if (!digits) return null;
  if (!hasPlus) {
    digits = digits.replace(/^0+/, '');
    if (digits.length === 10) digits = `${defaultCode}${digits}`;
  }
  return /^[1-9]\d{6,14}$/.test(digits) ? `+${digits}` : null;
}

/** Strip characters that could break PostgREST filter grammar (mirrors the web contacts page). */
export function safeSearch(raw: string): string {
  return raw.replace(/[^\p{L}\p{N} +@.\-_]/gu, '').trim();
}

export function greeting(now: Date = new Date()): string {
  const h = now.getHours();
  if (h < 5) return 'Good night';
  if (h < 12) return 'Good morning';
  if (h < 17) return 'Good afternoon';
  return 'Good evening';
}

export function fmtDuration(seconds: number | null | undefined): string {
  if (seconds === null || seconds === undefined || !Number.isFinite(seconds)) return '–';
  if (seconds < 60) return `${Math.round(seconds)}s`;
  if (seconds < 3600) return `${Math.round(seconds / 60)}m`;
  const h = seconds / 3600;
  return h < 24 ? `${Math.round(h * 10) / 10}h` : `${Math.round((h / 24) * 10) / 10}d`;
}
