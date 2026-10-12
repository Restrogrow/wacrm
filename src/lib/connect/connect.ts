// ============================================================
// "Connect RepeatGrow" — pure helpers (no I/O).
//
// A partner app (first: RestroGrow) sends the account owner to
// /connect/[client]; the owner approves; we hand back a one-time code
// that the partner exchanges server to server at
// POST /api/v1/connect/token for a scoped API key.
// Contract: docs/RESTROGROW_CONNECT.md.
//
// Everything here is pure so the security-relevant decisions (which
// redirect URIs are trusted, which scopes may be granted, whether a
// code is still redeemable) are unit-testable without a database.
// ============================================================

import { createHash, randomBytes, timingSafeEqual } from 'node:crypto';

import { isApiScope, type ApiScope } from '@/lib/api-keys/scopes';

/** One-time codes are valid for 5 minutes. */
export const CODE_TTL_MS = 5 * 60 * 1000;

/** Display-only label (e.g. restaurant name) is capped to keep key names sane. */
export const MAX_LABEL_LEN = 80;

/** `state` is opaque to us, but bound it so it can't bloat the redirect. */
export const MAX_STATE_LEN = 512;

/** A registered partner app, as stored in `connect_clients`. */
export interface ConnectClient {
  id: string;
  name: string;
  secret_hash: string;
  redirect_uris: string[];
  allowed_scopes: string[];
}

/** Raw query parameters from the consent URL. */
export interface ConnectRequestParams {
  client_id?: string | null;
  redirect_uri?: string | null;
  state?: string | null;
  scopes?: string | null;
  restaurant?: string | null;
}

/** A consent request that passed every check. */
export interface ValidConnectRequest {
  client: ConnectClient;
  redirectUri: string;
  state: string;
  scopes: ApiScope[];
  label: string | null;
}

export type ConnectValidation =
  | { ok: true; request: ValidConnectRequest }
  | { ok: false; error: string };

/** SHA-256 hex digest — used for client secrets and one-time codes. */
export function sha256Hex(value: string): string {
  return createHash('sha256').update(value).digest('hex');
}

/** Constant-time compare of two hex digests (false on any length mismatch). */
export function hexDigestsEqual(a: string, b: string): boolean {
  const bufA = Buffer.from(a, 'hex');
  const bufB = Buffer.from(b, 'hex');
  if (bufA.length === 0 || bufA.length !== bufB.length) return false;
  return timingSafeEqual(bufA, bufB);
}

/** True iff `secret` hashes to the client's stored `secret_hash`. */
export function verifyClientSecret(client: Pick<ConnectClient, 'secret_hash'>, secret: string): boolean {
  if (!secret) return false;
  return hexDigestsEqual(sha256Hex(secret), client.secret_hash);
}

/** A fresh client secret (plaintext) plus the hash to store. */
export function generateClientSecret(): { secret: string; hash: string } {
  const secret = `rgcs_${randomBytes(32).toString('base64url')}`;
  return { secret, hash: sha256Hex(secret) };
}

/** A fresh one-time code (32 random bytes, base64url) plus its hash. */
export function generateConnectCode(): { code: string; hash: string } {
  const code = randomBytes(32).toString('base64url');
  return { code, hash: sha256Hex(code) };
}

/**
 * Parse the comma-separated `scopes` param. Returns null if it's empty
 * or any entry is unknown — a client asking for something we don't
 * recognise is treated as a malformed request, not silently trimmed.
 */
export function parseScopes(raw: string | null | undefined): ApiScope[] | null {
  if (!raw) return null;
  const out: ApiScope[] = [];
  for (const part of raw.split(',')) {
    const scope = part.trim();
    if (!scope) continue;
    if (!isApiScope(scope)) return null;
    if (!out.includes(scope)) out.push(scope);
  }
  return out.length ? out : null;
}

/** Trim the display-only label; empty → null. */
export function cleanLabel(raw: string | null | undefined): string | null {
  const trimmed = (raw ?? '').replace(/\s+/g, ' ').trim();
  return trimmed ? trimmed.slice(0, MAX_LABEL_LEN) : null;
}

/**
 * Validate a consent request against the registered client.
 *
 * `routeClientId` is the `[client]` path segment. On failure the caller
 * must render an error page and NEVER redirect: the redirect URI is
 * only trustworthy once this returns ok.
 */
export function validateConnectRequest(
  routeClientId: string,
  client: ConnectClient | null,
  params: ConnectRequestParams
): ConnectValidation {
  if (!client || params.client_id !== routeClientId || client.id !== routeClientId) {
    return { ok: false, error: 'This app is not registered with Repeat Grow.' };
  }
  const redirectUri = params.redirect_uri ?? '';
  // Exact string match only — no prefix, host, or normalised matching.
  if (!redirectUri || !client.redirect_uris.includes(redirectUri)) {
    return { ok: false, error: 'The return address for this app is not allowed.' };
  }
  const state = params.state ?? '';
  if (!state || state.length > MAX_STATE_LEN) {
    return { ok: false, error: 'The connection request is missing its state parameter.' };
  }
  const scopes = parseScopes(params.scopes);
  if (!scopes) {
    return { ok: false, error: 'The app asked for permissions Repeat Grow does not recognise.' };
  }
  if (!scopes.every((s) => client.allowed_scopes.includes(s))) {
    return { ok: false, error: 'The app asked for more permissions than it is allowed.' };
  }
  return {
    ok: true,
    request: { client, redirectUri, state, scopes, label: cleanLabel(params.restaurant) },
  };
}

/**
 * Append query parameters to a (validated) redirect URI, preserving
 * any query it already has.
 */
export function buildRedirectUrl(redirectUri: string, params: Record<string, string>): string {
  const url = new URL(redirectUri);
  for (const [k, v] of Object.entries(params)) url.searchParams.set(k, v);
  return url.toString();
}

/** A stored one-time code, as read back for exchange. */
export interface ConnectCodeRow {
  code_hash: string;
  client_id: string;
  account_id: string;
  user_id: string;
  scopes: string[];
  redirect_uri: string;
  label: string | null;
  expires_at: string;
  used_at: string | null;
}

/**
 * Is this code redeemable by this client for this redirect URI right
 * now? (The atomic "mark used" happens in the store; this is the check
 * on the row it returns.)
 */
export function isCodeRedeemable(
  row: ConnectCodeRow,
  clientId: string,
  redirectUri: string,
  now: number = Date.now()
): boolean {
  return (
    row.client_id === clientId &&
    row.redirect_uri === redirectUri &&
    new Date(row.expires_at).getTime() > now
  );
}

/** API key name for a connected app, e.g. "RestroGrow – Spice Garden". */
export function connectedKeyName(clientName: string, label: string | null): string {
  return (label ? `${clientName} – ${label}` : clientName).slice(0, 80);
}
