'use client';

// ============================================================
// BillingSettings — Settings → Plan & billing
//
// Current plan and status, usage against the plan's limits, and the
// plans from /pricing. No payment gateway yet: "Choose" opens WhatsApp
// (or email) to Repeat Grow support with the account and plan filled
// in; support activates the plan from /admin once paid.
// ============================================================

import { IconChip } from '@/components/icon-chip';
import { useEffect, useState } from 'react';
import { toast } from 'sonner';
import { Check, Loader2, Mail, MessageCircle, CreditCard, Sparkles, BarChart3, Crown, ShoppingBag, X } from 'lucide-react';

import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { cn } from '@/lib/utils';
import { useAuth } from '@/hooks/use-auth';
import {
  EFFECTIVE_PLAN_LABELS,
  LIMIT_KEYS,
  LIMIT_LABELS,
  PLANS,
  PLAN_INFO,
  BILLING_CYCLES,
  BILLING_CYCLE_LABELS,
  SHOPIFY_BILLABLE_CYCLES,
  cycleSavingPercent,
  type BillingCycle,
  PLAN_LIMITS,
  daysLeft,
  formatInr,
  type EffectivePlan,
  type LimitKey,
  type PaidPlan,
  type PlanLimits,
} from '@/lib/billing/plans';
import { SUPPORT_EMAIL, SUPPORT_PHONE } from '@/lib/seo';
import { SettingsPanelHead } from './settings-panel-head';
import { CreditsPanel } from './credits-panel';

interface Billing {
  enabled: boolean;
  plan?: string;
  effective_plan?: EffectivePlan;
  trial_ends_at?: string | null;
  plan_expires_at?: string | null;
  limits?: PlanLimits;
  usage?: Record<LimitKey, number>;
  bills_through_shopify?: boolean;
  shopify_pending_plan?: PaidPlan | null;
  shopify_pending_cycle?: BillingCycle | null;
}

function fmtDate(iso: string | null | undefined): string {
  if (!iso) return '—';
  return new Date(iso).toLocaleDateString('en-IN', {
    day: 'numeric',
    month: 'short',
    year: 'numeric',
  });
}

