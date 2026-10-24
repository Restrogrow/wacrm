import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import type { SupabaseClient } from '@supabase/supabase-js';

vi.mock('@/lib/whatsapp/encryption', () => ({
  decrypt: (s: string) => s,
  encrypt: (s: string) => s,
}));

// Control the SSRF guard per-test.
vi.mock('@/lib/webhooks/ssrf', () => ({
  isDeliverableUrl: vi.fn(async () => true),
}));

import {
  dispatchWebhookEvent,
  MAX_ATTEMPTS,
  MAX_CONSECUTIVE_FAILURES,
  nextAttemptAt,
} from './deliver';
import { isDeliverableUrl } from './ssrf';

interface Row {
  id: string;
  url: string;
  secret: string;
}
interface Calls {
  updates: { id: string; payload: Record<string, unknown> }[];
  inserts: Record<string, unknown>[];
  rpcs: { name: string; args: Record<string, unknown> }[];
}

function makeDb(rows: Row[], calls: Calls, opts: { logMissing?: boolean } = {}) {
  const from = () => {
    let mode: 'select' | 'update' = 'select';
    let payload: Record<string, unknown> = {};
    let id: string | null = null;
    const b: Record<string, unknown> = {
      select: () => b,
      eq: (col: string, val: string) => {
        if (col === 'id') id = val;
        return b;
      },
      insert: (p: Record<string, unknown>) => {
        calls.inserts.push(p);
        return Promise.resolve({
          data: null,
          error: opts.logMissing ? { message: 'relation "webhook_deliveries" does not exist' } : null,
        });
      },
      update: (p: Record<string, unknown>) => {
        mode = 'update';
        payload = p;
        return b;
      },
      contains: () => Promise.resolve({ data: rows, error: null }),
      then: (resolve: (v: unknown) => unknown) => {
        if (mode === 'update' && id) calls.updates.push({ id, payload });
        return resolve({ data: null, error: null });
      },
    };
    return b;
  };
  const rpc = (name: string, args: Record<string, unknown>) => {
    calls.rpcs.push({ name, args });
    return Promise.resolve({ data: null, error: null });
  };
  return { from, rpc } as unknown as SupabaseClient;
}

const emptyCalls = (): Calls => ({ updates: [], inserts: [], rpcs: [] });

beforeEach(() => {
  vi.mocked(isDeliverableUrl).mockResolvedValue(true);
  vi.stubGlobal('fetch', vi.fn());
});
afterEach(() => vi.unstubAllGlobals());

describe('dispatchWebhookEvent', () => {
  it('signs + POSTs (no redirect follow) and resets failure_count on success', async () => {
    const fetchMock = vi.fn().mockResolvedValue({ ok: true, status: 200 } as Response);
    vi.stubGlobal('fetch', fetchMock);
    const calls = emptyCalls();

    await dispatchWebhookEvent(
      makeDb([{ id: 'a', url: 'https://a.test/hook', secret: 's1' }], calls),
      'acct-1',
      'message.received',
      { x: 1 }
    );

    expect(fetchMock).toHaveBeenCalledTimes(1);
    const [url, opts] = fetchMock.mock.calls[0];
    expect(url).toBe('https://a.test/hook');
    expect(opts.redirect).toBe('manual');
    expect(opts.headers['X-Wacrm-Event']).toBe('message.received');
    expect(opts.headers['X-Wacrm-Signature']).toMatch(/^t=\d+,v1=[0-9a-f]{64}$/);
    // Payload carries a dedupe id.
    expect(JSON.parse(opts.body).id).toMatch(/[0-9a-f-]{36}/);
    expect(calls.updates[0]).toMatchObject({ id: 'a', payload: { failure_count: 0 } });
    expect(calls.inserts[0]).toMatchObject({
      endpoint_id: 'a',
      event: 'message.received',
      status: 'delivered',
      attempts: 1,
      last_status_code: 200,
    });
    expect(calls.rpcs).toHaveLength(0);
  });

  it('queues a retry (not a failure) when the endpoint errors', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({ ok: false, status: 500 } as Response));
    const calls = emptyCalls();

    await dispatchWebhookEvent(
      makeDb([{ id: 'b', url: 'https://b.test/hook', secret: 's2' }], calls),
      'acct-1',
      'message.received',
      {}
    );

    expect(calls.inserts[0]).toMatchObject({
      endpoint_id: 'b',
      status: 'pending',
      attempts: 1,
      last_status_code: 500,
    });
    expect(typeof calls.inserts[0].next_attempt_at).toBe('string');
    expect(calls.rpcs).toHaveLength(0);
    expect(calls.updates).toHaveLength(0);
  });

  it('records an atomic failure (RPC) when there is no delivery log to retry from', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({ ok: false, status: 500 } as Response));
    const calls = emptyCalls();

    await dispatchWebhookEvent(
      makeDb([{ id: 'b', url: 'https://b.test/hook', secret: 's2' }], calls, { logMissing: true }),
      'acct-1',
      'message.received',
      {}
    );

    expect(calls.rpcs[0]).toEqual({
      name: 'record_webhook_failure',
      args: { endpoint_id: 'b', max_failures: MAX_CONSECUTIVE_FAILURES },
    });
  });

  it('blocks a non-public target (SSRF guard) without fetching', async () => {
    vi.mocked(isDeliverableUrl).mockResolvedValue(false);
    const fetchMock = vi.fn();
    vi.stubGlobal('fetch', fetchMock);
    const calls = emptyCalls();

    await dispatchWebhookEvent(
      makeDb([{ id: 'c', url: 'https://127.0.0.1/hook', secret: 's3' }], calls),
      'acct-1',
      'message.received',
      {}
    );

    expect(fetchMock).not.toHaveBeenCalled();
    // Retrying can't help: failed for good straight away.
    expect(calls.inserts[0]).toMatchObject({ status: 'failed', next_attempt_at: null });
    expect(calls.rpcs[0].name).toBe('record_webhook_failure');
  });

  it('does nothing when no endpoints are subscribed', async () => {
    const fetchMock = vi.fn();
    vi.stubGlobal('fetch', fetchMock);
    const calls = emptyCalls();
    await dispatchWebhookEvent(makeDb([], calls), 'acct-1', 'message.received', {});
    expect(fetchMock).not.toHaveBeenCalled();
    expect(calls.rpcs).toHaveLength(0);
    expect(calls.updates).toHaveLength(0);
  });
});

describe('nextAttemptAt', () => {
  it('backs off and gives up after the last try', () => {
    const now = 1_000_000;
    expect(nextAttemptAt(1, now)).toBe(new Date(now + 60_000).toISOString());
    expect(nextAttemptAt(2, now)).toBe(new Date(now + 5 * 60_000).toISOString());
    expect(nextAttemptAt(MAX_ATTEMPTS - 1, now)).not.toBeNull();
    expect(nextAttemptAt(MAX_ATTEMPTS, now)).toBeNull();
  });
});
