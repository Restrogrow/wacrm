import { describe, expect, it } from 'vitest';

import {
  computeManagementFee,
  monthRange,
  parseMonth,
  type BillableCount,
} from './management-fee';

const RATES = { MARKETING: 0.78, UTILITY: 0.115, AUTHENTICATION: 0.115 };

describe('computeManagementFee', () => {
  it('prices each category and applies the percentage', () => {
    const counts: BillableCount[] = [
      { category: 'MARKETING', source: 'broadcast', billable: 1000 },
      { category: 'UTILITY', source: 'conversation', billable: 200 },
    ];
    const r = computeManagementFee(counts, RATES, 10);

    // 1000 × 0.78 = 780, 200 × 0.115 = 23
    expect(r.metaSpend).toBe(803);
    expect(r.fee).toBe(80.3);
    expect(r.total).toBe(883.3);
    expect(r.totalMessages).toBe(1200);
    expect(r.unpriced).toEqual([]);
  });

  it('merges the two sources into one line per category', () => {
    const counts: BillableCount[] = [
      { category: 'MARKETING', source: 'broadcast', billable: 900 },
      { category: 'MARKETING', source: 'conversation', billable: 100 },
    ];
    const r = computeManagementFee(counts, RATES, 10);

    expect(r.lines).toHaveLength(1);
    expect(r.lines[0]).toMatchObject({
      category: 'MARKETING',
      broadcast: 900,
      conversation: 100,
      messages: 1000,
      spend: 780,
    });
  });

  it('normalises category casing', () => {
    const counts: BillableCount[] = [
      { category: 'marketing', source: 'broadcast', billable: 10 },
      { category: 'Marketing', source: 'conversation', billable: 5 },
    ];
    const r = computeManagementFee(counts, RATES, 10);
    expect(r.lines).toHaveLength(1);
    expect(r.lines[0].messages).toBe(15);
  });

  // The whole point of `unpriced`: a missing rate must never silently
  // read as zero spend, or the invoice is quietly too low.
  it('reports categories with no rate instead of pricing them at zero', () => {
    const counts: BillableCount[] = [
      { category: 'MARKETING', source: 'broadcast', billable: 100 },
      { category: 'UNKNOWN', source: 'broadcast', billable: 40 },
    ];
    const r = computeManagementFee(counts, RATES, 10);

    expect(r.metaSpend).toBe(78);
    expect(r.totalMessages).toBe(140); // the 40 are counted…
    expect(r.unpriced).toEqual([{ category: 'UNKNOWN', messages: 40 }]); // …but flagged
    const unknownLine = r.lines.find((l) => l.category === 'UNKNOWN');
    expect(unknownLine?.rate).toBeNull();
    expect(unknownLine?.spend).toBeNull();
  });

  it('treats a zero percentage as no fee', () => {
    const r = computeManagementFee(
      [{ category: 'MARKETING', source: 'broadcast', billable: 1000 }],
      RATES,
      0,
    );
    expect(r.metaSpend).toBe(780);
    expect(r.fee).toBe(0);
    expect(r.total).toBe(780);
  });

  it('clamps a nonsense percentage', () => {
    const counts: BillableCount[] = [{ category: 'MARKETING', source: 'broadcast', billable: 100 }];
    expect(computeManagementFee(counts, RATES, -5).feePercent).toBe(0);
    expect(computeManagementFee(counts, RATES, 150).feePercent).toBe(100);
    expect(computeManagementFee(counts, RATES, NaN).feePercent).toBe(0);
  });

  it('handles an empty period', () => {
    const r = computeManagementFee([], RATES, 10);
    expect(r).toMatchObject({ totalMessages: 0, metaSpend: 0, fee: 0, total: 0 });
    expect(r.lines).toEqual([]);
  });

  it('rounds to paise, not to fractions of one', () => {
    // 333 × 0.115 = 38.295 → 38.3; 10% of that = 3.83
    const r = computeManagementFee(
      [{ category: 'UTILITY', source: 'broadcast', billable: 333 }],
      RATES,
      10,
    );
    expect(r.metaSpend).toBe(38.3);
    expect(r.fee).toBe(3.83);
  });

  it('orders lines by spend, biggest first', () => {
    const counts: BillableCount[] = [
      { category: 'UTILITY', source: 'broadcast', billable: 100 },
      { category: 'MARKETING', source: 'broadcast', billable: 100 },
    ];
    const r = computeManagementFee(counts, RATES, 10);
    expect(r.lines.map((l) => l.category)).toEqual(['MARKETING', 'UTILITY']);
  });
});

describe('monthRange', () => {
  it('is a half-open UTC month', () => {
    const { from, to } = monthRange(2026, 11);
    expect(from.toISOString()).toBe('2026-11-01T00:00:00.000Z');
    expect(to.toISOString()).toBe('2026-12-01T00:00:00.000Z');
  });

  it('rolls over the year in December', () => {
    const { from, to } = monthRange(2026, 12);
    expect(from.toISOString()).toBe('2026-12-01T00:00:00.000Z');
    expect(to.toISOString()).toBe('2027-01-01T00:00:00.000Z');
  });
});

describe('parseMonth', () => {
  it('accepts YYYY-MM', () => {
    expect(parseMonth('2026-11')).toEqual({ year: 2026, month: 11 });
    expect(parseMonth(' 2026-01 ')).toEqual({ year: 2026, month: 1 });
  });

  it('rejects anything else', () => {
    for (const bad of ['2026-13', '2026-00', '26-11', '2026/11', '', null, undefined, 'abc']) {
      expect(parseMonth(bad), String(bad)).toBeNull();
    }
  });
});
