import { beforeEach, describe, expect, it, vi } from 'vitest';

import { sha256Hex, type ConnectClient, type ConnectCodeRow } from '@/lib/connect/connect';
import { ConnectError, exchangeConnectCode, type ExchangeDeps } from '@/lib/connect/exchange';
import { hashApiKey } from '@/lib/api-keys/keys';

// ---------- in-memory store (mirrors src/lib/connect/store.ts semantics) ----------

const REDIRECT = 'https://restrogrow.com/main/api/repeatgrow_connect.php';
const SECRET = 'rgcs_test_secret';
const CLIENT: ConnectClient = {
  id: 'restrogrow',
  name: 'RestroGrow',
  secret_hash: sha256Hex(SECRET),
  redirect_uris: [REDIRECT],
  allowed_scopes: ['messages:send', 'templates:read', 'templates:write'],
};

const codes = new Map<string, ConnectCodeRow>();
const keys: Array<Record<string, unknown>> = [];
let whatsappConfig: unknown = { phone_number_id: '123', access_token: 'x', status: 'connected' };

vi.mock('@/lib/connect/store', () => ({
  findConnectClient: async (id: string) => (id === CLIENT.id ? CLIENT : null),
  insertConnectCode: async (row: Omit<ConnectCodeRow, 'used_at'>) => {
    codes.set(row.code_hash, { ...row, used_at: null });
  },
  consumeConnectCode: async (hash: string, clientId: string, redirectUri: string) => {
    const row = codes.get(hash);
    if (
      !row ||
      row.used_at ||
      row.client_id !== clientId ||
      row.redirect_uri !== redirectUri ||
      new Date(row.expires_at).getTime() <= Date.now()
    ) {
      return null;
    }
    row.used_at = new Date().toISOString();
    return { ...row };
  },
  findWhatsAppConfig: async () => whatsappConfig,
}));

// ---------- auth + navigation ----------

class FakeUnauthorized extends Error {}
const ctx = {
  userId: 'user-1',
  accountId: 'acct-1',
  role: 'admin',
  account: { id: 'acct-1', name: 'Spice Garden Pvt Ltd' },
};
const requireRole = vi.fn(async () => ctx);
const getCurrentAccount = vi.fn(async () => ctx);
vi.mock('@/lib/auth/account', () => ({
  requireRole: () => requireRole(),
  getCurrentAccount: () => getCurrentAccount(),
  UnauthorizedError: FakeUnauthorized,
}));

class RedirectSignal extends Error {
  constructor(readonly url: string) {
    super(`redirect:${url}`);
  }
}
const redirect = vi.fn((url: string) => {
  throw new RedirectSignal(url);
});
vi.mock('next/navigation', () => ({ redirect: (url: string) => redirect(url) }));

const { allowConnect, cancelConnect } = await import('./actions');
const { default: ConnectPage } = await import('./page');

// ---------- helpers ----------

function form(overrides: Record<string, string> = {}): FormData {
  const fd = new FormData();
  const fields = {
    route_client: 'restrogrow',
    client_id: 'restrogrow',
    redirect_uri: REDIRECT,
    state: 'f'.repeat(48),
    scopes: 'messages:send,templates:read,templates:write',
    restaurant: 'Spice Garden Indiranagar',
    ...overrides,
  };
  for (const [k, v] of Object.entries(fields)) fd.set(k, v);
  return fd;
}

async function issueCode(): Promise<string> {
  const err = await allowConnect(form()).catch((e) => e);
  expect(err).toBeInstanceOf(RedirectSignal);
  const url = new URL((err as RedirectSignal).url);
  expect(url.origin + url.pathname).toBe(REDIRECT);
  expect(url.searchParams.get('state')).toBe('f'.repeat(48));
  return url.searchParams.get('code') as string;
}

function deps(): ExchangeDeps {
  return {
    findClient: async (id) => (id === CLIENT.id ? CLIENT : null),
    consumeCode: async (hash, clientId, redirectUri) => {
      const { consumeConnectCode } = await import('@/lib/connect/store');
      return consumeConnectCode(hash, clientId, redirectUri);
    },
    insertKey: async (row) => {
      keys.push(row);
      return { id: `key-${keys.length}` };
    },
    getAccountName: async () => 'Spice Garden Pvt Ltd',
    getPhoneNumber: async () => '+91 98765 43210',
  };
}

const exchange = (code: string, overrides: Partial<Record<string, string>> = {}) =>
  exchangeConnectCode(
    { client_id: 'restrogrow', client_secret: SECRET, code, redirect_uri: REDIRECT, ...overrides },
    deps()
  );

async function expectConnectError(p: Promise<unknown>, code: string, status: number) {
  const err = await p.catch((e) => e);
  expect(err).toBeInstanceOf(ConnectError);
  expect((err as ConnectError).code).toBe(code);
  expect((err as ConnectError).status).toBe(status);
}

beforeEach(() => {
  codes.clear();
  keys.length = 0;
  whatsappConfig = { phone_number_id: '123', access_token: 'x', status: 'connected' };
  vi.useRealTimers();
});

