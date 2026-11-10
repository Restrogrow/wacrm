// ============================================================
// What AI costs in credits, and what each plan includes.
//
// Pure data and arithmetic so it can be tested and so the numbers live
// in one place. The write path is server.ts; the schema is migration
// 100.
//
// Credits sit ALONGSIDE the per-plan daily caps in lib/ai/quota.ts,
// they do not replace them. The caps answer "how much per day" and
// still guard against a flood from one account; credits answer "how
// much is left" and are what runs out. An action needs both.
// ============================================================

import type { AiFeature } from '@/lib/ai/quota';
import type { EffectivePlan } from '@/lib/billing/plans';

/**
 * Credits per AI action. A row in `credit_rates` overrides one of
 * these without a deploy; an empty table means "use these".
 *
 * The shape of the numbers, rather than the numbers themselves, is the
 * part worth keeping: a voice call is up to ten minutes of Gemini Live
 * and costs us orders of magnitude more than one text completion, so
 * it cannot be one credit like the rest. Text actions are deliberately
 * equal — splitting hairs between a suggestion and a summary would
 * make the rate card harder to read than it is worth.
 */
export const DEFAULT_CREDIT_COSTS: Record<AiFeature, number> = {
  suggest: 1,
  analysis: 1,
  summary: 1,
  chatbot: 1,
  voice_call: 25,
};

/** Days of daily-cap headroom a monthly allowance is sized to cover. */
export const ALLOWANCE_DAYS = 31;

/**
 * Credits included with each plan, per 30-day cycle.
 *
 * These are **safety ceilings, not pricing.** Each one is at least
 * `ALLOWANCE_DAYS` days of that plan's existing AI daily caps, priced at
 * DEFAULT_CREDIT_COSTS — so switching enforcement on cannot restrict any
 * account more than the daily caps already do. The caps stay the binding
 * limit and nobody's chatbot stops who would not have been stopped
 * anyway. `credits.test.ts` asserts that property, so lowering a daily
 * cap or raising a cost cannot silently make a plan's allowance too
 * small.
 *
 * They are deliberately NOT a commercial decision. Lower them when the
 * numbers are actually chosen — `credit_ledger` records every spend, so
 * query real consumption per plan first and set these from that. Until
 * then a generous ceiling is the safe direction to be wrong in: too high
 * means credits do not bite yet, too low means a paying customer's AI
 * stops mid-month.
 */
export const PLAN_MONTHLY_CREDITS: Record<EffectivePlan, number> = {
  trial: 14_000,
  starter: 55_000,
  growth: 270_000,
  pro: 810_000,
  enterprise: 2_700_000,
  // An ended plan already has every AI daily cap at 0; no allowance.
  expired: 0,
};

/** Warn the account once the balance drops to this share of a top-up. */
export const LOW_BALANCE_RATIO = 0.1;
/** …but never nag below this many credits, however big the balance was. */
export const LOW_BALANCE_FLOOR = 50;

export const CREDIT_KINDS = [
  'plan_allowance',
  'admin_grant',
  'topup',
  'spend',
  'refund',
  'expiry',
] as const;
export type CreditKind = (typeof CREDIT_KINDS)[number];

export function isCreditKind(value: unknown): value is CreditKind {
  return (
    typeof value === 'string' &&
    (CREDIT_KINDS as readonly string[]).includes(value)
  );
}

export const CREDIT_KIND_LABELS: Record<CreditKind, string> = {
  plan_allowance: 'Included with your plan',
  admin_grant: 'Added by Repeat Grow',
  topup: 'Top-up',
  spend: 'Used',
  refund: 'Refunded',
  expiry: 'Expired',
};

/** What this feature costs, preferring a rate-card row over the default. */
export function creditCost(
  feature: AiFeature,
  rates?: Partial<Record<string, number>> | null
): number {
  const override = rates?.[feature];
  if (typeof override === 'number' && Number.isFinite(override) && override >= 0) {
    return Math.floor(override);
  }
  return DEFAULT_CREDIT_COSTS[feature];
}

