import { describe, expect, it } from 'vitest';

import { detectOptKeyword, loadOptedOutPhones, phoneKey } from './opt-out';

describe('detectOptKeyword', () => {
  it.each(['STOP', 'stop', ' Stop. ', 'Stop!!', 'UNSUBSCRIBE', 'opt out', 'Opt-Out', 'stop all', 'band karo', 'Mat bhejo 🙏'])(
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
