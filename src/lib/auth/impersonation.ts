// ============================================================
// Platform-admin impersonation ("Login as customer").
//
// /admin can sign a platform admin straight into a customer's account
// to reproduce what the customer is seeing. The admin gets the
// customer's *real* session — full access, same writes the customer
// could make — because support work routinely means fixing the thing,
// not just looking at it.
//
// That is deliberately a big hammer, so it leaves marks:
//   * every use writes an `account.impersonated` audit row (who, which
//     account, when) before the session is handed over;
//   * this cookie rides along so the app can show a permanent banner
//     naming the admin, and offer one click back out.
//
// The cookie carries no authority — the Supabase session cookies do.
// It is signed anyway (HMAC over the payload with ENCRYPTION_KEY) so a
// customer can't hand-craft one and make the UI lie about who is
// signed in.
// ============================================================

import { createHmac, timingSafeEqual } from 'node:crypto';

export const IMPERSONATION_COOKIE = 'rg_impersonation';

/** Matches the longest session an admin should need for one support task. */
export const IMPERSONATION_MAX_AGE_S = 8 * 60 * 60;

export interface ImpersonationState {
  /** The platform admin who started it. */
  adminUserId: string;
  adminEmail: string | null;
  /** The account being viewed. */
  accountId: string;
  accountName: string;
  /** Email of the member whose session the admin is using. */
  memberEmail: string | null;
  startedAt: string;
}

function signature(payload: string): string {
  const key = process.env.ENCRYPTION_KEY;
  if (!key) throw new Error('ENCRYPTION_KEY is not set');
  return createHmac('sha256', key).update(payload).digest('base64url');
}

/** Cookie value: `<base64url(json)>.<hmac>`. */
export function encodeImpersonation(state: ImpersonationState): string {
  const payload = Buffer.from(JSON.stringify(state), 'utf8').toString('base64url');
  return `${payload}.${signature(payload)}`;
}

/** Parse + verify a cookie value, or null when absent/tampered/stale. */
export function decodeImpersonation(value: string | undefined | null): ImpersonationState | null {
  if (!value) return null;
  const dot = value.lastIndexOf('.');
  if (dot <= 0) return null;

  const payload = value.slice(0, dot);
  const provided = Buffer.from(value.slice(dot + 1));
  let expected: Buffer;
  try {
    expected = Buffer.from(signature(payload));
  } catch {
    return null;
  }
  if (provided.length !== expected.length || !timingSafeEqual(provided, expected)) return null;

  try {
    const state = JSON.parse(Buffer.from(payload, 'base64url').toString('utf8')) as ImpersonationState;
    if (!state?.adminUserId || !state?.accountId) return null;
    // Belt-and-braces: the cookie's own Max-Age should already have
    // expired it, but don't trust a client-held clock.
    //
    // An unreadable `startedAt` has to be rejected outright, not aged.
    // `new Date('nonsense').getTime()` is NaN, every NaN comparison is
    // false, so the age check below would wave it through and the cookie
    // would never expire at all.
    const startedAt = new Date(state.startedAt).getTime();
    if (!Number.isFinite(startedAt)) return null;
    if (Date.now() - startedAt > IMPERSONATION_MAX_AGE_S * 1000) {
      return null;
    }
    return state;
  } catch {
    return null;
  }
}

/** Options for `cookies().set()` — httpOnly, so only our server reads it. */
export const IMPERSONATION_COOKIE_OPTIONS = {
  httpOnly: true,
  sameSite: 'lax',
  secure: process.env.NODE_ENV === 'production',
  path: '/',
  maxAge: IMPERSONATION_MAX_AGE_S,
} as const;
