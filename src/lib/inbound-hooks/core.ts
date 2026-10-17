// ============================================================
// Inbound webhook (POST /api/hooks/in/<token>) — pure logic, no I/O.
//
// Tokens: 32 CSPRNG bytes, shown once, only the SHA-256 hash is stored
// (same scheme as API keys: the token has full entropy, so a fast hash is
// the right, indexable choice).
//
// Payload: JSON (or form-encoded, for Zapier's "Form" payload type).
// Everything is validated and length-capped; unknown keys are ignored.
// ============================================================

import { createHash, randomBytes, timingSafeEqual } from 'node:crypto';

import { publicOrigin } from '@/lib/public-origin';

export const HOOK_TOKEN_PREFIX = 'whk_';
export const HOOK_PATH = '/api/hooks/in';
/** Largest request body we read. A contact + tags is a few hundred bytes. */
export const MAX_HOOK_BODY_BYTES = 64 * 1024;
export const MAX_HOOKS_PER_ACCOUNT = 10;

// ------------------------------------------------------------
// Tokens
// ------------------------------------------------------------

export interface GeneratedHookToken {
  /** Full token — show the admin ONCE, never store. */
  token: string;
  hash: string;
  prefix: string;
}

export function hashHookToken(token: string): string {
  return createHash('sha256').update(token).digest('hex');
}

export function generateHookToken(): GeneratedHookToken {
  const body = randomBytes(32).toString('base64url');
  const token = `${HOOK_TOKEN_PREFIX}${body}`;
  return { token, hash: hashHookToken(token), prefix: `${HOOK_TOKEN_PREFIX}${body.slice(0, 8)}` };
}

/** Cheap shape check so garbage never reaches the database. */
export function isPlausibleHookToken(token: string): boolean {
  return /^whk_[A-Za-z0-9_-]{43}$/.test(token);
}

/** Constant-time check that `token` hashes to the stored hash. */
export function verifyInboundHookToken(token: string, storedHash: string): boolean {
  const a = Buffer.from(hashHookToken(token));
  const b = Buffer.from(storedHash ?? '');
  return a.length === b.length && timingSafeEqual(a, b);
}

export function hookUrl(token: string): string {
  return `${publicOrigin()}${HOOK_PATH}/${token}`;
}

// ------------------------------------------------------------
// Payload
// ------------------------------------------------------------

export interface HookTemplate {
  name: string;
  language: string;
  params: string[];
}

export interface HookPayload {
  phone: string;
  name: string | null;
  email: string | null;
  company: string | null;
  tags: string[];
  customFields: Record<string, string>;
  template: HookTemplate | null;
  note: string | null;
  /** Optional ISO country code (e.g. "IN") for national-format numbers. */
  country: string | null;
}

export type ParsedPayload = { ok: true; value: HookPayload } | { ok: false; error: string };

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const TEMPLATE_NAME_RE = /^[a-z0-9_]{1,512}$/;
const LANGUAGE_RE = /^[a-z]{2,3}(_[A-Za-z]{2,4})?$/;

/** Strip control characters and trim; null when nothing is left. */
function clean(value: unknown, max: number): string | null {
  if (typeof value !== 'string' && typeof value !== 'number') return null;
  const s = String(value).replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F\u007F]/g, '').trim();
  return s ? s.slice(0, max) : null;
}

/** Turn a form-encoded body into the same shape as the JSON payload. */
export function formToPayload(form: URLSearchParams): Record<string, unknown> {
  const out: Record<string, unknown> = {};
  const custom: Record<string, string> = {};
  const params: string[] = [];
  const tpl: Record<string, unknown> = {};
  for (const [key, value] of form.entries()) {
    const cf = /^custom_fields?(?:\[(.+)\]|\.(.+))$/.exec(key);
    if (cf) {
      custom[cf[1] ?? cf[2]] = value;
      continue;
    }
    if (key === 'message_template.name' || key === 'template_name') tpl.name = value;
    else if (key === 'message_template.language' || key === 'template_language') tpl.language = value;
    else if (/^(?:message_template\.)?params?(?:\[\d*\])?$/.test(key)) params.push(value);
    else if (key === 'tags') out.tags = value.split(',');
    else out[key] = value;
  }
  if (Object.keys(custom).length > 0) out.custom_fields = custom;
  if (tpl.name) out.message_template = { ...tpl, params };
  return out;
}

