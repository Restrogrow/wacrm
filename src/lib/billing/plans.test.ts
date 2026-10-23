import { describe, expect, it } from 'vitest';

import { PLAN_INFO, PLAN_LIMITS, cycleSavingPercent, daysLeft, effectivePlan } from './plans';

const now = Date.parse('2026-10-14T12:00:00Z');
const future = '2026-10-20T12:00:00Z';
const past = '2026-10-01T12:00:00Z';

describe('effectivePlan', () => {
  it('trials run until trial_ends_at, then expire', () => {
    expect(
      effectivePlan(
        { plan: 'trial', trial_ends_at: future, plan_expires_at: null },
        now
      )
    ).toBe('trial');
    expect(
      effectivePlan(
        { plan: 'trial', trial_ends_at: past, plan_expires_at: null },
        now
      )
    ).toBe('expired');
    expect(
      effectivePlan(
        { plan: 'trial', trial_ends_at: null, plan_expires_at: null },
        now
      )
    ).toBe('expired');
  });

  it('paid plans are active until their paid-until date (or forever)', () => {
    expect(
      effectivePlan(
        { plan: 'growth', trial_ends_at: past, plan_expires_at: null },
        now
      )
    ).toBe('growth');
    expect(
      effectivePlan(
        { plan: 'starter', trial_ends_at: past, plan_expires_at: future },
        now
      )
    ).toBe('starter');
    expect(
      effectivePlan(
        { plan: 'enterprise', trial_ends_at: null, plan_expires_at: past },
        now
      )
    ).toBe('expired');
  });
});

describe('limits', () => {
  it('match the pricing page', () => {
    expect(PLAN_LIMITS.starter.contacts).toBe(2000);
    expect(PLAN_LIMITS.growth.broadcasts_per_month).toBe(250);
    expect(PLAN_LIMITS.enterprise.team_members).toBeNull();
    expect(PLAN_LIMITS.pro.contacts).toBe(200000);
    expect(PLAN_LIMITS.pro.team_members).toBe(50);
    expect(PLAN_LIMITS.trial).toEqual(PLAN_LIMITS.growth);
    expect(PLAN_LIMITS.expired).toEqual(PLAN_LIMITS.starter);
  });
});

describe('daysLeft', () => {
  it('rounds up and never goes negative', () => {
    expect(daysLeft('2026-10-15T00:00:00Z', now)).toBe(1);
    expect(daysLeft(future, now)).toBe(6);
    expect(daysLeft(past, now)).toBe(0);
    expect(daysLeft(null, now)).toBeNull();
  });
});

describe('prices', () => {
  it('lists every billing cycle for paid plans and custom Enterprise', () => {
    expect(PLAN_INFO.starter.prices).toEqual({ monthly: 1499, quarterly: 4049, yearly: 14999 });
    expect(PLAN_INFO.growth.prices).toEqual({ monthly: 2999, quarterly: 8099, yearly: 29999 });
    expect(PLAN_INFO.pro.prices).toEqual({ monthly: 5999, quarterly: 16199, yearly: 59999 });
    expect(PLAN_INFO.enterprise.prices).toBeNull();
  });

  it('works out the saving against paying monthly', () => {
    for (const plan of ['starter', 'growth', 'pro'] as const) {
      expect(cycleSavingPercent(plan, 'monthly')).toBeNull();
      expect(cycleSavingPercent(plan, 'quarterly')).toBe(10);
      expect(cycleSavingPercent(plan, 'yearly')).toBe(17);
    }
    expect(cycleSavingPercent('enterprise', 'yearly')).toBeNull();
  });
});
