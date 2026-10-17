// Pure helpers for tracked short links (/l/<code>). No I/O here so the
// rules can be unit-tested: target validation (open-redirect / internal
// network safety), UTM handling, code generation, device and referrer
// classification for click stats.

import { isIP } from 'node:net'
import { randomInt } from 'node:crypto'

import { isPrivateOrReservedIp } from '@/lib/webhooks/ssrf'

export const MAX_LINKS_PER_ACCOUNT = 200
export const MAX_TARGET_LENGTH = 2000
export const CODE_RE = /^[a-z0-9-]{3,32}$/

const CODE_ALPHABET = 'abcdefghjkmnpqrstuvwxyz23456789' // no look-alikes (0/o, 1/l/i)

/** Random short code, 7 chars. Collisions are retried by the caller. */
export function generateCode(length = 7): string {
  let out = ''
  for (let i = 0; i < length; i++) out += CODE_ALPHABET[randomInt(CODE_ALPHABET.length)]
  return out
}

/** Normalise an optional custom code; null when it is not usable. */
export function normalizeCustomCode(raw: unknown): string | null {
  if (typeof raw !== 'string') return null
  const code = raw.trim().toLowerCase().replace(/\s+/g, '-')
  if (!CODE_RE.test(code)) return null
  if (code.startsWith('-') || code.endsWith('-') || code.includes('--')) return null
  return code
}

export type TargetResult = { ok: true; url: string } | { ok: false; error: string }

const BLOCKED_HOST_SUFFIXES = ['.local', '.localhost', '.internal', '.lan', '.home', '.corp']

/**
 * Synchronous checks for a redirect target. A short link must point to a
 * public http(s) page: no javascript:/data:/file: schemes, no credentials
 * in the URL, no localhost or private/reserved IP literals. (Hostnames that
 * RESOLVE to private addresses are rejected separately at creation time with
 * the async DNS check in the API route.)
 */
export function validateTargetUrl(raw: unknown): TargetResult {
  if (typeof raw !== 'string') return { ok: false, error: 'Enter a link to shorten.' }
  const input = raw.trim()
  if (!input) return { ok: false, error: 'Enter a link to shorten.' }
  if (input.length > MAX_TARGET_LENGTH) return { ok: false, error: 'That link is too long.' }
  // No control characters or whitespace inside: they enable header/URL smuggling tricks.
  if (/[\u0000- \u007f]/.test(input)) return { ok: false, error: 'The link cannot contain spaces.' }

  let url: URL
  try {
    url = new URL(input)
  } catch {
    return { ok: false, error: 'That does not look like a valid link. Start it with https://' }
  }

  if (url.protocol !== 'https:' && url.protocol !== 'http:') {
    return { ok: false, error: 'Only http:// and https:// links are allowed.' }
  }
  if (url.username || url.password) {
    return { ok: false, error: 'Links with a username or password are not allowed.' }
  }

  const host = url.hostname.replace(/^\[|\]$/g, '').toLowerCase()
  if (!host) return { ok: false, error: 'That link has no website address.' }
  if (host === 'localhost' || BLOCKED_HOST_SUFFIXES.some((s) => host.endsWith(s))) {
    return { ok: false, error: 'Links to local or internal addresses are not allowed.' }
  }
  if (isIP(host)) {
    if (isPrivateOrReservedIp(host)) return { ok: false, error: 'Links to private or internal addresses are not allowed.' }
  } else {
    // Numeric-looking hosts such as 2130706433 or 0x7f.1 are parsed by URL into IPv4, but
    // guard anyway: a host with no letters that is not a plain IP is suspicious.
    if (!/[a-z]/.test(host)) return { ok: false, error: 'That website address is not valid.' }
    if (!host.includes('.')) return { ok: false, error: 'That website address is not valid.' }
  }

  // Our own short links: chaining redirects through /l/ would create loops.
  if (url.pathname.startsWith('/l/') && /(^|\.)repeatgrow\.com$/.test(host)) {
    return { ok: false, error: 'You cannot shorten a Repeat Grow short link.' }
  }

  return { ok: true, url: url.toString() }
}

export interface UtmParams {
  utm_source?: string
  utm_medium?: string
  utm_campaign?: string
}

/** UTM values are short labels: letters, digits and a few separators. */
export function sanitizeUtmValue(raw: unknown): string {
  if (typeof raw !== 'string') return ''
  return raw
    .trim()
    .replace(/[^A-Za-z0-9 _.+\-]/g, '')
    .slice(0, 60)
    .trim()
}

/** Append UTM parameters without overwriting ones already on the target. */
export function appendUtm(target: string, utm: UtmParams): string {
  let url: URL
  try {
    url = new URL(target)
  } catch {
    return target
  }
  for (const key of ['utm_source', 'utm_medium', 'utm_campaign'] as const) {
    const value = utm[key]
    if (value && !url.searchParams.has(key)) url.searchParams.set(key, value)
  }
  return url.toString()
}

export type DeviceClass = 'mobile' | 'desktop' | 'tablet' | 'bot' | 'other'

/** Coarse device class from a user-agent string. The UA itself is never stored. */
export function classifyDevice(userAgent: string | null | undefined): DeviceClass {
  const ua = (userAgent ?? '').toLowerCase()
  if (!ua) return 'other'
  if (/bot|crawler|spider|preview|facebookexternalhit|whatsapp|slurp|curl|wget|python-requests|headless|monitor|embedly|telegram|discord|slack/.test(ua)) {
    return 'bot'
  }
  if (/ipad|tablet|kindle|silk/.test(ua) || (/android/.test(ua) && !/mobile/.test(ua))) return 'tablet'
  if (/mobi|iphone|ipod|android|windows phone/.test(ua)) return 'mobile'
  if (/windows|macintosh|mac os x|linux|cros|x11/.test(ua)) return 'desktop'
  return 'other'
}

/** Referrer reduced to its host name ('' when missing or unparsable). */
export function referrerHost(referer: string | null | undefined): string {
  if (!referer) return ''
  try {
    const host = new URL(referer).hostname.toLowerCase().replace(/^www\./, '')
    return host.slice(0, 100)
  } catch {
    return ''
  }
}

/** Public short URL for a code. */
export function shortUrl(origin: string, code: string): string {
  return `${origin.replace(/\/+$/, '')}/l/${code}`
}
