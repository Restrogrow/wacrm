import { describe, expect, it } from 'vitest'

import {
  appendUtm,
  classifyDevice,
  CODE_RE,
  generateCode,
  normalizeCustomCode,
  referrerHost,
  sanitizeUtmValue,
  shortUrl,
  validateTargetUrl,
} from './core'

describe('validateTargetUrl — open redirect / internal network safety', () => {
  it('accepts normal public http(s) links and normalises them', () => {
    const r = validateTargetUrl('https://example.com/offer?x=1')
    expect(r).toEqual({ ok: true, url: 'https://example.com/offer?x=1' })
    expect(validateTargetUrl('http://shop.example.co.in').ok).toBe(true)
  })

  it.each([
    'javascript:alert(1)',
    'JaVaScRiPt:alert(1)',
    'data:text/html,<script>alert(1)</script>',
    'file:///etc/passwd',
    'ftp://example.com/x',
    'vbscript:msgbox(1)',
    'blob:https://example.com/abc',
  ])('rejects non-http scheme: %s', (input) => {
    expect(validateTargetUrl(input).ok).toBe(false)
  })

  it.each([
    'http://localhost/admin',
    'http://localhost:3000',
    'http://foo.localhost',
    'http://printer.local',
    'http://db.internal/secret',
    'http://127.0.0.1/',
    'http://127.1/',
    'http://2130706433/',
    'http://0x7f.0.0.1/',
    'http://10.0.0.5/',
    'http://192.168.1.1/',
    'http://172.16.0.1/',
    'http://169.254.169.254/latest/meta-data',
    'http://[::1]/',
    'http://[::ffff:7f00:1]/',
    'http://[fd00::1]/',
    'http://0.0.0.0/',
  ])('rejects internal address: %s', (input) => {
    expect(validateTargetUrl(input).ok).toBe(false)
  })

  it('rejects credentials in the URL (phishing-style links)', () => {
    expect(validateTargetUrl('https://google.com@evil.example/').ok).toBe(false)
    expect(validateTargetUrl('https://user:pass@example.com/').ok).toBe(false)
  })

  it('rejects whitespace, control characters, empty and non-string input', () => {
    expect(validateTargetUrl('https://example.com/a b').ok).toBe(false)
    expect(validateTargetUrl('https://example.com/\r\nSet-Cookie: x=1').ok).toBe(false)
    expect(validateTargetUrl('').ok).toBe(false)
    expect(validateTargetUrl('   ').ok).toBe(false)
    expect(validateTargetUrl(undefined).ok).toBe(false)
    expect(validateTargetUrl(42).ok).toBe(false)
  })

  it('rejects single-label hosts and overlong links', () => {
    expect(validateTargetUrl('http://intranet/').ok).toBe(false)
    expect(validateTargetUrl(`https://example.com/${'a'.repeat(2100)}`).ok).toBe(false)
  })

  it('refuses to shorten our own short links (redirect chains)', () => {
    expect(validateTargetUrl('https://repeatgrow.com/l/abc123').ok).toBe(false)
    expect(validateTargetUrl('https://www.repeatgrow.com/l/abc123').ok).toBe(false)
    expect(validateTargetUrl('https://repeatgrow.com/pricing').ok).toBe(true)
  })
})

describe('codes', () => {
  it('generates 7-char codes that satisfy the code pattern', () => {
    for (let i = 0; i < 50; i++) {
      const c = generateCode()
      expect(c).toHaveLength(7)
      expect(CODE_RE.test(c)).toBe(true)
    }
  })

  it('normalises custom codes and rejects bad ones', () => {
    expect(normalizeCustomCode('Diwali Offer')).toBe('diwali-offer')
    expect(normalizeCustomCode('  summer-24 ')).toBe('summer-24')
    expect(normalizeCustomCode('ab')).toBeNull()
    expect(normalizeCustomCode('a'.repeat(33))).toBeNull()
    expect(normalizeCustomCode('-bad')).toBeNull()
    expect(normalizeCustomCode('bad-')).toBeNull()
    expect(normalizeCustomCode('a--b')).toBeNull()
    expect(normalizeCustomCode('../etc')).toBeNull()
    expect(normalizeCustomCode('hello_world')).toBeNull()
    expect(normalizeCustomCode(123)).toBeNull()
  })

  it('builds the public URL', () => {
    expect(shortUrl('https://repeatgrow.com/', 'abc')).toBe('https://repeatgrow.com/l/abc')
  })
})

describe('UTM handling', () => {
  it('cleans values to simple labels', () => {
    expect(sanitizeUtmValue(' Diwali <script>2026 ')).toBe('Diwali script2026')
    expect(sanitizeUtmValue('a&b=c')).toBe('abc')
    expect(sanitizeUtmValue('x'.repeat(100))).toHaveLength(60)
    expect(sanitizeUtmValue(null)).toBe('')
  })

  it('appends UTMs without overwriting existing ones', () => {
    expect(appendUtm('https://e.com/p', { utm_source: 'whatsapp', utm_medium: 'broadcast' })).toBe(
      'https://e.com/p?utm_source=whatsapp&utm_medium=broadcast',
    )
    expect(appendUtm('https://e.com/p?utm_source=mine', { utm_source: 'whatsapp', utm_campaign: 'c' })).toBe(
      'https://e.com/p?utm_source=mine&utm_campaign=c',
    )
    expect(appendUtm('https://e.com/p', {})).toBe('https://e.com/p')
    expect(appendUtm('https://e.com/p', { utm_source: '' })).toBe('https://e.com/p')
  })
})

describe('click classification', () => {
  it('classifies devices', () => {
    expect(classifyDevice('Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) Mobile/15E148')).toBe('mobile')
    expect(classifyDevice('Mozilla/5.0 (Linux; Android 14; Pixel 8) Mobile Safari/537.36')).toBe('mobile')
    expect(classifyDevice('Mozilla/5.0 (iPad; CPU OS 17_0 like Mac OS X)')).toBe('tablet')
    expect(classifyDevice('Mozilla/5.0 (Linux; Android 13; SM-X700) AppleWebKit/537.36 Safari/537.36')).toBe('tablet')
    expect(classifyDevice('Mozilla/5.0 (Windows NT 10.0; Win64; x64) Chrome/120 Safari/537.36')).toBe('desktop')
    expect(classifyDevice('Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) Safari/605')).toBe('desktop')
    expect(classifyDevice('')).toBe('other')
    expect(classifyDevice(null)).toBe('other')
  })

  it('treats link previews and crawlers as bots so they do not count as clicks', () => {
    expect(classifyDevice('WhatsApp/2.23.20.0 A')).toBe('bot')
    expect(classifyDevice('facebookexternalhit/1.1')).toBe('bot')
    expect(classifyDevice('Googlebot/2.1 (+http://www.google.com/bot.html)')).toBe('bot')
    expect(classifyDevice('TelegramBot (like TwitterBot)')).toBe('bot')
    expect(classifyDevice('curl/8.4.0')).toBe('bot')
  })

  it('keeps only the referrer host', () => {
    expect(referrerHost('https://www.instagram.com/p/abc?x=1')).toBe('instagram.com')
    expect(referrerHost('https://l.facebook.com/l.php?u=secret')).toBe('l.facebook.com')
    expect(referrerHost('not a url')).toBe('')
    expect(referrerHost(null)).toBe('')
    expect(referrerHost('')).toBe('')
  })
})
