// ============================================================
// Plans, prices and limits — pure, usable on client and server.
//
// Mirrors /pricing and the database (migration 041: plan_limit()).
// Change all three together. No payment gateway yet: a platform admin
// sets accounts.plan / plan_expires_at in /admin when a business pays.
// ============================================================

export const PLANS = ['starter', 'growth', 'pro', 'enterprise'] as const;
export type PaidPlan = (typeof PLANS)[number];
export type AccountPlan = PaidPlan | 'trial';
/** What the account can do right now. */
export type EffectivePlan = AccountPlan | 'expired';

export const LIMIT_KEYS = [
  'contacts',
  'broadcasts_per_month',
  'automation_flows',
  'custom_fields',
  'team_members',
] as const;
export type LimitKey = (typeof LIMIT_KEYS)[number];

/** null = unlimited. */
export type PlanLimits = Record<LimitKey, number | null>;

const STARTER: PlanLimits = {
  contacts: 2000,
  broadcasts_per_month: 60,
  automation_flows: 5,
  custom_fields: 5,
  team_members: 5,
};
const GROWTH: PlanLimits = {
  contacts: 50000,
  broadcasts_per_month: 250,
  automation_flows: 25,
  custom_fields: 25,
  team_members: 25,
};
const PRO: PlanLimits = {
  contacts: 200000,
  broadcasts_per_month: 1000,
  automation_flows: 100,
  custom_fields: 100,
  team_members: 50,
};
const UNLIMITED: PlanLimits = {
  contacts: null,
  broadcasts_per_month: null,
  automation_flows: null,
  custom_fields: null,
  team_members: null,
};

export const PLAN_LIMITS: Record<EffectivePlan, PlanLimits> = {
  starter: STARTER,
  growth: GROWTH,
  pro: PRO,
  enterprise: UNLIMITED,
  trial: GROWTH,
  expired: STARTER,
};

export const LIMIT_LABELS: Record<LimitKey, string> = {
  contacts: 'Contacts',
  broadcasts_per_month: 'Broadcasts this month',
  automation_flows: 'Automations & flows',
  custom_fields: 'Custom fields',
  team_members: 'Team members (incl. invites)',
};

export const BILLING_CYCLES = ['monthly', 'quarterly', 'yearly'] as const;
export type BillingCycle = (typeof BILLING_CYCLES)[number];

export const BILLING_CYCLE_LABELS: Record<BillingCycle, { label: string; per: string; months: number }> = {
  monthly: { label: 'Monthly', per: 'month', months: 1 },
  quarterly: { label: 'Quarterly', per: 'quarter', months: 3 },
  yearly: { label: 'Yearly', per: 'year', months: 12 },
};

/** Prices in rupees per billing cycle. null = custom pricing (talk to us). */
export const PLAN_INFO: Record<
  PaidPlan,
  { label: string; prices: Record<BillingCycle, number> | null; blurb: string }
> = {
  starter: {
    label: 'Starter',
    prices: { monthly: 999, quarterly: 2699, yearly: 9999 },
    blurb: 'For a single team getting started with WhatsApp support and sales.',
  },
  growth: {
    label: 'Growth',
    prices: { monthly: 1999, quarterly: 5399, yearly: 19999 },
    blurb:
      'For growing teams running more campaigns with more people on the inbox.',
  },
  pro: {
    label: 'Pro',
    prices: { monthly: 3999, quarterly: 10799, yearly: 39999 },
    blurb: 'For high-volume teams with large contact lists and many agents.',
  },
  enterprise: {
    label: 'Enterprise',
    prices: null,
    blurb: 'Custom pricing for no caps, multiple brands and hands-on setup.',
  },
};

/** Whole-percent saving of a longer cycle versus paying monthly. */
export function cycleSavingPercent(plan: PaidPlan, cycle: BillingCycle): number | null {
  const p = PLAN_INFO[plan].prices;
  if (!p || cycle === 'monthly') return null;
  const full = p.monthly * BILLING_CYCLE_LABELS[cycle].months;
  return Math.round(((full - p[cycle]) / full) * 100);
}

export const EFFECTIVE_PLAN_LABELS: Record<EffectivePlan, string> = {
  trial: 'Free trial',
  starter: 'Starter',
  growth: 'Growth',
  pro: 'Pro',
  enterprise: 'Enterprise',
  expired: 'Trial ended',
};

export interface AccountBilling {
  plan: AccountPlan;
  trial_ends_at: string | null;
  plan_expires_at: string | null;
}

/** Same rules as account_effective_plan() in migration 041. */
export function effectivePlan(
  account: AccountBilling,
  now = Date.now()
): EffectivePlan {
  if (account.plan !== 'trial') {
    const expires = account.plan_expires_at
      ? Date.parse(account.plan_expires_at)
      : null;
    return expires === null || expires > now ? account.plan : 'expired';
  }
  const trialEnds = account.trial_ends_at
    ? Date.parse(account.trial_ends_at)
    : 0;
  return trialEnds > now ? 'trial' : 'expired';
}

/** Whole days left until `iso` (rounded up), or null. */
export function daysLeft(iso: string | null, now = Date.now()): number | null {
  if (!iso) return null;
  const ms = Date.parse(iso) - now;
  if (Number.isNaN(ms)) return null;
  return Math.max(0, Math.ceil(ms / 86_400_000));
}

export function formatInr(amount: number): string {
  return new Intl.NumberFormat('en-IN', {
    style: 'currency',
    currency: 'INR',
    maximumFractionDigits: 0,
  }).format(amount);
}

export const PLAN_EXPIRED_MESSAGE =
  'Your free trial has ended, so sending WhatsApp messages is paused. Choose a plan in Settings → Plan & billing to continue.';

/** SQLSTATE raised by the plan-limit triggers (migration 041). */
export const PLAN_LIMIT_ERROR_CODE = 'PL001';

/** The user-facing message when a database error is a plan limit, else null. */
export function planLimitMessage(error: unknown): string | null {
  if (!error || typeof error !== 'object') return null;
  const { code, message } = error as { code?: string; message?: string };
  return code === PLAN_LIMIT_ERROR_CODE && message ? message : null;
}
