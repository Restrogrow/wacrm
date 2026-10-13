'use client';

// ============================================================
// PlanBanner — thin bar above every app page when the account is on
// its free trial, the trial has ended (read-only: sending is paused),
// or a paid plan is about to run out. Links to Settings → Plan &
// billing. Hidden on paid plans with time left, and when billing isn't
// set up (migration 041 missing).
// ============================================================

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { AlertTriangle, Sparkles } from 'lucide-react';

import { cn } from '@/lib/utils';
import { daysLeft, type EffectivePlan } from '@/lib/billing/plans';

interface BillingSummary {
  enabled: boolean;
  effective_plan?: EffectivePlan;
  trial_ends_at?: string | null;
  plan_expires_at?: string | null;
}

export function PlanBanner() {
  const [billing, setBilling] = useState<BillingSummary | null>(null);

  useEffect(() => {
    let cancelled = false;
    void (async () => {
      try {
        const res = await fetch('/api/account/billing', { cache: 'no-store' });
        if (!res.ok) return;
        const json = (await res.json()) as BillingSummary;
        if (!cancelled) setBilling(json);
      } catch {
        // No banner if billing can't be loaded.
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  if (!billing?.enabled || !billing.effective_plan) return null;

  let tone: 'info' | 'warn' | 'danger';
  let text: string;
  if (billing.effective_plan === 'expired') {
    tone = 'danger';
    text = 'Your free trial has ended — sending WhatsApp messages is paused.';
  } else if (billing.effective_plan === 'trial') {
    const days = daysLeft(billing.trial_ends_at ?? null) ?? 0;
    tone = days <= 2 ? 'warn' : 'info';
    text =
      days <= 0
        ? 'Your free trial ends today.'
        : `Free trial: ${days} day${days === 1 ? '' : 's'} left.`;
  } else {
    const days = daysLeft(billing.plan_expires_at ?? null);
    if (days === null || days > 5) return null;
    tone = 'warn';
    text =
      days <= 0
        ? 'Your plan ends today.'
        : `Your plan ends in ${days} day${days === 1 ? '' : 's'}.`;
  }

  return (
    <div
      className={cn(
        'flex flex-wrap items-center justify-center gap-x-3 gap-y-1 border-b px-4 py-2 text-center text-xs sm:text-sm',
        tone === 'info' && 'border-primary/20 bg-primary/10 text-foreground',
        tone === 'warn' &&
          'text-foreground border-amber-500/30 bg-amber-500/10',
        tone === 'danger' && 'text-foreground border-red-500/30 bg-red-500/10'
      )}
      role={tone === 'danger' ? 'alert' : 'status'}
    >
      <span className="inline-flex items-center gap-1.5">
        {tone === 'info' ? (
          <Sparkles className="text-primary size-4" />
        ) : (
          <AlertTriangle
            className={cn(
              'size-4',
              tone === 'danger' ? 'text-red-500' : 'text-amber-500'
            )}
          />
        )}
        {text}
      </span>
      <Link
        href="/settings?tab=billing"
        className="text-primary font-medium underline-offset-4 hover:underline"
      >
        {billing.effective_plan === 'expired' ? 'Choose a plan' : 'See plans'}
      </Link>
    </div>
  );
}
