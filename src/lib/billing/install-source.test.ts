import { describe, expect, it } from 'vitest';

import {
  billsThroughShopify,
  installSourceOf,
  isInstallSource,
  isPayingPlan,
  shouldAdoptShopifyBilling,
} from './install-source';

describe('installSourceOf', () => {
  it('reads the two known values', () => {
    expect(installSourceOf('website')).toBe('website');
    expect(installSourceOf('shopify_app_store')).toBe('shopify_app_store');
  });

  it('falls back to website for anything else', () => {
    // A row from before migration 099 has no column at all.
    expect(installSourceOf(undefined)).toBe('website');
    expect(installSourceOf(null)).toBe('website');
    expect(installSourceOf('nonsense')).toBe('website');
  });

  it('guards the type', () => {
    expect(isInstallSource('website')).toBe(true);
    expect(isInstallSource('shopify')).toBe(false);
  });
});

describe('billsThroughShopify', () => {
  it('is true only for an App Store account', () => {
    expect(billsThroughShopify('shopify_app_store')).toBe(true);
    expect(billsThroughShopify('website')).toBe(false);
    // Pre-migration rows must never be treated as App Store accounts,
    // or a website customer would be sent to a Shopify charge screen.
    expect(billsThroughShopify(undefined)).toBe(false);
  });
});

describe('isPayingPlan', () => {
  it('treats trial and blank as not paying', () => {
    expect(isPayingPlan('trial')).toBe(false);
    expect(isPayingPlan('')).toBe(false);
    expect(isPayingPlan('  ')).toBe(false);
  });

  it('treats every real plan as paying', () => {
    for (const plan of ['starter', 'growth', 'pro', 'enterprise']) {
      expect(isPayingPlan(plan)).toBe(true);
    }
    expect(isPayingPlan('GROWTH')).toBe(true);
  });

  it('treats an unknown value as paying', () => {
    // The costly mistake is moving someone's billing by accident.
    expect(isPayingPlan(null)).toBe(true);
    expect(isPayingPlan(undefined)).toBe(true);
    expect(isPayingPlan(42)).toBe(true);
  });
});

describe('shouldAdoptShopifyBilling', () => {
  it('adopts for a trial account installed from the App Store', () => {
    expect(
      shouldAdoptShopifyBilling({
        current: 'website',
        fromAppStore: true,
        plan: 'trial',
      })
    ).toEqual({ adopt: true });
  });

  it('adopts when the column is missing entirely', () => {
    expect(
      shouldAdoptShopifyBilling({
        current: undefined,
        fromAppStore: true,
        plan: 'trial',
      })
    ).toEqual({ adopt: true });
  });

  it('ignores an in-app Connect Shopify', () => {
    expect(
      shouldAdoptShopifyBilling({
        current: 'website',
        fromAppStore: false,
        plan: 'trial',
      })
    ).toEqual({ adopt: false, reason: 'not_from_app_store' });
  });

  it('never rewrites a source that is already set', () => {
    expect(
      shouldAdoptShopifyBilling({
        current: 'shopify_app_store',
        fromAppStore: true,
        plan: 'trial',
      })
    ).toEqual({ adopt: false, reason: 'already_set' });
  });

  it('leaves a paying website customer alone, and says so', () => {
    // Flipping would silently move a live billing relationship and
    // risk double-charging. A human decides this one.
    expect(
      shouldAdoptShopifyBilling({
        current: 'website',
        fromAppStore: true,
        plan: 'growth',
      })
    ).toEqual({ adopt: false, reason: 'paying_website_customer' });
  });
});
