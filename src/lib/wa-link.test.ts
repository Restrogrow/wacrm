import { describe, expect, it } from 'vitest'

import { buildWaLink, normalizeWaNumber, qrFileName, WA_LINK_MAX_MESSAGE } from './wa-link'

describe('normalizeWaNumber', () => {
  it('turns Indian formats into 91XXXXXXXXXX', () => {
    expect(normalizeWaNumber('98765 43210')).toBe('919876543210')
    expect(normalizeWaNumber('098765-43210')).toBe('919876543210')
    expect(normalizeWaNumber('+91 98765 43210')).toBe('919876543210')
    expect(normalizeWaNumber('0091 98765 43210')).toBe('919876543210')
  })

  it('keeps other country codes', () => {
    expect(normalizeWaNumber('+971 50 123 4567')).toBe('971501234567')
  })

  it('rejects things that are not phone numbers', () => {
    expect(normalizeWaNumber('12345')).toBeNull()
    expect(normalizeWaNumber('')).toBeNull()
    expect(normalizeWaNumber('1234567890123456')).toBeNull()
  })
})

describe('buildWaLink', () => {
  it('encodes the message', () => {
    expect(buildWaLink('9876543210', 'Hi! Price & offer?')).toBe(
      'https://wa.me/919876543210?text=Hi!%20Price%20%26%20offer%3F',
    )
  })

  it('works without a message', () => {
    expect(buildWaLink('9876543210', '  ')).toBe('https://wa.me/919876543210')
  })

  it('caps very long messages', () => {
    const link = buildWaLink('9876543210', 'a'.repeat(1000))!
    expect(decodeURIComponent(link.split('text=')[1]).length).toBe(WA_LINK_MAX_MESSAGE)
  })

  it('returns null for a bad number', () => {
    expect(buildWaLink('abc', 'Hi')).toBeNull()
  })
})

describe('qrFileName', () => {
  it('makes a safe file name', () => {
    expect(qrFileName('Flyer / poster')).toBe('whatsapp-qr-flyer-poster')
    expect(qrFileName('')).toBe('whatsapp-qr')
  })
})
