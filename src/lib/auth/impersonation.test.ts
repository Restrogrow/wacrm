import { createHmac } from 'node:crypto';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import {
  IMPERSONATION_COOKIE_OPTIONS,
  IMPERSONATION_MAX_AGE_S,
  decodeImpersonation,
  encodeImpersonation,
  type ImpersonationState,
} from './impersonation';

// Impersonation is the one cookie in the app that makes the UI claim
// "you are signed in as somebody else". It carries no authority — the
// Supabase session does — but a customer who could forge it could make
// the banner lie, or hide it entirely while an admin is inside their
// account. So these tests are about the guardrails, not the happy path.

const KEY = 'test-encryption-key-0123456789abcdef';

const state = (over: Partial<ImpersonationState> = {}): ImpersonationState => ({
  adminUserId: 'admin-1',
  adminEmail: 'support@repeatgrow.com',
  accountId: 'acc-1',
  accountName: 'Taste of Banaras',
  memberEmail: 'owner@tasteofbanaras.in',
  startedAt: new Date().toISOString(),
  ...over,
});

describe('impersonation cookie', () => {
  beforeEach(() => vi.stubEnv('ENCRYPTION_KEY', KEY));
  afterEach(() => {
    vi.unstubAllEnvs();
    vi.useRealTimers();
  });

  it('round-trips the state it was given', () => {
    const s = state();
    expect(decodeImpersonation(encodeImpersonation(s))).toEqual(s);
  });

  it('rejects a tampered payload', () => {
    // The whole point: swap in a different account and the signature
    // no longer matches, so the banner cannot be made to name the
    // wrong account — or a different admin.
    const encoded = encodeImpersonation(state());
    const [, sig] = encoded.split('.');
    const forged = Buffer.from(
      JSON.stringify(state({ accountId: 'someone-else', adminUserId: 'not-an-admin' })),
      'utf8'
    ).toString('base64url');
    expect(decodeImpersonation(`${forged}.${sig}`)).toBeNull();
  });

  it('rejects a tampered signature', () => {
    const encoded = encodeImpersonation(state());
    expect(decodeImpersonation(`${encoded}x`)).toBeNull();
  });

  it('rejects a cookie signed with a different key', () => {
    // A leaked old key, or a value minted on another deployment, must
    // not verify here.
    const encoded = encodeImpersonation(state());
    vi.stubEnv('ENCRYPTION_KEY', 'a-completely-different-key-9876543210');
    expect(decodeImpersonation(encoded)).toBeNull();
  });

  it('rejects anything that is not payload.signature', () => {
    for (const value of ['', 'nodot', '.onlysig', undefined, null]) {
      expect(decodeImpersonation(value as string | undefined | null)).toBeNull();
    }
  });

  // Signed with the real key, so these reach the checks *past* the
  // signature. Signing them here rather than via encodeImpersonation is
  // the only way to get a validly-signed payload that the encoder would
  // never produce.
  const signedPayload = (body: unknown): string => {
    const payload = Buffer.from(JSON.stringify(body), 'utf8').toString('base64url');
    const sig = createHmac('sha256', KEY).update(payload).digest('base64url');
    return `${payload}.${sig}`;
  };

  it('rejects a correctly signed cookie that is missing required fields', () => {
    // The HMAC passes — but a state with no accountId would render a
    // banner naming nothing, and one with no adminUserId would hide who
    // is inside the account.
    expect(decodeImpersonation(signedPayload({ adminUserId: 'admin-1' }))).toBeNull();
    expect(decodeImpersonation(signedPayload({ accountId: 'acc-1' }))).toBeNull();
    expect(decodeImpersonation(signedPayload({}))).toBeNull();
  });

  it('rejects a correctly signed cookie whose body is not an object', () => {
    expect(decodeImpersonation(signedPayload('nope'))).toBeNull();
    expect(decodeImpersonation(signedPayload(null))).toBeNull();
  });

  it('rejects a correctly signed cookie with an unparseable startedAt', () => {
    // `Date.parse` gives NaN, and NaN comparisons are false — so an
    // unreadable timestamp must not slip through the age check as
    // "not expired".
    expect(
      decodeImpersonation(
        signedPayload({ adminUserId: 'admin-1', accountId: 'acc-1', startedAt: 'not a date' })
      )
    ).toBeNull();
  });

  it('expires on its own clock, not the browser\'s', () => {
    // The cookie's Max-Age should already have removed it, but a
    // client-held clock is not trusted: an 8h+1m old state is refused
    // even if the browser still sends it.
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-11-09T00:00:00Z'));
    const encoded = encodeImpersonation(state());

    vi.setSystemTime(new Date('2026-11-09T00:00:00Z').getTime() + (IMPERSONATION_MAX_AGE_S - 60) * 1000);
    expect(decodeImpersonation(encoded)).not.toBeNull();

    vi.setSystemTime(new Date('2026-11-09T00:00:00Z').getTime() + (IMPERSONATION_MAX_AGE_S + 60) * 1000);
    expect(decodeImpersonation(encoded)).toBeNull();
  });

  it('refuses to decode when the signing key is absent', () => {
    // Never fall through to "unsigned is fine" — that would make the
    // cookie forgeable on a misconfigured deployment.
    const encoded = encodeImpersonation(state());
    vi.stubEnv('ENCRYPTION_KEY', '');
    expect(decodeImpersonation(encoded)).toBeNull();
  });

  it('refuses to encode without a signing key, rather than sign with none', () => {
    vi.stubEnv('ENCRYPTION_KEY', '');
    expect(() => encodeImpersonation(state())).toThrow(/ENCRYPTION_KEY/);
  });

  it('is httpOnly and scoped to the whole site', () => {
    // httpOnly: only the server reads it, so page scripts in a
    // customer's account cannot see which admin is inside.
    expect(IMPERSONATION_COOKIE_OPTIONS.httpOnly).toBe(true);
    expect(IMPERSONATION_COOKIE_OPTIONS.path).toBe('/');
    expect(IMPERSONATION_COOKIE_OPTIONS.sameSite).toBe('lax');
    expect(IMPERSONATION_COOKIE_OPTIONS.maxAge).toBe(IMPERSONATION_MAX_AGE_S);
  });
});
