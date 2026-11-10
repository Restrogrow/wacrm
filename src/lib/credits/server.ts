// ============================================================
// Reading and moving credits — server only (migration 100).
//
// Every write goes through credit_add() / credit_spend(), which keep
// the balance and the append-only ledger in step. Nothing here writes
// either table directly.
//
// Fails OPEN, like lib/ai/quota.ts: if migration 100 is not applied,
// or the rate card cannot be read, AI keeps working. A credit system
// that breaks the product when its own plumbing is missing is worse
// than one that occasionally lets an action through free.
// ============================================================

import { supabaseAdmin } from '@/lib/flows/admin-client';
import type { AiFeature } from '@/lib/ai/quota';
import type { EffectivePlan } from '@/lib/billing/plans';

import {
  allowanceKey,
  creditCost,
  planMonthlyCredits,
  type CreditKind,
  type SpendOutcome,
} from './credits';

/** Logged once, so a missing migration does not spam every request. */
let warnedMissing = false;
function warnMissing(where: string, message: string): void {
  if (warnedMissing) return;
  warnedMissing = true;
  console.warn(
    `[credits] ${where} unavailable (migration 100 not applied?), allowing:`,
    message
  );
}

export interface CreditState {
  balance: number;
  enforced: boolean;
  /** False when the tables are missing, so callers can stay quiet about it. */
  available: boolean;
}

/**
 * The balance and whether it is being enforced for this account.
 * `enforced` is per account (`accounts.credits_enforced`) and ships
 * false everywhere — see migration 100.
 */
export async function creditState(accountId: string): Promise<CreditState> {
  // try/catch, not just the error field: the tables may be missing, but
  // the client may also be unreachable or stubbed. Either way the answer
  // is "credits unavailable, let the action through" — never a throw
  // that takes the inbox's AI down with it.
  try {
    const db = supabaseAdmin();
    const [{ data: account, error: accountErr }, { data: row, error: rowErr }] =
      await Promise.all([
        db
          .from('accounts')
          .select('credits_enforced')
          .eq('id', accountId)
          .maybeSingle(),
        db
          .from('account_credits')
          .select('balance')
          .eq('account_id', accountId)
          .maybeSingle(),
      ]);

    if (accountErr || rowErr) {
      warnMissing(
        'account_credits',
        (accountErr ?? rowErr)?.message ?? 'unknown'
      );
      return { balance: 0, enforced: false, available: false };
    }

    return {
      balance: Number((row as { balance?: number } | null)?.balance ?? 0),
      enforced:
        (account as { credits_enforced?: boolean } | null)?.credits_enforced ===
        true,
      available: true,
    };
  } catch (err) {
    warnMissing('account_credits', err instanceof Error ? err.message : 'threw');
    return { balance: 0, enforced: false, available: false };
  }
}

/** The rate-card overrides, keyed by feature. Empty means "use defaults". */
export async function creditRates(): Promise<Record<string, number>> {
  try {
    const { data, error } = await supabaseAdmin()
      .from('credit_rates')
      .select('feature, credits');
    if (error || !data) return {};
    const rates: Record<string, number> = {};
    for (const row of data as { feature: string; credits: number }[]) {
      rates[row.feature] = Number(row.credits);
    }
    return rates;
  } catch {
    // No rate card readable: the built-in defaults apply.
    return {};
  }
}

/**
 * Charge for one AI action.
 *
 * `idempotencyKey` is what makes a retry of the same work free. Pass
 * one whenever the caller can be re-run — a webhook, a cron, a
 * double-submitted button.
 */
export async function spendCredits(
  accountId: string,
  feature: AiFeature,
  idempotencyKey?: string
): Promise<SpendOutcome> {
  const [state, rates] = await Promise.all([
    creditState(accountId),
    creditRates(),
  ]);
  const cost = creditCost(feature, rates);

  // Tables missing: let it through rather than break the product.
  if (!state.available) return { ok: true, balance: 0, charged: 0 };

  let data: unknown;
  try {
    const result = await supabaseAdmin().rpc('credit_spend', {
      p_account_id: accountId,
      p_credits: cost,
      p_feature: feature,
      p_enforced: state.enforced,
      p_idempotency_key: idempotencyKey ?? null,
    });
    if (result.error) {
      warnMissing('credit_spend', result.error.message);
      return { ok: true, balance: state.balance, charged: 0 };
    }
    data = result.data;
  } catch (err) {
    warnMissing('credit_spend', err instanceof Error ? err.message : 'threw');
    return { ok: true, balance: state.balance, charged: 0 };
  }

  // NULL from credit_spend means refused for want of credits. Only
  // reachable when enforcement is on.
  if (data === null) {
    return {
      ok: false,
      reason: 'out_of_credits',
      balance: state.balance,
      needed: cost,
    };
  }

  return { ok: true, balance: Number(data), charged: cost };
}

/**
 * Give an action's credits back, for work that was charged and then
 * failed. A new ledger row, never an edit of the old one.
 */
export async function refundCredits(
  accountId: string,
  feature: AiFeature,
  idempotencyKey: string,
  note?: string
): Promise<void> {
  const rates = await creditRates();
  const cost = creditCost(feature, rates);
  if (cost <= 0) return;

  const { error } = await supabaseAdmin().rpc('credit_add', {
    p_account_id: accountId,
    p_credits: cost,
    p_kind: 'refund' satisfies CreditKind,
    p_note: note ?? null,
    p_feature: feature,
    // Distinct from the spend's key, or the refund would collide with it.
    p_idempotency_key: `refund:${idempotencyKey}`,
    p_created_by: null,
  });
  if (error) console.error('[credits] refund failed:', error.message);
}

export interface AddCreditsInput {
  accountId: string;
  credits: number;
  kind: CreditKind;
  note?: string | null;
  idempotencyKey?: string | null;
  createdBy?: string | null;
}

/**
 * Add credits — a platform admin's grant, a paid top-up, or the
 * monthly plan allowance. Returns the balance afterwards, or null if
 * the write failed.
 */
export async function addCredits(
  input: AddCreditsInput
): Promise<number | null> {
  if (!Number.isInteger(input.credits) || input.credits <= 0) {
    throw new Error('credits must be a positive whole number');
  }
  const { data, error } = await supabaseAdmin().rpc('credit_add', {
    p_account_id: input.accountId,
    p_credits: input.credits,
    p_kind: input.kind,
    p_note: input.note ?? null,
    p_feature: null,
    p_idempotency_key: input.idempotencyKey ?? null,
    p_created_by: input.createdBy ?? null,
  });
  if (error) {
    console.error('[credits] add failed:', error.message);
    return null;
  }
  return Number(data);
}

/**
 * Top the account up to its plan's monthly include, once per cycle.
 *
 * Idempotent on (plan, month), so the cron can run every minute and
 * only the first call in a month grants. Called from the automations
 * cron rather than on login, so an account that nobody signs into
 * still gets its allowance and its AI keeps answering customers.
 */
export async function grantMonthlyAllowance(
  accountId: string,
  plan: EffectivePlan,
  monthKey: string
): Promise<number | null> {
  const credits = planMonthlyCredits(plan);
  if (credits <= 0) return null;
  return addCredits({
    accountId,
    credits,
    kind: 'plan_allowance',
    note: `${plan} plan, ${monthKey}`,
    idempotencyKey: allowanceKey(plan, monthKey),
  });
}
