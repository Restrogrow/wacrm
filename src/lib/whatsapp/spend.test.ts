import { describe, expect, it } from 'vitest'

import {
  codeFromErrorMessage,
  dayInZone,
  estimateBroadcastCosts,
  ratesByCategory,
  groupFailures,
  isPaymentError,
  parseConversationAnalytics,
  parsePricingAnalytics,
  summarizeSpend,
} from './spend'

// 2026-10-23 00:00 IST and 2026-10-24 00:00 IST
const D1 = Date.UTC(2026, 9, 22, 18, 30) / 1000
const D2 = Date.UTC(2026, 9, 23, 18, 30) / 1000

describe('parsePricingAnalytics', () => {
  it('reads data points', () => {
    const points = parsePricingAnalytics({
      pricing_analytics: {
        data: [
          {
            data_points: [
              { start: D1, end: D2, volume: 10, cost: 8.6, pricing_category: 'MARKETING', pricing_type: 'REGULAR' },
              { start: D1, end: D2, volume: 4, cost: 0, pricing_category: 'SERVICE', pricing_type: 'FREE_CUSTOMER_SERVICE' },
            ],
          },
        ],
      },
    })
    expect(points).toEqual([
      { start: D1, volume: 10, cost: 8.6, category: 'MARKETING', pricingType: 'REGULAR' },
      { start: D1, volume: 4, cost: 0, category: 'SERVICE', pricingType: 'FREE_CUSTOMER_SERVICE' },
    ])
  })

  it('tolerates a missing block', () => {
    expect(parsePricingAnalytics({})).toEqual([])
  })
})

describe('parseConversationAnalytics', () => {
  it('maps conversations to the same shape', () => {
    const [p] = parseConversationAnalytics({
      conversation_analytics: {
        data: [{ data_points: [{ start: D1, conversation: 3, cost: 2.5, conversation_category: 'UTILITY', conversation_type: 'REGULAR' }] }],
      },
    })
    expect(p).toEqual({ start: D1, volume: 3, cost: 2.5, category: 'UTILITY', pricingType: 'REGULAR' })
  })
})

describe('summarizeSpend', () => {
  it('totals by category and local day', () => {
    const s = summarizeSpend(
      [
        { start: D1, volume: 10, cost: 8.6, category: 'MARKETING', pricingType: 'REGULAR' },
        { start: D2, volume: 5, cost: 1.15, category: 'UTILITY', pricingType: 'REGULAR' },
        { start: D2, volume: 4, cost: 0, category: 'SERVICE', pricingType: 'FREE_CUSTOMER_SERVICE' },
      ],
      'Asia/Kolkata',
    )
    expect(s.total).toBe(9.75)
    expect(s.volume).toBe(19)
    expect(s.billableVolume).toBe(15)
    expect(s.freeVolume).toBe(4)
    expect(s.byCategory[0]).toEqual({ category: 'MARKETING', volume: 10, billable: 10, cost: 8.6 })
    expect(s.daily).toEqual([
      { day: '2026-10-23', cost: 8.6, volume: 10 },
      { day: '2026-10-24', cost: 1.15, volume: 9 },
    ])
  })
})

describe('helpers', () => {
  it('dayInZone uses the time zone', () => {
    expect(dayInZone(D1, 'Asia/Kolkata')).toBe('2026-10-23')
    expect(dayInZone(D1, 'UTC')).toBe('2026-10-22')
  })

  it('spots payment errors', () => {
    expect(isPaymentError({ code: 141006, description: 'There is an error with the payment method', solution: null })).toBe(true)
    expect(isPaymentError({ code: 141000, description: 'Display name not approved', solution: null })).toBe(false)
  })

  it('reads codes from broadcast error messages and groups them', () => {
    expect(codeFromErrorMessage('131049: Healthy ecosystem')).toBe(131049)
    expect(codeFromErrorMessage('(#130429) Rate limit hit')).toBe(130429)
    expect(codeFromErrorMessage('Opted out (replied STOP)')).toBeNull()
    expect(groupFailures([131049, 131049, null, 131026])).toEqual([
      { code: 131049, count: 2 },
      { code: null, count: 1 },
      { code: 131026, count: 1 },
    ])
  })
})

describe('estimateBroadcastCosts', () => {
  const base = {
    name: 'Diwali offer',
    createdAt: '2026-10-20T10:00:00Z',
    status: 'sent',
    templateName: 'diwali',
    templateCategory: 'MARKETING',
    recipients: 100,
    sent: 100,
    read: 40,
    failed: 0,
  }

  it('prices billable messages per category and falls back to the template category', () => {
    const rates = ratesByCategory([
      { category: 'MARKETING', volume: 200, billable: 200, cost: 172 },
      { category: 'SERVICE', volume: 10, billable: 0, cost: 0 },
    ])
    expect(rates).toEqual({ MARKETING: 0.86 })

    const [withPricing, withoutPricing] = estimateBroadcastCosts(
      [
        { ...base, id: 'b1', delivered: 90 },
        { ...base, id: 'b2', delivered: 50 },
      ],
      [{ broadcastId: 'b1', category: 'MARKETING', priced: 95, billable: 88 }],
      rates,
    )
    // b1: 88 billable reported; delivered (90) <= priced (95) so nothing unpriced.
    expect(withPricing.paid).toBe(88)
    expect(withPricing.cost).toBeCloseTo(75.68)
    // b2: no pricing yet → 50 delivered counted as marketing.
    expect(withoutPricing.paid).toBe(50)
    expect(withoutPricing.cost).toBe(43)
  })

  it('returns null cost when there is no rate for the category', () => {
    const [b] = estimateBroadcastCosts([{ ...base, id: 'b3', delivered: 10, templateCategory: 'UTILITY' }], [], {
      MARKETING: 0.86,
    })
    expect(b.paid).toBe(10)
    expect(b.cost).toBeNull()
  })
})
