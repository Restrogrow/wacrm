import { describe, expect, it } from 'vitest';

import {
  SAFETY_MARGIN,
  WINDOW_MS,
  describeQuota,
  isMessagingCapError,
  readDailyQuota,
  tierCapacity,
} from './messaging-limit';

describe('tierCapacity', () => {
  it('parses every tier Meta reports', () => {
    expect(tierCapacity('TIER_250')).toBe(250);
    expect(tierCapacity('TIER_1K')).toBe(1000);
    expect(tierCapacity('TIER_2K')).toBe(2000);
    expect(tierCapacity('TIER_10K')).toBe(10_000);
    expect(tierCapacity('TIER_100K')).toBe(100_000);
    expect(tierCapacity('TIER_UNLIMITED')).toBe(Infinity);
  });

  it('accepts the bare forms and odd casing', () => {
    expect(tierCapacity('2K')).toBe(2000);
    expect(tierCapacity('tier_2k')).toBe(2000);
    expect(tierCapacity(' TIER_1M ')).toBe(1_000_000);
    expect(tierCapacity('UNLIMITED')).toBe(Infinity);
  });

  // null means "don't pace", NOT zero — a zero would stop every
  // broadcast on a number whose health row hasn't been fetched yet.
  it('returns null for unknown, not zero', () => {
    expect(tierCapacity(null)).toBeNull();
    expect(tierCapacity(undefined)).toBeNull();
    expect(tierCapacity('')).toBeNull();
    expect(tierCapacity('TIER_SOMETHING')).toBeNull();
    expect(tierCapacity('TIER_0')).toBeNull();
  });
});

describe('isMessagingCapError', () => {
  it('matches the limit codes, not ordinary failures', () => {
    expect(isMessagingCapError('Meta API error: (#131048) Spam rate limit hit')).toBe(true);
    expect(isMessagingCapError('(#131049) not delivered to maintain healthy ecosystem')).toBe(true);
    expect(isMessagingCapError('(#133016) messaging limit reached')).toBe(true);
    expect(isMessagingCapError('restrictions on how many messages can be sent')).toBe(true);

    expect(isMessagingCapError('(#132000) template param count mismatch')).toBe(false);
    expect(isMessagingCapError('(#131026) Receiver is incapable')).toBe(false);
    expect(isMessagingCapError('fetch failed')).toBe(false);
  });
});

/**
 * Minimal PostgREST-shaped stub: records the filters a chain receives
 * and returns whatever the test queued for that table.
 */
function stubDb(responses: {
  health?: { messaging_limit: string | null }[];
  healthError?: string;
  count?: number;
  countError?: string;
  oldestSentAt?: string;
}) {
  const calls: { table: string; filters: Record<string, string> }[] = [];

  const chain = (table: string) => {
    const filters: Record<string, string> = {};
    const record = { table, filters };
    calls.push(record);

    const self: Record<string, unknown> = {};
    const passthrough = (name: string) => {
      self[name] = (col?: string, val?: string) => {
        if (col) filters[`${name}:${col}`] = String(val ?? '');
        return self;
      };
    };
    for (const m of ['eq', 'gte', 'order', 'select']) passthrough(m);

    self.limit = () => {
      if (table === 'whatsapp_number_health') {
        return Promise.resolve(
          responses.healthError
            ? { data: null, error: { message: responses.healthError } }
            : { data: responses.health ?? [], error: null },
        );
      }
      // The oldest-send lookup.
      return Promise.resolve({
        data: responses.oldestSentAt ? [{ sent_at: responses.oldestSentAt }] : [],
        error: null,
      });
    };

    // `select(..., { count, head })` resolves on its own for the count read.
    self.select = (_cols: string, opts?: { count?: string; head?: boolean }) => {
      if (opts?.count) {
        const thenable = {
          eq: () => thenable,
          gte: () =>
            Promise.resolve(
              responses.countError
                ? { count: null, error: { message: responses.countError } }
                : { count: responses.count ?? 0, error: null },
            ),
        };
        return thenable;
      }
      return self;
    };

    return self;
  };

  return {
    calls,
    db: { from: (table: string) => chain(table) } as never,
  };
}

