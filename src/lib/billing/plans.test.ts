import { describe, expect, it } from 'vitest';

import {
  AI_MONTHLY_LIMITS,
  PLAN_INFO,
  PLAN_LIMITS,
  cycleSavingPercent,
  daysLeft,
  effectivePlan,
  planMeetsTier,
} from './plans';

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
  it('match the pricing sheet', () => {
    expect(PLAN_LIMITS.starter.team_members).toBe(3);
    expect(PLAN_LIMITS.starter.chatbot_flows).toBe(2);
    expect(PLAN_LIMITS.growth.team_members).toBe(5);
    expect(PLAN_LIMITS.growth.chatbot_flows).toBeNull();
    expect(PLAN_LIMITS.pro.team_members).toBe(10);
    expect(PLAN_LIMITS.enterprise.team_members).toBeNull();
    expect(PLAN_LIMITS.trial).toEqual(PLAN_LIMITS.growth);
    expect(PLAN_LIMITS.expired).toEqual(PLAN_LIMITS.starter);
  });

  it('AI monthly limits match the pricing sheet', () => {
    expect(AI_MONTHLY_LIMITS.starter).toEqual({ chatbot_replies: 500, voice_minutes: 0 });
    expect(AI_MONTHLY_LIMITS.growth).toEqual({ chatbot_replies: 2000, voice_minutes: 0 });
    expect(AI_MONTHLY_LIMITS.pro).toEqual({ chatbot_replies: 5000, voice_minutes: 300 });
    expect(AI_MONTHLY_LIMITS.enterprise).toEqual({ chatbot_replies: null, voice_minutes: null });
    expect(AI_MONTHLY_LIMITS.trial).toEqual(AI_MONTHLY_LIMITS.growth);
    expect(AI_MONTHLY_LIMITS.expired).toEqual({ chatbot_replies: 0, voice_minutes: 0 });
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
    expect(PLAN_INFO.starter.prices).toEqual({ monthly: 1499, quarterly: 4047, yearly: 14388 });
    expect(PLAN_INFO.growth.prices).toEqual({ monthly: 2999, quarterly: 8097, yearly: 28788 });
    expect(PLAN_INFO.pro.prices).toEqual({ monthly: 5999, quarterly: 16197, yearly: 57588 });
    expect(PLAN_INFO.enterprise.prices).toBeNull();
  });

  it('works out the saving against paying monthly', () => {
    for (const plan of ['starter', 'growth', 'pro'] as const) {
      expect(cycleSavingPercent(plan, 'monthly')).toBeNull();
      expect(cycleSavingPercent(plan, 'quarterly')).toBe(10);
      expect(cycleSavingPercent(plan, 'yearly')).toBe(20);
    }
    expect(cycleSavingPercent('enterprise', 'yearly')).toBeNull();
  });
});

describe('planMeetsTier', () => {
  it('ranks starter < growth/trial < pro < enterprise', () => {
    expect(planMeetsTier('starter', 'growth')).toBe(false);
    expect(planMeetsTier('growth', 'growth')).toBe(true);
    expect(planMeetsTier('pro', 'growth')).toBe(true);
    expect(planMeetsTier('enterprise', 'pro')).toBe(true);
    expect(planMeetsTier('growth', 'pro')).toBe(false);
  });

  it('trial counts as growth — the trial\'s own "Full Growth features" promise', () => {
    expect(planMeetsTier('trial', 'growth')).toBe(true);
    expect(planMeetsTier('trial', 'pro')).toBe(false);
  });

  it('expired meets no feature tier, even for a plan that would otherwise qualify', () => {
    expect(planMeetsTier('expired', 'starter')).toBe(false);
  });

  it('treats a missing plan like starter, not fully closed', () => {
    expect(planMeetsTier(null, 'starter')).toBe(true);
    expect(planMeetsTier(null, 'growth')).toBe(false);
  });
});
