// ============================================================
// API key generation + hashing — pure, server-side, no Supabase.
//
// Mirrors the invite-token utilities in `src/lib/auth/invitations.ts`:
// the DB stores only the SHA-256 hash, the plaintext is shown to the
// creator exactly once. See migration 026 for the rationale.
//
// Why SHA-256 (not bcrypt/argon2)
//   API keys are full-entropy random strings (32 CSPRNG bytes), not
//   user-chosen passwords. There is no dictionary to attack and no
//   rainbow table that helps, so a slow KDF buys nothing — it would
//   only slow the per-request auth lookup. A fast hash with a UNIQUE
//   index is the correct, indexable choice for opaque secrets.
//
// Key format: `RG-XXXX-XXXX-XXXX-XXXX-XXXX-XXXX-XXXX-XXXX`
//   - 8 groups of 4 chars from the Crockford base32 alphabet (no
//     I/L/O/U), so keys are easy to read aloud and retype.
//     32 chars × 5 bits = 160 bits of CSPRNG entropy.
//   - The short `RG-` tag keeps a leaked key recognisable to
//     secret-scanners without carrying product branding.
//   - Legacy `wacrm_live_` keys are no longer accepted.
// ============================================================

import { createHash, randomBytes, timingSafeEqual } from 'node:crypto';

/** Secret prefix on every key. Part of the plaintext, not a secret. */
export const API_KEY_PREFIX = 'RG-';

/** Crockford base32 — 32 symbols, so `byte & 31` is unbiased. */
const ALPHABET = '0123456789ABCDEFGHJKMNPQRSTVWXYZ';
const GROUP_SIZE = 4;
const GROUP_COUNT = 8;

const KEY_PATTERN = new RegExp(
  `^RG(-[${ALPHABET}]{${GROUP_SIZE}}){${GROUP_COUNT}}$`,
);

/**
 * Number of body groups in the non-secret display prefix stored in
 * `key_prefix` and shown in the dashboard (e.g. `RG-7KQ2-M9XP`).
 * Enough to tell two keys apart at a glance, far too little to
 * brute-force the remaining 120 bits.
 */
const DISPLAY_GROUPS = 2;

export interface GeneratedApiKey {
  /** Plaintext key — return to the creator ONCE, never persist. */
  plaintext: string;
  /** SHA-256 hex digest. Persist this in `api_keys.key_hash`. */
  hash: string;
  /** Non-secret display string. Persist this in `api_keys.key_prefix`. */
  prefix: string;
}

/**
 * Generate a fresh API key + its hash + its display prefix. Call
 * once per key creation; the plaintext is shown to the admin in the
 * creation modal and never again.
 */
export function generateApiKey(): GeneratedApiKey {
  const bytes = randomBytes(GROUP_SIZE * GROUP_COUNT);
  const groups: string[] = [];
  for (let g = 0; g < GROUP_COUNT; g++) {
    let group = '';
    for (let i = 0; i < GROUP_SIZE; i++) {
      group += ALPHABET[bytes[g * GROUP_SIZE + i] & 31];
    }
    groups.push(group);
  }
  const plaintext = `${API_KEY_PREFIX}${groups.join('-')}`;
  return {
    plaintext,
    hash: hashApiKey(plaintext),
    prefix: `${API_KEY_PREFIX}${groups.slice(0, DISPLAY_GROUPS).join('-')}`,
  };
}

/**
 * Deterministic SHA-256 of a plaintext key. Used at auth time to
 * look up the matching `api_keys` row by `key_hash`. Pure — same
 * input always produces the same output.
 */
export function hashApiKey(plaintext: string): string {
  return createHash('sha256').update(plaintext).digest('hex');
}

/**
 * Structural check that a string looks like one of our keys before
 * we bother hashing + hitting the DB. Cheap reject for obviously
 * malformed `Authorization` headers (e.g. a stale invite token).
 */
export function looksLikeApiKey(value: string): boolean {
  return KEY_PATTERN.test(value);
}

/**
 * Constant-time comparison of two hex digests. The lookup is by an
 * indexed UNIQUE column so an attacker can't easily probe timing,
 * but comparing the hashes in constant time anyway costs nothing and
 * removes the question. Returns false on any length mismatch (the
 * underlying `timingSafeEqual` throws on unequal lengths).
 */
export function timingSafeHexEqual(a: string, b: string): boolean {
  const bufA = Buffer.from(a, 'hex');
  const bufB = Buffer.from(b, 'hex');
  if (bufA.length !== bufB.length) return false;
  return timingSafeEqual(bufA, bufB);
}
