// Server-side reads behind the management-fee report. Service role only
// (the RPC and message_rates are not exposed to authenticated clients —
// migration 097), so this is for /admin routes.

import { supabaseAdmin } from '@/lib/flows/admin-client';
import {
  computeManagementFee,
  monthRange,
  type BillableCount,
  type ManagementFee,
  type RateCard,
} from '@/lib/billing/management-fee';

export interface MonthlyFeeReport extends ManagementFee {
  accountId: string;
  accountName: string;
  currency: string;
  month: string;
  from: string;
  to: string;
  /** The rate card used, so the UI can show and edit it. */
  rates: RateCard;
  /** True when migration 097 hasn't been applied yet. */
  notReady: boolean;
}

/**
 * The fee over an arbitrary range, for the customer's own WhatsApp spend
 * page. Returns null when the account has no fee (percent 0, which is
 * every account by default) so the page shows nothing rather than an
 * empty "fee: 0" row, and null when migration 097 is missing.
 *
 * The range is whatever the customer is looking at; invoices are per
 * calendar month (loadMonthlyFee). The UI says so.
 */
export async function loadFeeForRange(
  accountId: string,
  fromIso: string,
  toIso: string,
  currency: string,
): Promise<(ManagementFee & { rates: RateCard }) | null> {
  const db = supabaseAdmin();

  const { data: account } = await db
    .from('accounts')
    .select('management_fee_percent')
    .eq('id', accountId)
    .maybeSingle();

  const feePercent = Number(
    (account as { management_fee_percent?: number } | null)?.management_fee_percent ?? 0,
  );
  if (!feePercent) return null;

  const { data: rows, error } = await db.rpc('account_billable_counts', {
    p_account_id: accountId,
    p_from: fromIso,
    p_to: toIso,
  });
  if (error) return null;

  const { rates, ok } = await loadRateCard(currency);
  if (!ok) return null;

  const counts: BillableCount[] = ((rows ?? []) as Record<string, unknown>[]).map((r) => ({
    category: String(r.pricing_category ?? 'UNKNOWN'),
    source: r.source === 'conversation' ? 'conversation' : 'broadcast',
    billable: Number(r.billable ?? 0),
  }));

  return { ...computeManagementFee(counts, rates, feePercent), rates };
}

/** Every rate we publish for a currency, keyed by upper-case category. */
export async function loadRateCard(currency: string): Promise<{ rates: RateCard; ok: boolean }> {
  const { data, error } = await supabaseAdmin()
    .from('message_rates')
    .select('pricing_category, rate')
    .eq('currency', currency);

  if (error) return { rates: {}, ok: false };

  const rates: RateCard = {};
  for (const row of data ?? []) {
    rates[String(row.pricing_category).toUpperCase()] = Number(row.rate);
  }
  return { rates, ok: true };
}

/**
 * Billable counts + rate card + the account's fee percentage, for one
 * calendar month.
 *
 * `notReady` (rather than a throw) when migration 097 is missing: /admin
 * should still render the rest of the account page and say the report
 * needs the migration, not 500.
 */
export async function loadMonthlyFee(
  accountId: string,
  year: number,
  month: number,
): Promise<MonthlyFeeReport | null> {
  const db = supabaseAdmin();

  const { data: account } = await db
    .from('accounts')
    .select('id, name, default_currency, management_fee_percent')
    .eq('id', accountId)
    .maybeSingle();
  if (!account) return null;

  const currency = (account.default_currency as string | null) ?? 'INR';
  // Missing column → migration 097 not applied; treat as no fee.
  const feePercent = Number(
    (account as { management_fee_percent?: number }).management_fee_percent ?? 0,
  );

  const { from, to } = monthRange(year, month);
  const monthKey = `${year}-${String(month).padStart(2, '0')}`;

  const { data: rows, error: countsError } = await db.rpc('account_billable_counts', {
    p_account_id: accountId,
    p_from: from.toISOString(),
    p_to: to.toISOString(),
  });

  const { rates, ok: ratesOk } = await loadRateCard(currency);
  const notReady = !!countsError || !ratesOk;

  const counts: BillableCount[] = ((rows ?? []) as Record<string, unknown>[]).map((r) => ({
    category: String(r.pricing_category ?? 'UNKNOWN'),
    source: r.source === 'conversation' ? 'conversation' : 'broadcast',
    billable: Number(r.billable ?? 0),
  }));

  return {
    ...computeManagementFee(counts, rates, feePercent),
    accountId,
    accountName: (account.name as string) ?? '',
    currency,
    month: monthKey,
    from: from.toISOString(),
    to: to.toISOString(),
    rates,
    notReady,
  };
}