export function planMonthlyCredits(plan: EffectivePlan | null): number {
  // Unknown plan (billing columns missing) is treated like the smallest
  // paid plan, matching aiDailyCap's choice in lib/ai/quota.ts.
  return PLAN_MONTHLY_CREDITS[plan ?? 'starter'];
}

/**
 * Is the balance low enough to warn about?
 *
 * Proportional to what the account last had, so a big account hears
 * about it while there is still time to act, with a floor so a small
 * account is not warned about almost nothing.
 */
export function isLowBalance(balance: number, lastTopUp: number): boolean {
  if (balance <= 0) return false; // Out is not low; it has its own message.
  const threshold = Math.max(LOW_BALANCE_FLOOR, lastTopUp * LOW_BALANCE_RATIO);
  return balance <= threshold;
}

export type BalanceWarning = 'none' | 'low' | 'out';

/**
 * Does this balance deserve a warning, and which one?
 *
 * `allowance` is what the account gets per cycle — the plan's include —
 * so the "low" threshold scales with the size of the account instead of
 * being one number that is alarming for a trial and useless for an
 * enterprise.
 *
 * Only meaningful while enforcement is on. With it off the balance can
 * go negative and means nothing, so the caller filters on that first.
 */
export function balanceWarning(balance: number, allowance: number): BalanceWarning {
  if (balance <= 0) return 'out';
  return isLowBalance(balance, allowance) ? 'low' : 'none';
}

/** What the account's owners and admins are told. */
export function balanceWarningMessage(
  warning: Exclude<BalanceWarning, 'none'>,
  balance: number
): { title: string; body: string } {
  if (warning === 'out') {
    return {
      title: 'AI credits have run out',
      body: 'AI replies, suggestions, summaries and calls are paused until you top up. Your inbox, broadcasts and everything else keep working, and chats are waiting for your team as usual.',
    };
  }
  return {
    title: 'AI credits running low',
    body: `${balance.toLocaleString('en-IN')} credits left. When they run out the AI pauses and chats wait for your team — top up before then to keep it answering.`,
  };
}

/** How many of this action the balance still affords. */
export function actionsAffordable(balance: number, cost: number): number {
  if (cost <= 0) return Infinity;
  if (balance <= 0) return 0;
  return Math.floor(balance / cost);
}

/**
 * The key that makes a charge happen once. Built from what identifies
 * the piece of work, so a retry of the same work reuses it and a
 * genuinely new action does not.
 */
export function spendKey(
  feature: AiFeature,
  ...parts: (string | number | null | undefined)[]
): string {
  return [feature, ...parts.filter((p) => p !== null && p !== undefined)].join(
    ':'
  );
}

/** The allowance key for one account-month, so a re-run cannot double-grant. */
export function allowanceKey(plan: EffectivePlan, monthKey: string): string {
  return `allowance:${plan}:${monthKey}`;
}

/**
 * The current month as `YYYY-MM` in IST — the same timezone the daily
 * AI caps reset on, so "this month" means one thing across the app.
 */
export function istMonthKey(at: Date | number = Date.now()): string {
  const ms = typeof at === 'number' ? at : at.getTime();
  // +05:30, no DST.
  return new Date(ms + 5.5 * 60 * 60 * 1000).toISOString().slice(0, 7);
}

export type SpendOutcome =
  | { ok: true; balance: number; charged: number }
  | { ok: false; reason: 'out_of_credits'; balance: number; needed: number };

/** The customer-facing wording when the balance will not cover an action. */
export function outOfCreditsMessage(feature: AiFeature): string {
  const what =
    feature === 'voice_call' ? 'AI calls' : 'AI features';
  return `Your AI credits have run out, so ${what} are paused. Top up to start them again — everything else keeps working.`;
}
