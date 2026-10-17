// Two-factor (TOTP) gating decisions — pure, no I/O, used by src/proxy.ts.
//
// Supabase puts an `aal` ("authenticator assurance level") claim in the
// session token: aal1 = password / OAuth only, aal2 = also passed a TOTP
// challenge. A user who has a VERIFIED factor must reach aal2 before using
// the app. Users without a verified factor are never affected, so nobody is
// locked out by this and the shared demo login (no factor) keeps working.

export interface FactorLike {
  status?: string | null
  factor_type?: string | null
}

export function hasVerifiedFactor(factors: FactorLike[] | null | undefined): boolean {
  return !!factors?.some((f) => f.status === 'verified')
}

/** True when the user enrolled 2FA but this session has only passed aal1. */
export function needsMfaChallenge(input: {
  factors: FactorLike[] | null | undefined
  currentLevel: string | null | undefined
}): boolean {
  return hasVerifiedFactor(input.factors) && input.currentLevel !== 'aal2'
}

export type MfaDecision = 'allow' | 'redirect' | 'deny'

/** Paths that must stay reachable mid-challenge (the challenge page itself, auth callbacks). */
const ALWAYS_ALLOWED = ['/mfa', '/auth/', '/login', '/signup', '/forgot-password', '/reset-password']

/**
 * Decide what to do with a request from a signed-in user.
 * - not mid-challenge → allow
 * - challenge page / auth callbacks / login pages → allow
 * - app APIs (/api/*) → deny (401), so a password-only session can't call them
 * - app pages (protected list) → redirect to /mfa
 * - anything else (public marketing pages) → allow
 */
export function mfaDecision(input: {
  pathname: string
  needsChallenge: boolean
  enforcedPaths: readonly string[]
}): MfaDecision {
  const { pathname, needsChallenge, enforcedPaths } = input
  if (!needsChallenge) return 'allow'
  if (ALWAYS_ALLOWED.some((p) => pathname === p || (p.endsWith('/') && pathname.startsWith(p)))) return 'allow'
  if (pathname.startsWith('/api/')) return 'deny'
  if (enforcedPaths.some((p) => pathname.startsWith(p))) return 'redirect'
  return 'allow'
}
