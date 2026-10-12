import { describe, expect, it, vi } from 'vitest';

import { ApiError } from '@/lib/api/v1/respond';

type Filter = [string, string, unknown];
const updates: Array<{ table: string; values: Record<string, unknown>; filters: Filter[] }> = [];

// Minimal stand-in for the Supabase update builder: records the update
// and its filters, and resolves like a query when awaited.
function fakeDb() {
  return {
    from: (table: string) => ({
      update: (values: Record<string, unknown>) => {
        const entry = { table, values, filters: [] as Filter[] };
        updates.push(entry);
        const chain = {
          eq(col: string, val: unknown) {
            entry.filters.push(['eq', col, val]);
            return chain;
          },
          is(col: string, val: unknown) {
            entry.filters.push(['is', col, val]);
            return chain;
          },
          then(resolve: (v: { error: null }) => void) {
            resolve({ error: null });
          },
        };
        return chain;
      },
    }),
  };
}

const requireApiKey = vi.fn();
vi.mock('@/lib/auth/api-context', () => ({
  requireApiKey: (...args: unknown[]) => requireApiKey(...args),
}));

const { POST } = await import('./route');

const call = () =>
  POST(new Request('https://repeatgrow.com/api/v1/keys/revoke-self', { method: 'POST' }));

describe('POST /api/v1/keys/revoke-self', () => {
  it('revokes the calling key, with no scope required', async () => {
    requireApiKey.mockResolvedValueOnce({
      supabase: fakeDb(),
      accountId: 'acct-1',
      keyId: 'key-9',
      scopes: [],
    });
    const res = await call();

    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ data: { revoked: true } });
    expect(requireApiKey.mock.calls[0]).toHaveLength(1); // no scope argument
    const last = updates.at(-1)!;
    expect(last.table).toBe('api_keys');
    expect(typeof last.values.revoked_at).toBe('string');
    expect(last.filters).toEqual([
      ['eq', 'id', 'key-9'],
      ['eq', 'account_id', 'acct-1'],
      ['is', 'revoked_at', null],
    ]);
  });

  it('returns 401 for a missing, unknown, or already revoked key', async () => {
    requireApiKey.mockRejectedValueOnce(new ApiError('unauthorized', 'Missing or invalid API key', 401));
    const res = await call();
    expect(res.status).toBe(401);
    expect((await res.json()).error.code).toBe('unauthorized');
  });
});