export function BillingSettings() {
  const { account, profile } = useAuth();
  const [billing, setBilling] = useState<Billing | null>(null);
  const [period, setPeriod] = useState<BillingCycle>('monthly');
  const [requestingPlan, setRequestingPlan] = useState<PaidPlan | null>(null);
  const [cancelling, setCancelling] = useState(false);

  const load = async () => {
    const res = await fetch('/api/account/billing', { cache: 'no-store' });
    setBilling(res.ok ? await res.json() : { enabled: false });
  };

  useEffect(() => {
    void load();
  }, []);

  const bySh = billing?.bills_through_shopify ?? false;
  const cycles = bySh ? SHOPIFY_BILLABLE_CYCLES : BILLING_CYCLES;

  const requestShopifyPlan = async (plan: PaidPlan) => {
    setRequestingPlan(plan);
    try {
      const res = await fetch('/api/account/billing/shopify', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ plan, cycle: period }),
      });
      const json = await res.json().catch(() => ({}));
      if (!res.ok || !json.confirmationUrl) {
        toast.error(json.error ?? 'Could not start the Shopify subscription');
        setRequestingPlan(null);
        return;
      }
      window.location.href = json.confirmationUrl;
    } catch {
      toast.error('Could not reach the server');
      setRequestingPlan(null);
    }
  };

  const cancelShopifyPlan = async () => {
    setCancelling(true);
    try {
      const res = await fetch('/api/account/billing/shopify', { method: 'DELETE' });
      const json = await res.json().catch(() => ({}));
      if (!res.ok) {
        toast.error(json.error ?? 'Could not cancel the request');
        return;
      }
      toast.success('Shopify subscription cancelled.');
      await load();
    } finally {
      setCancelling(false);
    }
  };

  if (!billing) {
    return (
      <div className="flex items-center justify-center py-12">
        <Loader2 className="text-primary size-6 animate-spin" />
      </div>
    );
  }

  if (
    !billing.enabled ||
    !billing.effective_plan ||
    !billing.limits ||
    !billing.usage
  ) {
    return (
      <section className="space-y-6">
        <SettingsPanelHead title="Plan & billing" />
        <Card>
          <CardContent className="text-muted-foreground py-6 text-sm">
            Billing isn&apos;t set up yet. Run
            supabase/migrations/041_plans_and_trials.sql in the Supabase SQL
            Editor.
          </CardContent>
        </Card>
      </section>
    );
  }

  const effective = billing.effective_plan;
  const trialDays = daysLeft(billing.trial_ends_at ?? null);

  const requestText = (plan: PaidPlan) => {
    const info = PLAN_INFO[plan];
    const price = info.prices
      ? `${formatInr(info.prices[period])}/${BILLING_CYCLE_LABELS[period].per}`
      : 'custom pricing';
    return `Hi Repeat Grow, I'd like the ${info.label} plan (${price}) for "${account?.name ?? 'my account'}" (account ${account?.id ?? ''}, ${profile?.email ?? ''}).`;
  };
  const whatsappLink = (plan: PaidPlan) =>
    `https://wa.me/${SUPPORT_PHONE.replace(/\D/g, '')}?text=${encodeURIComponent(requestText(plan))}`;
  const emailLink = (plan: PaidPlan) =>
    `mailto:${SUPPORT_EMAIL}?subject=${encodeURIComponent(`Repeat Grow ${PLAN_INFO[plan].label} plan`)}&body=${encodeURIComponent(requestText(plan))}`;

  return (
    <section className="animate-in fade-in-50 space-y-6 duration-200">
      <SettingsPanelHead
        icon={CreditCard}
        title="Plan & billing"
        description="Your plan, what you're using, and how to upgrade. WhatsApp conversation fees are billed by Meta separately."
      />

      {/* ---------------- Current plan ---------------- */}
      <div className="via-primary relative overflow-hidden rounded-3xl bg-gradient-to-br from-[var(--rail)] to-emerald-400 p-6 text-white shadow-lg sm:p-7">
        <div className="pointer-events-none absolute -top-16 -right-16 size-60 rounded-full bg-white/10 blur-2xl" />
        <div className="relative flex flex-wrap items-center justify-between gap-4">
          <div>
            <p className="text-sm font-medium text-white/75">
              Your current plan
            </p>
            <div className="mt-1 flex flex-wrap items-center gap-3">
              <span className="text-3xl font-bold tracking-tight">
                {EFFECTIVE_PLAN_LABELS[effective]}
              </span>
              <span
                className={cn(
                  'rounded-full px-3 py-1 text-xs font-bold tracking-wide uppercase',
                  effective === 'expired'
                    ? 'bg-red-500 text-white'
                    : 'bg-white/25 text-white backdrop-blur'
                )}
              >
                {effective === 'expired' ? 'Read-only' : 'Active'}
              </span>
            </div>
            <p className="mt-2 max-w-xl text-sm text-white/85">
              {effective === 'trial' &&
                `Full Growth features until ${fmtDate(billing.trial_ends_at)} (${trialDays} day${trialDays === 1 ? '' : 's'} left).`}
              {effective === 'expired' &&
                'Your trial has ended. You can still see everything, but sending WhatsApp messages is paused until you choose a plan.'}
              {effective !== 'trial' &&
                effective !== 'expired' &&
                (billing.plan_expires_at
                  ? `Paid until ${fmtDate(billing.plan_expires_at)}.`
                  : 'Active with no end date.')}
            </p>
          </div>
          <span className="flex size-16 items-center justify-center rounded-3xl bg-white/20 backdrop-blur">
            <Sparkles className="size-8" />
          </span>
        </div>
      </div>

      {bySh && billing.shopify_pending_plan && (
        <Card className="border-amber-300/60 bg-amber-50 dark:bg-amber-950/20">
          <CardContent className="flex flex-wrap items-center justify-between gap-3 py-4">
            <p className="text-sm text-amber-900 dark:text-amber-200">
              Waiting for approval on Shopify for the{' '}
              <strong>{PLAN_INFO[billing.shopify_pending_plan].label}</strong>{' '}
              ({billing.shopify_pending_cycle ?? 'monthly'}) plan. Approve it on
              Shopify, or cancel the request below.
            </p>
            <Button
              variant="outline"
              size="sm"
              disabled={cancelling}
              onClick={cancelShopifyPlan}
            >
              {cancelling ? (
                <Loader2 className="size-4 animate-spin" />
              ) : (
                <X className="size-4" />
              )}
              Cancel request
            </Button>
          </CardContent>
        </Card>
      )}

      {/* ---------------- Usage ---------------- */}
      <CreditsPanel />

      <div>
        <h3 className="text-foreground mb-3 flex items-center gap-2 text-base font-bold tracking-tight">
          <IconChip icon={BarChart3} className="size-9 rounded-xl" />
          Usage
        </h3>
        <Card>
          <CardContent className="grid gap-5 sm:grid-cols-2">
            {LIMIT_KEYS.map((key) => {
              const used = billing.usage![key];
              const limit = billing.limits![key];
              const pct = limit
                ? Math.min(100, Math.round((used / limit) * 100))
                : 0;
              return (
                <div
                  key={key}
                  className="bg-muted/50 space-y-2 rounded-2xl p-4"
                >
                  <div className="flex justify-between text-sm">
                    <span className="text-muted-foreground">
                      {LIMIT_LABELS[key]}
                    </span>
                    <span className="text-foreground font-medium">
                      {used.toLocaleString('en-IN')} /{' '}
                      {limit === null
                        ? 'Unlimited'
                        : limit.toLocaleString('en-IN')}
                    </span>
                  </div>
                  <div className="bg-border h-2.5 overflow-hidden rounded-full">
                    <div
                      className={cn(
                        'h-full rounded-full',
                        pct >= 100
                          ? 'bg-red-500'
                          : pct >= 80
                            ? 'bg-amber-500'
                            : 'bg-primary'
                      )}
                      style={{ width: limit === null ? '0%' : `${pct}%` }}
                    />
                  </div>
                </div>
              );
            })}
          </CardContent>
        </Card>
      </div>

      {/* ---------------- Plans ---------------- */}
      <div>
        <div className="mb-3 flex flex-wrap items-center justify-between gap-3">
          <h3 className="text-foreground flex items-center gap-2 text-base font-bold tracking-tight">
            <IconChip icon={Crown} className="size-9 rounded-xl" />
            Plans
          </h3>
          <div className="bg-muted inline-flex rounded-full p-1 text-xs">
            {cycles.map((p) => (
              <button
                key={p}
                type="button"
                onClick={() => setPeriod(p)}
                className={cn(
                  'rounded-full px-4 py-1.5 font-semibold capitalize transition-colors',
                  period === p
                    ? 'bg-primary text-primary-foreground shadow-sm'
                    : 'text-muted-foreground'
                )}
              >
                {BILLING_CYCLE_LABELS[p].label}
                {p !== 'monthly' && (
                  <span className="text-primary ml-1">
                    · save {cycleSavingPercent('starter', p)}%
                  </span>
                )}
              </button>
            ))}
          </div>
        </div>
        <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
          {PLANS.map((plan) => {
            const info = PLAN_INFO[plan];
            const limits = PLAN_LIMITS[plan];
            const current = effective === plan;
            return (
              <Card
                key={plan}
                className={cn(
                  'transition-all hover:-translate-y-0.5 hover:shadow-md',
                  current && 'ring-primary shadow-md ring-2'
                )}
              >
                <CardContent className="flex h-full flex-col gap-4">
                  <div>
                    <div className="flex items-center gap-2">
                      <span className="text-foreground text-lg font-bold tracking-tight">
                        {info.label}
                      </span>
                      {current && (
                        <Badge className="bg-primary/10 text-primary border-primary/40 text-[10px] uppercase">
                          Current
                        </Badge>
                      )}
                    </div>
                    <p className="text-foreground mt-2 text-3xl font-bold tracking-tight">
                      {info.prices ? (
                        <>
                          {formatInr(info.prices[period])}
                          <span className="text-muted-foreground text-sm font-normal">
                            /{BILLING_CYCLE_LABELS[period].per}
                          </span>
                        </>
                      ) : (
                        'Custom'
                      )}
                    </p>
                    <p className="text-muted-foreground mt-1 text-xs">
                      {info.blurb}
                    </p>
                  </div>
                  <ul className="text-muted-foreground border-border flex-1 space-y-2 border-t pt-4 text-sm">
                    {LIMIT_KEYS.map((key) => (
                      <li key={key} className="flex items-center gap-1.5">
                        <span className="bg-primary-soft flex size-5 items-center justify-center rounded-full">
                          <Check className="text-primary size-3" />
                        </span>
                        {limits[key] === null
                          ? 'Unlimited'
                          : limits[key]!.toLocaleString('en-IN')}{' '}
                        {LIMIT_LABELS[key].toLowerCase()}
                      </li>
                    ))}
                  </ul>
                  {!current && bySh && info.prices && (
                    <Button
                      className="flex-1"
                      disabled={requestingPlan !== null}
                      onClick={() => requestShopifyPlan(plan)}
                    >
                      {requestingPlan === plan ? (
                        <Loader2 className="size-4 animate-spin" />
                      ) : (
                        <ShoppingBag className="size-4" />
                      )}
                      Choose {info.label}
                    </Button>
                  )}
                  {!current && (!bySh || !info.prices) && (
                    <div className="flex gap-2">
                      <Button
                        className="flex-1"
                        nativeButton={false}
                        render={
                          <a
                            href={whatsappLink(plan)}
                            target="_blank"
                            rel="noopener noreferrer"
                          />
                        }
                      >
                        <MessageCircle className="size-4" />
                        Choose {info.label}
                      </Button>
                      <Button
                        variant="outline"
                        size="icon"
                        aria-label={`Email us about ${info.label}`}
                        nativeButton={false}
                        render={<a href={emailLink(plan)} />}
                      >
                        <Mail className="size-4" />
                      </Button>
                    </div>
                  )}
                </CardContent>
              </Card>
            );
          })}
        </div>
        <p className="text-muted-foreground mt-3 text-xs">
          {bySh
            ? "Billed through Shopify, on your store's existing payment method — approve it on Shopify's page and it takes effect once confirmed. Enterprise is custom pricing, so that one still goes through our team."
            : "Choosing a plan opens WhatsApp to our team with your account details. We'll share payment details (UPI or bank transfer) and activate your plan as soon as it's paid."}
        </p>
      </div>
    </section>
  );
}
