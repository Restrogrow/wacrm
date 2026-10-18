import { describe, expect, it } from 'vitest';
import {
  API_KEY_PREFIX,
  generateApiKey,
  hashApiKey,
  looksLikeApiKey,
  timingSafeHexEqual,
} from './keys';

describe('generateApiKey', () => {
  it('returns a prefixed plaintext, a hash, and a display prefix', () => {
    const { plaintext, hash, prefix } = generateApiKey();
    expect(plaintext).toMatch(/^RG(-[0-9A-HJKMNP-TV-Z]{4}){8}$/);
    // SHA-256 hex is 64 chars.
    expect(hash).toMatch(/^[0-9a-f]{64}$/);
    // Display prefix is the literal prefix + the first 2 groups.
    expect(prefix).toMatch(/^RG-[0-9A-Z]{4}-[0-9A-Z]{4}$/);
    // The display prefix is a true prefix of the plaintext.
    expect(plaintext.startsWith(prefix)).toBe(true);
  });

  it('never repeats a key (entropy sanity check)', () => {
    const seen = new Set<string>();
    for (let i = 0; i < 200; i++) seen.add(generateApiKey().plaintext);
    expect(seen.size).toBe(200);
  });

  it('hash matches an independent hashApiKey of the plaintext', () => {
    const { plaintext, hash } = generateApiKey();
    expect(hashApiKey(plaintext)).toBe(hash);
  });
});

describe('hashApiKey', () => {
  it('is deterministic', () => {
    expect(hashApiKey('RG-abc')).toBe(hashApiKey('RG-abc'));
  });

  it('differs for different inputs', () => {
    expect(hashApiKey('RG-abc')).not.toBe(hashApiKey('RG-abd'));
  });
});

describe('looksLikeApiKey', () => {
  it('accepts a well-formed key', () => {
    expect(looksLikeApiKey(generateApiKey().plaintext)).toBe(true);
  });

  it('rejects the bare prefix, empty, and foreign tokens', () => {
    expect(looksLikeApiKey(API_KEY_PREFIX)).toBe(false);
    expect(looksLikeApiKey('')).toBe(false);
    expect(looksLikeApiKey('some-invite-token')).toBe(false);
  });

  it('rejects legacy wacrm_live_ keys and malformed RG keys', () => {
    expect(
      looksLikeApiKey('wacrm_live_Xk9fQ2pLmZ7vR4tYw8nB3cH6jD1sF0aE5gK2uV9xQ'),
    ).toBe(false);
    expect(looksLikeApiKey('RG-7KQ2-M9XP')).toBe(false);
    expect(looksLikeApiKey('RG-7kq2-M9XP-4TVB-H3NW-8CJD-L6RZ-2YFA-QQQQ')).toBe(false);
  });
});

describe('timingSafeHexEqual', () => {
  it('is true for identical digests', () => {
    const h = hashApiKey('RG-xyz');
    expect(timingSafeHexEqual(h, h)).toBe(true);
  });

  it('is false for different digests', () => {
    expect(timingSafeHexEqual(hashApiKey('a'), hashApiKey('b'))).toBe(false);
  });

  it('is false (not throwing) on length mismatch', () => {
    expect(timingSafeHexEqual('ab', 'abcd')).toBe(false);
  });
});
