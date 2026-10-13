import { describe, expect, it } from 'vitest';

import {
  detectOptKeyword,
  isMarketingTemplate,
  isPhoneOptedOut,
  loadOptedOutPhones,
  phoneKey,
} from './opt-out';

describe('detectOptKeyword', () => {
  it.each(['STOP', 'stop', ' Stop. ', 'Stop!!', 'UNSUBSCRIBE', 'opt out', 'Opt-Out', 'stop all', 'band karo', 'Mat bhejo 🙏', 'Stop promotions'])(
    'treats %j as an opt-out',
    (text) => expect(detectOptKeyword(text)).toBe('opt_out')
  );

  it.each(['START', 'start', 'Subscribe', 'unstop', 'opt in'])('treats %j as an opt-in', (text) =>
    expect(detectOptKeyword(text)).toBe('opt_in')
  );

  it.each([
    'stop the order',
    'please stop by tomorrow',
    'cancel my booking',
    'when do you start delivery?',
    'Is the shop open?',
    '',
    null,
    undefined,
  ])('ignores normal messages like %j', (text) => expect(detectOptKeyword(text)).toBeNull());
});

describe('phoneKey', () => {
  it('compares phones by digits only', () => {
    expect(phoneKey('+91 98765-43210')).toBe(phoneKey('919876543210'));
  });
});

describe('loadOptedOutPhones', () => {
  function db(result: { data: unknown; error: unknown }) {
    const chain = {
      select: () => chain,
      eq: () => chain,
      not: () => Promise.resolve(result),
    };
    return { from: () => chain } as never;
  }

  it('returns digits-only phones of opted-out contacts', async () => {
    const set = await loadOptedOutPhones(db({ data: [{ phone: '+91 98765 43210' }], error: null }), 'acct');
    expect([...set]).toEqual(['919876543210']);
  });

  it('returns an empty set if the column is missing, so broadcasts still work', async () => {
    const set = await loadOptedOutPhones(db({ data: null, error: { message: 'column does not exist' } }), 'acct');
    expect(set.size).toBe(0);
  });
});

describe('send-time checks', () => {
  // Records filters; resolves to `result` when awaited at the end of the chain.
  function chainDb(result: { data: unknown; error?: unknown }) {
    const calls: Array<[string, unknown[]]> = [];
    const chain: Record<string, unknown> = {};
    for (const m of ['select', 'eq', 'in', 'not', 'limit']) {
      chain[m] = (...args: unknown[]) => {
        calls.push([m, args]);
        return m === 'limit' ? Promise.resolve({ error: null, ...result }) : chain;
      };
    }
    return { db: { from: () => chain } as never, calls };
  }

  it('isPhoneOptedOut matches any trunk-prefix variant of the phone', async () => {
    const { db, calls } = chainDb({ data: [{ id: 'c1' }] });
    expect(await isPhoneOptedOut(db, 'acct', '+44 7911 123456')).toBe(true);
    const variants = calls.find(([m]) => m === 'in')?.[1][1] as string[];
    expect(variants).toContain('447911123456');
    expect(variants).toContain('4407911123456');
  });

  it('isPhoneOptedOut is false when nobody matched or the column is missing', async () => {
    expect(await isPhoneOptedOut(chainDb({ data: [] }).db, 'acct', '+919876543210')).toBe(false);
    expect(
      await isPhoneOptedOut(chainDb({ data: null, error: { message: 'no column' } }).db, 'acct', '+919876543210')
    ).toBe(false);
  });

  it('treats only known UTILITY / AUTHENTICATION templates as non-marketing', async () => {
    expect(await isMarketingTemplate(chainDb({ data: [{ category: 'Marketing' }] }).db, 'a', 't', 'en')).toBe(true);
    expect(await isMarketingTemplate(chainDb({ data: [{ category: 'Utility' }] }).db, 'a', 't', 'en')).toBe(false);
    expect(await isMarketingTemplate(chainDb({ data: [{ category: 'Authentication' }] }).db, 'a', 't', 'en')).toBe(false);
    expect(await isMarketingTemplate(chainDb({ data: [] }).db, 'a', 'unknown', 'en')).toBe(true);
  });
});
