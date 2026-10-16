'use client';

// ============================================================
// BillingSettings — Settings → Plan & billing
//
// Current plan and status, usage against the plan's limits, and the
// plans from /pricing. No payment gateway yet: "Choose" opens WhatsApp
// (or email) to Repeat Grow support with the account and plan filled
// in; support activates the plan from /admin once paid.
// ============================================================

import { useEffect, useState } from 'react';
import { Check, Loader2, Mail, MessageCircle } from 'lucide-react';

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

interface Billing {
  enabled: boolean;
  plan?: string;
  effective_plan?: EffectivePlan;
  trial_ends_at?: string | null;
  plan_expires_at?: string | null;
  limits?: PlanLimits;
  usage?: Record<LimitKey, number>;
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

  useEffect(() => {
    void (async () => {
      const res = await fetch('/api/account/billing', { cache: 'no-store' });
      setBilling(res.ok ? await res.json() : { enabled: false });
    })();
  }, []);

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
        title="Plan & billing"
        description="Your plan, what you're using, and how to upgrade. WhatsApp conversation fees are billed by Meta separately."
      />

      {/* ---------------- Current plan ---------------- */}
      <Card>
        <CardContent className="space-y-1 py-5">
          <div className="flex flex-wrap items-center gap-2">
            <span className="text-foreground text-lg font-semibold">
              {EFFECTIVE_PLAN_LABELS[effective]}
            </span>
            <Badge
              variant={effective === 'expired' ? 'destructive' : 'outline'}
              className="text-[10px] tracking-wide uppercase"
            >
              {effective === 'expired' ? 'Read-only' : 'Active'}
            </Badge>
          </div>
          <p className="text-muted-foreground text-sm">
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
        </CardContent>
      </Card>

      {/* ---------------- Usage ---------------- */}
      <div>
        <h3 className="text-foreground mb-2 text-sm font-semibold">Usage</h3>
        <Card>
          <CardContent className="grid gap-4 py-5 sm:grid-cols-2">
            {LIMIT_KEYS.map((key) => {
              const used = billing.usage![key];
              const limit = billing.limits![key];
              const pct = limit
                ? Math.min(100, Math.round((used / limit) * 100))
                : 0;
              return (
                <div key={key} className="space-y-1.5">
                  <div className="flex justify-between text-xs">
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
                  <div className="bg-muted h-1.5 overflow-hidden rounded-full">
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
          <h3 className="text-foreground text-sm font-semibold">Plans</h3>
          <div className="bg-muted inline-flex rounded-lg p-0.5 text-xs">
            {BILLING_CYCLES.map((p) => (
              <button
                key={p}
                type="button"
                onClick={() => setPeriod(p)}
                className={cn(
                  'rounded-md px-3 py-1.5 font-medium capitalize',
                  period === p
                    ? 'bg-background text-foreground shadow-sm'
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
              <Card key={plan} className={cn(current && 'border-primary')}>
                <CardContent className="flex h-full flex-col gap-3 py-5">
                  <div>
                    <div className="flex items-center gap-2">
                      <span className="text-foreground font-semibold">
                        {info.label}
                      </span>
                      {current && (
                        <Badge className="bg-primary/10 text-primary border-primary/40 text-[10px] uppercase">
                          Current
                        </Badge>
                      )}
                    </div>
                    <p className="text-foreground mt-1 text-2xl font-bold">
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
                  <ul className="text-muted-foreground flex-1 space-y-1 text-xs">
                    {LIMIT_KEYS.map((key) => (
                      <li key={key} className="flex items-center gap-1.5">
                        <Check className="text-primary size-3.5" />
                        {limits[key] === null
                          ? 'Unlimited'
                          : limits[key]!.toLocaleString('en-IN')}{' '}
                        {LIMIT_LABELS[key].toLowerCase()}
                      </li>
                    ))}
                  </ul>
                  {!current && (
                    <div className="flex gap-2">
                      <Button
                        className="flex-1"
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
          Choosing a plan opens WhatsApp to our team with your account details.
          We&apos;ll share payment details (UPI or bank transfer) and activate
          your plan as soon as it&apos;s paid.
        </p>
      </div>
    </section>
  );
}
