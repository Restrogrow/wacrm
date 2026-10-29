import { describe, expect, it } from 'vitest';

import {
  commissionFor,
  earningsSummary,
  isValidCode,
  normalizeCode,
  suggestCode,
  withinCommissionWindow,
} from './program';

describe('partner codes', () => {
  it('accepts lower-case letters, numbers and dashes', () => {
    expect(isValidCode('rahul-x7k2')).toBe(true);
    expect(isValidCode('ab')).toBe(false);
    expect(isValidCode('-abc')).toBe(false);
    expect(isValidCode('has space')).toBe(false);
  });

  it('normalizes case and whitespace', () => {
    expect(normalizeCode('  Rahul-X7K2 ')).toBe('rahul-x7k2');
    expect(normalizeCode('../etc')).toBeNull();
    expect(normalizeCode(42)).toBeNull();
  });

  it('suggests a valid code from a name', () => {
    const code = suggestCode('Rahul Sharma', () => 0);
    expect(code).toBe('rahul-aaaa');
    expect(isValidCode(code)).toBe(true);
    expect(isValidCode(suggestCode('ज़'))).toBe(true);
    expect(suggestCode('', () => 0)).toBe('partner-aaaa');
  });
});

describe('commission', () => {
  it('is the rate share of the payment, to the paisa', () => {
    expect(commissionFor(2999, 20)).toBe(599.8);
    expect(commissionFor(999, 12.5)).toBe(124.88);
    expect(commissionFor(0, 20)).toBe(0);
    expect(commissionFor(1000, 0)).toBe(0);
  });

  it('only counts payments in the first 12 months', () => {
    const referred = new Date('2026-01-15T00:00:00Z');
    expect(withinCommissionWindow(referred, new Date('2026-12-31T00:00:00Z'))).toBe(true);
    expect(withinCommissionWindow(referred, new Date('2027-01-16T00:00:00Z'))).toBe(false);
  });

  it('sums pending and paid, ignoring cancelled', () => {
    expect(
      earningsSummary([
        { amount: '100.10', status: 'pending' },
        { amount: 50, status: 'paid' },
        { amount: 999, status: 'void' },
      ])
    ).toEqual({ pending: 100.1, paid: 50, total: 150.1 });
  });
});
