import { describe, expect, it } from 'vitest';

import {
  buildRedirectUrl,
  generateClientSecret,
  generateConnectCode,
  isCodeRedeemable,
  parseScopes,
  sha256Hex,
  validateConnectRequest,
  verifyClientSecret,
  type ConnectClient,
  type ConnectCodeRow,
} from './connect';

const REDIRECT = 'https://restrogrow.com/main/api/repeatgrow_connect.php';
const CLIENT: ConnectClient = {
  id: 'restrogrow',
  name: 'RestroGrow',
  secret_hash: sha256Hex('s3cret'),
  redirect_uris: [REDIRECT, 'https://www.restrogrow.com/main/api/repeatgrow_connect.php'],
  allowed_scopes: ['messages:send', 'templates:read', 'templates:write'],
};
const PARAMS = {
  client_id: 'restrogrow',
  redirect_uri: REDIRECT,
  state: 'a'.repeat(48),
  scopes: 'messages:send,templates:read,templates:write',
  restaurant: 'Spice Garden',
};

describe('validateConnectRequest', () => {
  it('accepts a well-formed request', () => {
    const r = validateConnectRequest('restrogrow', CLIENT, PARAMS);
    expect(r.ok).toBe(true);
    if (r.ok) {
      expect(r.request.scopes).toEqual(['messages:send', 'templates:read', 'templates:write']);
      expect(r.request.label).toBe('Spice Garden');
    }
  });

  it('rejects an unknown client or a client_id that does not match the path', () => {
    expect(validateConnectRequest('restrogrow', null, PARAMS).ok).toBe(false);
    expect(validateConnectRequest('other', CLIENT, PARAMS).ok).toBe(false);
    expect(validateConnectRequest('restrogrow', CLIENT, { ...PARAMS, client_id: 'other' }).ok).toBe(false);
  });

  it('only accepts an exact redirect_uri match', () => {
    for (const redirect_uri of [
      'https://evil.example/cb',
      `${REDIRECT}?x=1`,
      `${REDIRECT}/`,
      REDIRECT.toUpperCase(),
      'https://restrogrow.com.evil.example/main/api/repeatgrow_connect.php',
      '',
    ]) {
      expect(validateConnectRequest('restrogrow', CLIENT, { ...PARAMS, redirect_uri }).ok).toBe(false);
    }
  });

  it('requires state and only allowed, known scopes', () => {
    expect(validateConnectRequest('restrogrow', CLIENT, { ...PARAMS, state: '' }).ok).toBe(false);
    expect(validateConnectRequest('restrogrow', CLIENT, { ...PARAMS, scopes: 'contacts:read' }).ok).toBe(false);
    expect(validateConnectRequest('restrogrow', CLIENT, { ...PARAMS, scopes: 'bogus:scope' }).ok).toBe(false);
    expect(validateConnectRequest('restrogrow', CLIENT, { ...PARAMS, scopes: '' }).ok).toBe(false);
  });
});

describe('parseScopes', () => {
  it('trims and de-duplicates', () => {
    expect(parseScopes(' messages:send , messages:send,templates:read')).toEqual([
      'messages:send',
      'templates:read',
    ]);
  });
});

describe('secrets and codes', () => {
  it('verifies the client secret against its hash', () => {
    expect(verifyClientSecret(CLIENT, 's3cret')).toBe(true);
    expect(verifyClientSecret(CLIENT, 'wrong')).toBe(false);
    expect(verifyClientSecret(CLIENT, '')).toBe(false);
  });

  it('generates distinct secrets and 32-byte codes, hashed with sha256', () => {
    const a = generateClientSecret();
    expect(a.hash).toBe(sha256Hex(a.secret));
    expect(generateClientSecret().secret).not.toBe(a.secret);
    const c = generateConnectCode();
    expect(Buffer.from(c.code, 'base64url')).toHaveLength(32);
    expect(c.hash).toBe(sha256Hex(c.code));
  });

  it('isCodeRedeemable checks client, redirect_uri, and expiry', () => {
    const row: ConnectCodeRow = {
      code_hash: 'h',
      client_id: 'restrogrow',
      account_id: 'acct',
      user_id: 'user',
      scopes: ['messages:send'],
      redirect_uri: REDIRECT,
      label: null,
      expires_at: new Date(1_000_000).toISOString(),
      used_at: null,
    };
    expect(isCodeRedeemable(row, 'restrogrow', REDIRECT, 999_999)).toBe(true);
    expect(isCodeRedeemable(row, 'restrogrow', REDIRECT, 1_000_001)).toBe(false);
    expect(isCodeRedeemable(row, 'other', REDIRECT, 0)).toBe(false);
    expect(isCodeRedeemable(row, 'restrogrow', 'https://evil.example', 0)).toBe(false);
  });
});

describe('buildRedirectUrl', () => {
  it('adds params and keeps an existing query', () => {
    expect(buildRedirectUrl('https://a.example/cb?x=1', { code: 'c d', state: 's' })).toBe(
      'https://a.example/cb?x=1&code=c+d&state=s'
    );
  });
});
