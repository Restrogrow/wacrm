// ============================================================
// Partner program — pure rules, usable on client and server.
//
// Partners share repeatgrow.com/r/<code>. A visitor who signs up after
// clicking it is credited to that partner (lib/partners/server.ts), and
// every payment that business makes in its first COMMISSION_MONTHS earns
// the partner commission_rate % of it. Tables: migration 092.
//
// Not announced yet: the /partner page works for anyone who has the
// link; the menu entry only shows when NEXT_PUBLIC_PARTNER_PROGRAM=on.
// ============================================================

export const PARTNER_STATUSES = ['pending', 'approved', 'rejected', 'suspended'] as const;
export type PartnerStatus = (typeof PARTNER_STATUSES)[number];

export const PARTNER_STATUS_LABELS: Record<PartnerStatus, string> = {
  pending: 'Under review',
  approved: 'Active',
  rejected: 'Not approved',
  suspended: 'Paused',
};

/** % of each payment a new partner earns. Admins can change it per partner. */
export const DEFAULT_COMMISSION_RATE = 20;
/** Payments in this many months after signup earn commission. */
export const COMMISSION_MONTHS = 12;
/** How long a referral link click is remembered before signup. */
export const REFERRAL_COOKIE = 'rg_ref';
export const REFERRAL_COOKIE_DAYS = 60;
/** Only accounts this new can be credited from a link (not old ones). */
export const CLAIM_WINDOW_DAYS = 30;
/** Payouts are sent once earnings reach this much. */
export const MIN_PAYOUT = 1000;

export const PAYOUT_METHODS = ['upi', 'bank'] as const;
export type PayoutMethod = (typeof PAYOUT_METHODS)[number];

export const PROGRAM_POINTS = [
  `Earn ${DEFAULT_COMMISSION_RATE}% of every payment your clients make for their first ${COMMISSION_MONTHS} months.`,
  `Clients who sign up within ${REFERRAL_COOKIE_DAYS} days of opening your link are yours.`,
  `Payouts by UPI or bank transfer once you have ₹${MIN_PAYOUT.toLocaleString('en-IN')} or more to collect.`,
];

const CODE_RE = /^[a-z0-9][a-z0-9-]{2,31}$/;

export function isValidCode(code: string): boolean {
  return CODE_RE.test(code);
}

/** Lower-case, trimmed; null when it can't be a code. */
export function normalizeCode(raw: unknown): string | null {
  if (typeof raw !== 'string') return null;
  const code = raw.trim().toLowerCase();
  return isValidCode(code) ? code : null;
}

/** "Rahul Sharma" → "rahul-x7k2". `random` is injectable for tests. */
export function suggestCode(name: string, random: () => number = Math.random): string {
  const base =
    name
      .toLowerCase()
      .normalize('NFKD')
      .replace(/[^a-z0-9]+/g, ' ')
      .trim()
      .split(' ')[0]
      ?.slice(0, 16) || 'partner';
  const alphabet = 'abcdefghjkmnpqrstuvwxyz23456789';
  let suffix = '';
  for (let i = 0; i < 4; i++) suffix += alphabet[Math.floor(random() * alphabet.length)];
  return `${base.length >= 2 ? base : 'partner'}-${suffix}`;
}

/** Commission on one payment, rounded to the paisa. */
export function commissionFor(paymentAmount: number, rate: number): number {
  if (!(paymentAmount > 0) || !(rate > 0)) return 0;
  return Math.round(paymentAmount * rate) / 100;
}

/** Does a payment made `paidAt` still earn commission for a referral made `referredAt`? */
export function withinCommissionWindow(referredAt: string | Date, paidAt: Date = new Date()): boolean {
  const end = new Date(referredAt);
  end.setMonth(end.getMonth() + COMMISSION_MONTHS);
  return paidAt.getTime() <= end.getTime();
}

export interface CommissionLike {
  amount: number | string;
  status: 'pending' | 'paid' | 'void';
}

export function earningsSummary(rows: CommissionLike[]) {
  let pending = 0;
  let paid = 0;
  for (const r of rows) {
    const amount = Number(r.amount) || 0;
    if (r.status === 'pending') pending += amount;
    else if (r.status === 'paid') paid += amount;
  }
  const round = (n: number) => Math.round(n * 100) / 100;
  return { pending: round(pending), paid: round(paid), total: round(pending + paid) };
}

export const formatInr = (n: number) =>
  `₹${(Math.round(n * 100) / 100).toLocaleString('en-IN', { maximumFractionDigits: 2 })}`;