export function parseHookPayload(input: unknown): ParsedPayload {
  if (!input || typeof input !== 'object' || Array.isArray(input)) {
    return { ok: false, error: 'Body must be a JSON object' };
  }
  const b = input as Record<string, unknown>;

  const phone = clean(b.phone, 40);
  if (!phone || !/^[+\d][\d\s().-]{4,38}$/.test(phone)) {
    return { ok: false, error: "'phone' is required, e.g. +919876543210" };
  }

  const email = clean(b.email, 254);
  if (email && !EMAIL_RE.test(email)) return { ok: false, error: "'email' is not a valid email address" };

  let tags: string[] = [];
  if (b.tags !== undefined) {
    const raw = Array.isArray(b.tags) ? b.tags : typeof b.tags === 'string' ? b.tags.split(',') : null;
    if (!raw) return { ok: false, error: "'tags' must be a list of text values" };
    if (raw.length > 10) return { ok: false, error: "'tags' can hold at most 10 tags" };
    tags = Array.from(new Set(raw.map((t) => clean(t, 50)).filter((t): t is string => !!t)));
  }

  const customFields: Record<string, string> = {};
  if (b.custom_fields !== undefined) {
    if (!b.custom_fields || typeof b.custom_fields !== 'object' || Array.isArray(b.custom_fields)) {
      return { ok: false, error: "'custom_fields' must be an object of field name: value" };
    }
    const entries = Object.entries(b.custom_fields as Record<string, unknown>);
    if (entries.length > 20) return { ok: false, error: "'custom_fields' can hold at most 20 fields" };
    for (const [k, v] of entries) {
      const key = clean(k, 60);
      const val = typeof v === 'boolean' ? String(v) : clean(v, 500);
      if (key && val !== null) customFields[key] = val;
    }
  }

  let template: HookTemplate | null = null;
  if (b.message_template !== undefined && b.message_template !== null) {
    const t = b.message_template as Record<string, unknown>;
    if (typeof t !== 'object' || Array.isArray(t)) {
      return { ok: false, error: "'message_template' must be an object" };
    }
    const name = clean(t.name, 512);
    if (!name || !TEMPLATE_NAME_RE.test(name)) {
      return { ok: false, error: "'message_template.name' must be an approved template name (lowercase letters, digits, underscores)" };
    }
    const language = clean(t.language, 12) ?? 'en_US';
    if (!LANGUAGE_RE.test(language)) return { ok: false, error: "'message_template.language' looks wrong, e.g. en_US" };
    const rawParams = t.params === undefined ? [] : t.params;
    if (!Array.isArray(rawParams) || rawParams.length > 10) {
      return { ok: false, error: "'message_template.params' must be a list of at most 10 values" };
    }
    template = { name, language, params: rawParams.map((p) => clean(p, 1024) ?? '') };
  }

  const country = clean(b.country, 2);

  return {
    ok: true,
    value: {
      phone,
      name: clean(b.name, 120),
      email,
      company: clean(b.company, 120),
      tags,
      customFields,
      template,
      note: clean(b.note, 2000),
      country: country && /^[A-Za-z]{2}$/.test(country) ? country.toUpperCase() : null,
    },
  };
}

/** Merge hook-level default tags with the payload's, de-duplicated (case-insensitive). */
export function mergeTags(defaults: string[], fromPayload: string[]): string[] {
  const seen = new Map<string, string>();
  for (const t of [...defaults, ...fromPayload]) {
    const key = t.trim().toLowerCase();
    if (key && !seen.has(key)) seen.set(key, t.trim());
  }
  return [...seen.values()].slice(0, 20);
}

// ------------------------------------------------------------
// Settings input (admin screens)
// ------------------------------------------------------------

export function cleanHookName(input: unknown): string {
  return typeof input === 'string' ? input.replace(/[\u0000-\u001F\u007F]/g, '').trim().slice(0, 80) : '';
}

export function cleanTags(input: unknown): string[] {
  if (!Array.isArray(input)) return [];
  return Array.from(
    new Set(
      input
        .filter((t): t is string => typeof t === 'string')
        .map((t) => t.replace(/[\u0000-\u001F\u007F]/g, '').trim().slice(0, 50))
        .filter(Boolean)
    )
  ).slice(0, 10);
}

/** Calling code digits (1-4); falls back to India. */
export function cleanCountryCode(input: unknown): string {
  const digits = typeof input === 'string' ? input.replace(/\D/g, '') : '';
  return digits && digits.length <= 4 ? digits : '91';
}
