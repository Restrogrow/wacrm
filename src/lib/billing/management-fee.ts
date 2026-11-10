// ============================================================
// Campaign management fee — a percentage Repeat Grow charges some
// accounts on top of what Meta bills them for messages.
//
// Meta bills the business directly; we are never in that money flow
// (lib/whatsapp/spend.ts). So this computes a figure to invoice
// separately, which means the customer will compare it against their
// own Meta invoice. It has to reconcile, and it has to be explainable
// line by line.
//
// Basis: the COUNT of messages Meta's own status webhook marked
// billable (broadcast_recipients + messages, migrations 086/097),
// priced at our published rate card. Explicitly NOT Meta's
// pricing_analytics `cost`: that is approximate until Meta invoices,
// it lags hours, it is an average rather than a per-message price, and
// it covers the whole WABA including sends that never went through
// Repeat Grow. A fee billed off that number is a fee you argue about
// every month.
//
// A category with no rate set is reported, counted, and left unpriced
// rather than guessed at — see `unpriced`.
// ============================================================

/** One category's billable volume for the period, per source. */
export interface BillableCount {
  /** MARKETING / UTILITY / AUTHENTICATION / SERVICE / UNKNOWN. */
  category: string;
  /** 'broadcast' (broadcast_recipients) or 'conversation' (messages). */
  source: 'broadcast' | 'conversation';
  billable: number;
}

/** Published price per billable message, keyed by upper-case category. */
export type RateCard = Record<string, number>;

export interface FeeLine {
  category: string;
  broadcast: number;
  conversation: number;
  /** Total billable messages in this category. */
  messages: number;
  /** Published rate, or null when the rate card has no entry. */
  rate: number | null;
  /** messages × rate, or null when unpriced. */
  spend: number | null;
}

export interface ManagementFee {
  lines: FeeLine[];
  /** Billable messages across every category, priced or not. */
  totalMessages: number;
  /** What Meta is expected to bill, at our rate card. */
  metaSpend: number;
  /** The percentage applied (0 = no fee). */
  feePercent: number;
  /** metaSpend × feePercent / 100. */
  fee: number;
  /** metaSpend + fee — what the customer pays in total for messaging. */
  total: number;
  /**
   * Categories that had billable volume but no rate. Their messages are
   * in `totalMessages` but not in `metaSpend`, so the fee is understated
   * until a rate is set — the UI must say so rather than show a total
   * that looks complete.
   */
  unpriced: { category: string; messages: number }[];
}

/** Round to paise/cents. */
const money = (n: number): number => Math.round(n * 100) / 100;

/**
 * Price a period's billable counts and apply the account's fee.
 *
 * `feePercent` is clamped to 0–100: it comes from
 * `accounts.management_fee_percent`, which the database already
 * constrains, but this is also called with admin-entered previews.
 */
export function computeManagementFee(
  counts: BillableCount[],
  rates: RateCard,
  feePercent: number,
): ManagementFee {
  const byCategory = new Map<string, FeeLine>();

  for (const c of counts) {
    const category = (c.category || 'UNKNOWN').toUpperCase();
    const line =
      byCategory.get(category) ??
      ({
        category,
        broadcast: 0,
        conversation: 0,
        messages: 0,
        rate: null,
        spend: null,
      } satisfies FeeLine);

    if (c.source === 'broadcast') line.broadcast += c.billable;
    else line.conversation += c.billable;
    line.messages += c.billable;
    byCategory.set(category, line);
  }

  let metaSpend = 0;
  let totalMessages = 0;
  const unpriced: { category: string; messages: number }[] = [];

  for (const line of byCategory.values()) {
    totalMessages += line.messages;
    const rate = rates[line.category];
    if (rate === undefined) {
      // No rate: report the volume, price nothing.
      if (line.messages > 0) unpriced.push({ category: line.category, messages: line.messages });
      continue;
    }
    line.rate = rate;
    line.spend = money(line.messages * rate);
    metaSpend += line.spend;
  }

  const pct = Math.min(100, Math.max(0, Number.isFinite(feePercent) ? feePercent : 0));
  const spend = money(metaSpend);
  const fee = money((spend * pct) / 100);

  return {
    lines: [...byCategory.values()].sort(
      (a, b) => (b.spend ?? 0) - (a.spend ?? 0) || b.messages - a.messages,
    ),
    totalMessages,
    metaSpend: spend,
    feePercent: pct,
    fee,
    total: money(spend + fee),
    unpriced: unpriced.sort((a, b) => b.messages - a.messages),
  };
}

/**
 * Half-open [from, to) for a calendar month in UTC. Billing periods are
 * whole months, and Meta's own analytics buckets are UTC days, so
 * aligning to UTC keeps our invoice and Meta's comparable.
 */
export function monthRange(year: number, month1to12: number): { from: Date; to: Date } {
  const from = new Date(Date.UTC(year, month1to12 - 1, 1));
  const to = new Date(Date.UTC(year, month1to12, 1));
  return { from, to };
}

/** "2026-11" → {year, month}, or null when malformed. */
export function parseMonth(value: string | null | undefined): { year: number; month: number } | null {
  const m = /^(\d{4})-(\d{2})$/.exec((value ?? '').trim());
  if (!m) return null;
  const year = Number(m[1]);
  const month = Number(m[2]);
  if (month < 1 || month > 12 || year < 2020 || year > 2100) return null;
  return { year, month };
}