// ---------- tests ----------

describe('code issue and exchange', () => {
  it('Allow issues a hashed one-time code that exchanges for a scoped key once', async () => {
    const code = await issueCode();
    expect(codes.has(code)).toBe(false); // stored hashed only
    expect(codes.has(sha256Hex(code))).toBe(true);

    const result = await exchange(code);
    expect(result.api_key).toMatch(/^wacrm_live_/);
    expect(result.account).toEqual({ id: 'acct-1', name: 'Spice Garden Pvt Ltd' });
    expect(result.phone_number).toBe('+91 98765 43210');
    expect(result.scopes).toEqual(['messages:send', 'templates:read', 'templates:write']);

    expect(keys).toHaveLength(1);
    expect(keys[0]).toMatchObject({
      account_id: 'acct-1',
      created_by: 'user-1',
      name: 'RestroGrow – Spice Garden Indiranagar',
      client_id: 'restrogrow',
      key_hash: hashApiKey(result.api_key),
    });
    expect(JSON.stringify(keys[0])).not.toContain(result.api_key); // plaintext never stored
  });

  it('rejects a reused code', async () => {
    const code = await issueCode();
    await exchange(code);
    await expectConnectError(exchange(code), 'invalid_grant', 400);
    expect(keys).toHaveLength(1);
  });

  it('rejects an expired code', async () => {
    const code = await issueCode();
    vi.useFakeTimers();
    vi.setSystemTime(Date.now() + 5 * 60 * 1000 + 1);
    await expectConnectError(exchange(code), 'invalid_grant', 400);
    expect(keys).toHaveLength(0);
  });

  it('rejects a wrong redirect_uri without burning the code', async () => {
    const code = await issueCode();
    await expectConnectError(
      exchange(code, { redirect_uri: 'https://www.restrogrow.com/main/api/repeatgrow_connect.php' }),
      'invalid_grant',
      400
    );
    await expect(exchange(code)).resolves.toMatchObject({ scopes: expect.any(Array) });
  });

  it('rejects a wrong client secret or unknown client before touching the code', async () => {
    const code = await issueCode();
    await expectConnectError(exchange(code, { client_secret: 'wrong' }), 'invalid_client', 401);
    await expectConnectError(exchange(code, { client_id: 'someone-else' }), 'invalid_client', 401);
    expect(codes.get(sha256Hex(code))?.used_at).toBeNull();
  });

  it('rejects a made-up code', async () => {
    await expectConnectError(exchange('not-a-real-code'), 'invalid_grant', 400);
  });

  it('Cancel returns access_denied with the same state', async () => {
    const err = await cancelConnect(form()).catch((e) => e);
    const url = new URL((err as RedirectSignal).url);
    expect(url.searchParams.get('error')).toBe('access_denied');
    expect(url.searchParams.get('state')).toBe('f'.repeat(48));
    expect(url.searchParams.has('code')).toBe(false);
  });
});

describe('consent rejects unknown redirect_uri without redirecting', () => {
  const evil = 'https://evil.example/steal';

  it('the page renders an error and never redirects', async () => {
    const element = await ConnectPage({
      params: Promise.resolve({ client: 'restrogrow' }),
      searchParams: Promise.resolve({
        client_id: 'restrogrow',
        redirect_uri: evil,
        state: 'f'.repeat(48),
        scopes: 'messages:send',
      }),
    });
    expect(redirect).not.toHaveBeenCalled();
    expect(getCurrentAccount).not.toHaveBeenCalled(); // not even a login bounce
    expect(JSON.stringify(element)).toContain("This connection link isn't valid");
  });

  it('Allow and Cancel refuse a tampered redirect_uri', async () => {
    await expect(allowConnect(form({ redirect_uri: evil }))).rejects.toThrow(/not allowed/);
    await expect(cancelConnect(form({ redirect_uri: evil }))).rejects.toThrow(/not allowed/);
    expect(redirect).not.toHaveBeenCalled();
    expect(codes.size).toBe(0);
  });

  it('a non-admin cannot issue a code', async () => {
    requireRole.mockRejectedValueOnce(new Error("This action requires the 'admin' role or higher"));
    await expect(allowConnect(form())).rejects.toThrow(/admin/);
    expect(codes.size).toBe(0);
  });

  it('a signed-out owner is sent to login and back to the same consent URL', async () => {
    getCurrentAccount.mockRejectedValueOnce(new FakeUnauthorized());
    const err = await ConnectPage({
      params: Promise.resolve({ client: 'restrogrow' }),
      searchParams: Promise.resolve({
        client_id: 'restrogrow',
        redirect_uri: REDIRECT,
        state: 'abc',
        scopes: 'messages:send',
      }),
    }).catch((e) => e);
    const target = (err as RedirectSignal).url;
    expect(target.startsWith('/login?next=')).toBe(true);
    const next = decodeURIComponent(target.slice('/login?next='.length));
    expect(next.startsWith('/connect/restrogrow?')).toBe(true);
    expect(new URLSearchParams(next.split('?')[1]).get('redirect_uri')).toBe(REDIRECT);
  });
});
