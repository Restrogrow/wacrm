import { beforeEach, describe, expect, it } from 'vitest'

import {
  __resetRateLimitForTests,
  getClientIp,
  RATE_LIMITS,
  recordWebhookRejection,
  webhookBlocked,
} from './rate-limit'

function req(ip?: string) {
  return new Request('https://repeatgrow.com/api/whatsapp/webhook', {
    method: 'POST',
    headers: ip ? { 'x-forwarded-for': `${ip}, 10.0.0.1` } : {},
  })
}

beforeEach(() => __resetRateLimitForTests())

describe('getClientIp', () => {
  it('takes the rightmost forwarded address (the one our proxy appended), never the client-supplied first one', () => {
    const forged = new Request('https://x', { headers: { 'x-forwarded-for': '1.2.3.4, 203.0.113.7' } })
    expect(getClientIp(forged)).toBe('203.0.113.7')
  })
  it('prefers the edge-set cf-connecting-ip header', () => {
    const r = new Request('https://x', { headers: { 'cf-connecting-ip': '198.51.100.9', 'x-forwarded-for': '1.2.3.4' } })
    expect(getClientIp(r)).toBe('198.51.100.9')
  })
  it('falls back to x-real-ip, then "unknown"', () => {
    expect(getClientIp(new Request('https://x', { headers: { 'x-real-ip': '198.51.100.2' } }))).toBe('198.51.100.2')
    expect(getClientIp(req())).toBe('unknown')
  })
})

describe('webhook abuse guard', () => {
  it('never blocks before any rejection', () => {
    expect(webhookBlocked(req('203.0.113.7'), 'whatsapp')).toBeNull()
  })

  it('blocks an IP after repeated bad signatures, with a 429', async () => {
    const r = req('203.0.113.7')
    for (let i = 0; i < RATE_LIMITS.webhookRejections.limit; i++) recordWebhookRejection(r, 'whatsapp')
    const blocked = webhookBlocked(r, 'whatsapp')
    expect(blocked?.status).toBe(429)
    expect(blocked?.headers.get('Retry-After')).toBeTruthy()
  })

  it('only blocks that IP, and only for that source', () => {
    const bad = req('203.0.113.7')
    for (let i = 0; i < RATE_LIMITS.webhookRejections.limit; i++) recordWebhookRejection(bad, 'whatsapp')
    expect(webhookBlocked(req('198.51.100.9'), 'whatsapp')).toBeNull()
    expect(webhookBlocked(bad, 'shopify')).toBeNull()
  })

  it('a few failures are tolerated', () => {
    const r = req('203.0.113.7')
    for (let i = 0; i < RATE_LIMITS.webhookRejections.limit - 1; i++) recordWebhookRejection(r, 'calendly')
    expect(webhookBlocked(r, 'calendly')).toBeNull()
  })
})
