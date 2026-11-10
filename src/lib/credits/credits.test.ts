import { describe, expect, it } from 'vitest';

import { AI_DAILY_CAPS } from '@/lib/ai/quota';
import {
  ALLOWANCE_DAYS,
  DEFAULT_CREDIT_COSTS,
  LOW_BALANCE_FLOOR,
  PLAN_MONTHLY_CREDITS,
  actionsAffordable,
  allowanceKey,
  creditCost,
  isCreditKind,
  isLowBalance,
  istMonthKey,
  planMonthlyCredits,
  spendKey,
} from './credits';

describe('creditCost', () => {
  it('uses the built-in cost when the rate card is empty', () => {
    expect(creditCost('chatbot', {})).toBe(DEFAULT_CREDIT_COSTS.chatbot);
    expect(creditCost('chatbot', null)).toBe(DEFAULT_CREDIT_COSTS.chatbot);
    expect(creditCost('chatbot')).toBe(DEFAULT_CREDIT_COSTS.chatbot);
  });

  it('lets a rate-card row override it', () => {
    expect(creditCost('chatbot', { chatbot: 3 })).toBe(3);
  });

  it('allows a feature to be made free', () => {
    expect(creditCost('summary', { summary: 0 })).toBe(0);
  });

  it('ignores a nonsense override rather than charging it', () => {
    // A bad row must not make everything free or charge a fraction.
    expect(creditCost('chatbot', { chatbot: -5 })).toBe(
      DEFAULT_CREDIT_COSTS.chatbot
    );
    expect(creditCost('chatbot', { chatbot: Number.NaN })).toBe(
      DEFAULT_CREDIT_COSTS.chatbot
    );
    expect(creditCost('chatbot', { chatbot: 2.7 })).toBe(2);
  });

  it('charges a voice call far more than a text action', () => {
    // Ten minutes of Gemini Live is not one text completion. The exact
    // numbers are tunable; this ordering is the part that must hold.
    expect(DEFAULT_CREDIT_COSTS.voice_call).toBeGreaterThan(
      DEFAULT_CREDIT_COSTS.chatbot * 5
    );
  });
});

describe('PLAN_MONTHLY_CREDITS is never stricter than the daily caps', () => {
  // The reason enforcement can be switched on for everyone at once: a
  // plan's allowance covers ALLOWANCE_DAYS days of maxing out every one
  // of its daily caps, so credits cannot stop an account that the caps
  // would have let through. If someone lowers a cap or raises a cost,
  // this fails instead of quietly throttling a paying customer.
  const PLANS = ['trial', 'starter', 'growth', 'pro', 'enterprise'] as const;

  for (const plan of PLANS) {
    it(`covers ${ALLOWANCE_DAYS} days of ${plan}'s caps`, () => {
      const caps = AI_DAILY_CAPS[plan];
      const perDay = (Object.keys(caps) as (keyof typeof caps)[]).reduce(
        (sum, feature) => sum + caps[feature] * DEFAULT_CREDIT_COSTS[feature],
        0
      );
      expect(PLAN_MONTHLY_CREDITS[plan]).toBeGreaterThanOrEqual(
        perDay * ALLOWANCE_DAYS
      );
    });
  }

  it('gives an expired plan nothing, because its caps are already zero', () => {
    const caps = AI_DAILY_CAPS.expired;
    expect(Object.values(caps).every((c) => c === 0)).toBe(true);
    expect(PLAN_MONTHLY_CREDITS.expired).toBe(0);
  });
});

describe('planMonthlyCredits', () => {
  it('rises with the plan', () => {
    const order = ['trial', 'starter', 'growth', 'pro', 'enterprise'] as const;
    for (let i = 1; i < order.length; i++) {
      expect(PLAN_MONTHLY_CREDITS[order[i]]).toBeGreaterThan(
        PLAN_MONTHLY_CREDITS[order[i - 1]]
      );
    }
  });

  it('gives an ended plan nothing', () => {
    expect(planMonthlyCredits('expired')).toBe(0);
  });

  it('treats an unknown plan as the smallest paid one', () => {
    // Matches aiDailyCap's choice when the billing columns are missing.
    expect(planMonthlyCredits(null)).toBe(PLAN_MONTHLY_CREDITS.starter);
  });
});

describe('isLowBalance', () => {
  it('warns at a tenth of what was last added', () => {
    expect(isLowBalance(900, 10_000)).toBe(true);
    expect(isLowBalance(1_100, 10_000)).toBe(false);
  });

  it('does not nag a small account about almost nothing', () => {
    // 10% of 100 is 10, but the floor keeps the warning useful.
    expect(isLowBalance(40, 100)).toBe(true);
    expect(isLowBalance(LOW_BALANCE_FLOOR + 1, 100)).toBe(false);
  });

  it('is false at or below zero — out is not low', () => {
    // Running out has its own message; this would double up on it.
    expect(isLowBalance(0, 10_000)).toBe(false);
    expect(isLowBalance(-50, 10_000)).toBe(false);
  });
});

describe('actionsAffordable', () => {
  it('rounds down', () => {
    // 10 credits at 3 each buys 3 actions and leaves 1 stranded.
    expect(actionsAffordable(10, 3)).toBe(3);
    expect(actionsAffordable(9, 3)).toBe(3);
    expect(actionsAffordable(2, 3)).toBe(0);
  });

  it('is zero when out', () => {
    expect(actionsAffordable(0, 1)).toBe(0);
    expect(actionsAffordable(-5, 1)).toBe(0);
  });

  it('is unlimited for a free feature', () => {
    expect(actionsAffordable(0, 0)).toBe(Infinity);
  });
});

describe('keys', () => {
  it('builds a spend key from the identifying parts', () => {
    expect(spendKey('chatbot', 'msg-1')).toBe('chatbot:msg-1');
    // A missing part must not leave a dangling separator, or two
    // different actions could collide on one key.
    expect(spendKey('chatbot', undefined)).toBe('chatbot');
    expect(spendKey('voice_call', null, 'call-9')).toBe('voice_call:call-9');
  });

  it('scopes the allowance key to plan and month', () => {
    expect(allowanceKey('growth', '2026-11')).toBe('allowance:growth:2026-11');
    // A plan change mid-month grants the new plan's include on purpose.
    expect(allowanceKey('pro', '2026-11')).not.toBe(
      allowanceKey('growth', '2026-11')
    );
  });

  it('reads the month in IST, not UTC', () => {
    // 2026-11-30 23:00 UTC is already December in India, and the daily
    // AI caps roll over on the same clock.
    expect(istMonthKey(Date.parse('2026-11-30T23:00:00Z'))).toBe('2026-12');
    expect(istMonthKey(Date.parse('2026-11-30T17:00:00Z'))).toBe('2026-11');
  });
});

describe('isCreditKind', () => {
  it('accepts the ledger kinds and nothing else', () => {
    expect(isCreditKind('topup')).toBe(true);
    expect(isCreditKind('spend')).toBe(true);
    expect(isCreditKind('gift')).toBe(false);
    expect(isCreditKind(null)).toBe(false);
  });
});
