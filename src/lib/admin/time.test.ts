import { describe, expect, it } from 'vitest';

import {
  countBetween,
  dailyCounts,
  formatDelta,
  istDayKey,
  istDaysAgo,
  istStartOfDay,
} from './time';

// 14 Oct 2026, 03:00 IST  ==  13 Oct 2026, 21:30 UTC
const now = Date.parse('2026-10-13T21:30:00Z');

describe('IST day boundaries', () => {
  it('buckets by India date, not UTC date', () => {
    expect(istDayKey(now)).toBe('2026-10-14');
    expect(istDayKey('2026-10-13T18:29:59Z')).toBe('2026-10-13');
    expect(istDayKey('2026-10-13T18:30:00Z')).toBe('2026-10-14');
  });

  it('starts today at IST midnight', () => {
    expect(istStartOfDay(now).toISOString()).toBe('2026-10-13T18:30:00.000Z');
    expect(istDaysAgo(1, now).toISOString()).toBe('2026-10-12T18:30:00.000Z');
  });
});

describe('dailyCounts', () => {
  it('zero-fills the window and counts per IST day', () => {
    const series = dailyCounts(
      [
        '2026-10-13T19:00:00Z',
        '2026-10-13T20:00:00Z',
        '2026-10-12T10:00:00Z',
        '2026-01-01T00:00:00Z',
        null,
      ],
      3,
      now
    );
    expect(series).toEqual([
      { day: '2026-10-12', count: 1 },
      { day: '2026-10-13', count: 0 },
      { day: '2026-10-14', count: 2 },
    ]);
  });
});

describe('countBetween / formatDelta', () => {
  it('counts a half-open window', () => {
    const ts = ['2026-10-13T18:30:00Z', '2026-10-13T18:29:59Z'];
    expect(countBetween(ts, istStartOfDay(now))).toBe(1);
  });

  it('formats change against the previous period', () => {
    expect(formatDelta(5, 3)).toBe('+2');
    expect(formatDelta(1, 4)).toBe('−3');
    expect(formatDelta(2, 2)).toBe('±0');
  });
});
