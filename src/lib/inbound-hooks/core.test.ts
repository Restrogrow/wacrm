import { describe, expect, it } from 'vitest';

import {
  formToPayload,
  generateHookToken,
  hashHookToken,
  isPlausibleHookToken,
  mergeTags,
  parseHookPayload,
  verifyInboundHookToken,
} from './core';

describe('hook tokens', () => {
  it('generates a plausible token whose hash verifies', () => {
    const t = generateHookToken();
    expect(isPlausibleHookToken(t.token)).toBe(true);
    expect(t.hash).toBe(hashHookToken(t.token));
    expect(t.prefix.startsWith('whk_')).toBe(true);
    expect(t.token.startsWith(t.prefix)).toBe(true);
    expect(verifyInboundHookToken(t.token, t.hash)).toBe(true);
  });

  it('rejects the wrong token, an empty hash and a different-length hash', () => {
    const a = generateHookToken();
    const b = generateHookToken();
    expect(verifyInboundHookToken(b.token, a.hash)).toBe(false);
    expect(verifyInboundHookToken(a.token, '')).toBe(false);
    expect(verifyInboundHookToken(a.token, 'abc')).toBe(false);
  });

  it('never stores the plaintext in the hash', () => {
    const t = generateHookToken();
    expect(t.hash).not.toContain(t.token);
    expect(t.hash).toMatch(/^[0-9a-f]{64}$/);
  });

  it('rejects malformed tokens before any lookup', () => {
    expect(isPlausibleHookToken('')).toBe(false);
    expect(isPlausibleHookToken('whk_short')).toBe(false);
    expect(isPlausibleHookToken("whk_' or 1=1 --aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa")).toBe(false);
    expect(isPlausibleHookToken(`x${generateHookToken().token}`)).toBe(false);
  });
});

describe('parseHookPayload', () => {
  it('accepts a minimal payload', () => {
    const r = parseHookPayload({ phone: '+91 98765 43210' });
    expect(r.ok).toBe(true);
    if (r.ok) {
      expect(r.value.phone).toBe('+91 98765 43210');
      expect(r.value.tags).toEqual([]);
      expect(r.value.template).toBeNull();
    }
  });

  it('accepts a numeric phone (Zapier often sends numbers)', () => {
    const r = parseHookPayload({ phone: 919876543210 });
    expect(r.ok).toBe(true);
  });

  it('rejects missing or garbage phones', () => {
    expect(parseHookPayload({}).ok).toBe(false);
    expect(parseHookPayload({ phone: 'hello' }).ok).toBe(false);
    expect(parseHookPayload({ phone: '12' }).ok).toBe(false);
    expect(parseHookPayload('nope').ok).toBe(false);
    expect(parseHookPayload([1, 2]).ok).toBe(false);
    expect(parseHookPayload(null).ok).toBe(false);
  });

  it('validates email, tags and custom fields', () => {
    expect(parseHookPayload({ phone: '+919876543210', email: 'not-an-email' }).ok).toBe(false);
    expect(parseHookPayload({ phone: '+919876543210', tags: Array(11).fill('a') }).ok).toBe(false);
    expect(parseHookPayload({ phone: '+919876543210', custom_fields: [1] }).ok).toBe(false);

    const r = parseHookPayload({
      phone: '+919876543210',
      email: 'a@b.co',
      tags: ['Lead', 'lead ', ' Web '],
      custom_fields: { City: 'Pune', Paid: true, Age: 31 },
    });
    expect(r.ok).toBe(true);
    if (r.ok) {
      expect(r.value.tags).toEqual(['Lead', 'lead', 'Web']);
      expect(r.value.customFields).toEqual({ City: 'Pune', Paid: 'true', Age: '31' });
    }
  });

  it('accepts comma-separated tags as text', () => {
    const r = parseHookPayload({ phone: '+919876543210', tags: 'a, b ,c' });
    expect(r.ok && r.value.tags).toEqual(['a', 'b', 'c']);
  });

  it('validates the template block', () => {
    const ok = parseHookPayload({
      phone: '+919876543210',
      message_template: { name: 'welcome_lead', language: 'en_US', params: ['Asha', 5] },
    });
    expect(ok.ok).toBe(true);
    if (ok.ok) expect(ok.value.template).toEqual({ name: 'welcome_lead', language: 'en_US', params: ['Asha', '5'] });

    const defaultLang = parseHookPayload({ phone: '+919876543210', message_template: { name: 'hello' } });
    expect(defaultLang.ok && defaultLang.value.template?.language).toBe('en_US');

    expect(parseHookPayload({ phone: '+919876543210', message_template: { name: 'Bad Name!' } }).ok).toBe(false);
    expect(parseHookPayload({ phone: '+919876543210', message_template: { name: 'x', params: Array(11).fill('a') } }).ok).toBe(false);
    expect(parseHookPayload({ phone: '+919876543210', message_template: { name: 'x', language: 'not a lang' } }).ok).toBe(false);
  });

  it('strips control characters and caps lengths', () => {
    const r = parseHookPayload({ phone: '+919876543210', name: `Asha\u0000\u0007${'x'.repeat(500)}`, note: 'y'.repeat(5000) });
    expect(r.ok).toBe(true);
    if (r.ok) {
      expect(r.value.name).not.toMatch(/[\u0000-\u001F]/);
      expect(r.value.name!.length).toBeLessThanOrEqual(120);
      expect(r.value.note!.length).toBe(2000);
    }
  });

  it('ignores unknown keys instead of passing them on', () => {
    const r = parseHookPayload({ phone: '+919876543210', account_id: 'other', is_admin: true });
    expect(r.ok).toBe(true);
    if (r.ok) expect(Object.keys(r.value)).not.toContain('account_id');
  });
});

describe('formToPayload', () => {
  it('maps form fields, bracketed custom fields and template params', () => {
    const form = new URLSearchParams();
    form.set('phone', '9876543210');
    form.set('tags', 'a,b');
    form.set('custom_fields[City]', 'Pune');
    form.set('custom_fields.Plan', 'Pro');
    form.set('message_template.name', 'welcome');
    form.append('params[]', 'Asha');
    form.append('params[]', 'Pune');
    const payload = formToPayload(form);
    expect(payload.tags).toEqual(['a', 'b']);
    expect(payload.custom_fields).toEqual({ City: 'Pune', Plan: 'Pro' });
    expect(payload.message_template).toEqual({ name: 'welcome', params: ['Asha', 'Pune'] });
    expect(parseHookPayload(payload).ok).toBe(true);
  });
});

describe('mergeTags', () => {
  it('merges defaults and payload tags without case-insensitive duplicates', () => {
    expect(mergeTags(['Web lead'], ['web lead', 'VIP'])).toEqual(['Web lead', 'VIP']);
    expect(mergeTags([], [])).toEqual([]);
  });
});
