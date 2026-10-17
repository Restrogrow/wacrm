import crypto from 'node:crypto'
import { describe, expect, it } from 'vitest'

import {
  MAX_LINK_PAISE,
  MIN_LINK_PAISE,
  generateWebhookSecret,
  maskKeyId,
  paymentIdFromEvent,
  rupeesToPaise,
  validateLinkAmount,
  verifyRazorpaySignature,
} from './razorpay'

const sign = (body: string, secret: string) => crypto.createHmac('sha256', secret).update(body).digest('hex')

describe('verifyRazorpaySignature', () => {
  const body = JSON.stringify({ event: 'payment_link.paid', payload: {} })
  const secret = 'whsec_test_123'

  it('accepts the correct signature', () => {
    expect(verifyRazorpaySignature(body, sign(body, secret), secret)).toBe(true)
  })
  it('rejects a signature made with another secret', () => {
    expect(verifyRazorpaySignature(body, sign(body, 'other'), secret)).toBe(false)
  })
  it('rejects a tampered body', () => {
    expect(verifyRazorpaySignature(body + ' ', sign(body, secret), secret)).toBe(false)
  })
  it('rejects missing, empty and wrong-length signatures without throwing', () => {
    expect(verifyRazorpaySignature(body, null, secret)).toBe(false)
    expect(verifyRazorpaySignature(body, '', secret)).toBe(false)
    expect(verifyRazorpaySignature(body, 'abc', secret)).toBe(false)
  })
  it('rejects when the secret is empty', () => {
    expect(verifyRazorpaySignature(body, sign(body, ''), '')).toBe(false)
  })
})

describe('rupeesToPaise / validateLinkAmount', () => {
  it('converts rupees to whole paise without float drift', () => {
    expect(rupeesToPaise('1,499.50')).toBe(149950)
    expect(rupeesToPaise(1499.5)).toBe(149950)
    expect(rupeesToPaise('₹ 10')).toBe(1000)
    expect(rupeesToPaise('0.1')).toBe(10)
    expect(rupeesToPaise(19.99)).toBe(1999)
  })
  it('gives NaN for junk', () => {
    expect(Number.isNaN(rupeesToPaise('abc'))).toBe(true)
  })
  it('accepts the allowed range and rejects outside it', () => {
    expect(() => validateLinkAmount(MIN_LINK_PAISE)).not.toThrow()
    expect(() => validateLinkAmount(MAX_LINK_PAISE)).not.toThrow()
    expect(() => validateLinkAmount(99)).toThrow(/minimum/)
    expect(() => validateLinkAmount(MAX_LINK_PAISE + 1)).toThrow(/maximum/)
    expect(() => validateLinkAmount(NaN)).toThrow()
    expect(() => validateLinkAmount(150.5)).toThrow()
  })
})

describe('helpers', () => {
  it('generates distinct 48-char hex webhook secrets', () => {
    const a = generateWebhookSecret()
    expect(a).toMatch(/^[0-9a-f]{48}$/)
    expect(generateWebhookSecret()).not.toBe(a)
  })
  it('masks the key id', () => {
    expect(maskKeyId('rzp_live_AbCdEfGh1234')).toBe('rzp_live_••••1234')
    expect(maskKeyId('short')).toBe('••••')
  })
  it('reads our payment id from reference_id or notes', () => {
    const id = '0f6d1d9c-c5dc-424c-9dca-146eadc7bf25'
    expect(paymentIdFromEvent({ payload: { payment_link: { entity: { reference_id: id } } } })).toBe(id)
    expect(paymentIdFromEvent({ payload: { payment: { entity: { notes: { rg_payment_id: id } } } } })).toBe(id)
    expect(paymentIdFromEvent({ payload: { payment_link: { entity: { reference_id: 'not-a-uuid' } } } })).toBeNull()
    expect(paymentIdFromEvent({ payload: { payment: { entity: { notes: [] } } } })).toBeNull()
  })
})