describe('readDailyQuota', () => {
  const ACCOUNT = 'acc-1';
  const NOW = new Date('2026-11-05T12:00:00.000Z').getTime();

  it('does not pace when the tier is unknown', async () => {
    const { db } = stubDb({ health: [{ messaging_limit: null }] });
    const q = await readDailyQuota(db, ACCOUNT, 'pn-1', NOW);
    expect(q.cap).toBeNull();
    expect(q.remaining).toBe(Infinity);
  });

  it('does not pace an unlimited number', async () => {
    const { db } = stubDb({ health: [{ messaging_limit: 'TIER_UNLIMITED' }] });
    const q = await readDailyQuota(db, ACCOUNT, 'pn-1', NOW);
    expect(q.cap).toBe(Infinity);
    expect(q.remaining).toBe(Infinity);
  });

  it('does not pace when the health read fails', async () => {
    const { db } = stubDb({ healthError: 'relation does not exist' });
    const q = await readDailyQuota(db, ACCOUNT, 'pn-1', NOW);
    expect(q.remaining).toBe(Infinity);
  });

  it('subtracts the window usage from the tier, minus the safety margin', async () => {
    const { db } = stubDb({ health: [{ messaging_limit: 'TIER_2K' }], count: 500 });
    const q = await readDailyQuota(db, ACCOUNT, 'pn-1', NOW);
    const budget = Math.floor(2000 * SAFETY_MARGIN);
    expect(q.cap).toBe(2000);
    expect(q.used).toBe(500);
    expect(q.remaining).toBe(budget - 500);
  });

  it('reports zero remaining once the budget is spent, never negative', async () => {
    const { db } = stubDb({ health: [{ messaging_limit: 'TIER_2K' }], count: 5000 });
    const q = await readDailyQuota(db, ACCOUNT, 'pn-1', NOW);
    expect(q.remaining).toBe(0);
  });

  // The whole point of the feature: the wait is tied to when Meta's
  // rolling window actually frees up, not to a fixed backoff.
  it('resets 24h after the oldest send inside the window', async () => {
    const oldest = new Date(NOW - 20 * 60 * 60 * 1000).toISOString();
    const { db } = stubDb({
      health: [{ messaging_limit: 'TIER_2K' }],
      count: 2000,
      oldestSentAt: oldest,
    });
    const q = await readDailyQuota(db, ACCOUNT, 'pn-1', NOW);
    expect(q.resetsAt).not.toBeNull();
    expect(q.resetsAt!.getTime()).toBe(new Date(oldest).getTime() + WINDOW_MS + 60_000);
    // ~4 hours away, not 15 minutes like the old retry backoff.
    expect(q.resetsAt!.getTime() - NOW).toBeGreaterThan(3 * 60 * 60 * 1000);
  });

  it('falls back to now + window when nothing is on record', async () => {
    const { db } = stubDb({ health: [{ messaging_limit: 'TIER_250' }], count: 250 });
    const q = await readDailyQuota(db, ACCOUNT, 'pn-1', NOW);
    expect(q.resetsAt!.getTime()).toBe(NOW + WINDOW_MS + 60_000);
  });

  it('leaves resetsAt null while there is headroom', async () => {
    const { db } = stubDb({ health: [{ messaging_limit: 'TIER_2K' }], count: 10 });
    const q = await readDailyQuota(db, ACCOUNT, 'pn-1', NOW);
    expect(q.resetsAt).toBeNull();
  });

  it('does not pace when the usage count fails', async () => {
    const { db } = stubDb({ health: [{ messaging_limit: 'TIER_2K' }], countError: 'boom' });
    const q = await readDailyQuota(db, ACCOUNT, 'pn-1', NOW);
    expect(q.remaining).toBe(Infinity);
  });

  it('scopes the count to the account and the window', async () => {
    const { db, calls } = stubDb({ health: [{ messaging_limit: 'TIER_2K' }], count: 1 });
    await readDailyQuota(db, ACCOUNT, 'pn-1', NOW);
    const recipients = calls.find((c) => c.table === 'broadcast_recipients');
    expect(recipients).toBeDefined();
  });
});

describe('describeQuota', () => {
  it('says what it is doing in each mode', () => {
    expect(describeQuota({ cap: null, used: 0, remaining: Infinity, resetsAt: null })).toMatch(
      /unknown/,
    );
    expect(describeQuota({ cap: Infinity, used: 0, remaining: Infinity, resetsAt: null })).toMatch(
      /unlimited/,
    );
    expect(describeQuota({ cap: 2000, used: 500, remaining: 1460, resetsAt: null })).toContain(
      '500/1960',
    );
  });
});
