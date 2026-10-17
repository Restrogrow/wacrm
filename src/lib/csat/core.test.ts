import { describe, expect, it } from 'vitest'

import {
  CSAT_DEFAULT_MESSAGE,
  CSAT_OPTIONS,
  csatButtonId,
  normalizeCsatMessage,
  parseCsatButtonId,
  summarizeCsat,
} from './core'

const ID = '0f6d1d9c-c5dc-424c-9dca-146eadc7bf25'

describe('csat button ids', () => {
  it('round-trips', () => {
    expect(parseCsatButtonId(csatButtonId(ID, 3))).toEqual({ responseId: ID, rating: 3 })
    expect(parseCsatButtonId(csatButtonId(ID, 1))).toEqual({ responseId: ID, rating: 1 })
  })

  it('is case-insensitive on the uuid and trims', () => {
    expect(parseCsatButtonId(` csat:${ID.toUpperCase()}:2 `)).toEqual({ responseId: ID, rating: 2 })
  })

  it('rejects anything that is not a csat button', () => {
    expect(parseCsatButtonId('csat:not-a-uuid:2')).toBeNull()
    expect(parseCsatButtonId(`csat:${ID}:4`)).toBeNull()
    expect(parseCsatButtonId(`csat:${ID}:0`)).toBeNull()
    expect(parseCsatButtonId(`other:${ID}:2`)).toBeNull()
    expect(parseCsatButtonId('menu_1')).toBeNull()
    expect(parseCsatButtonId(undefined)).toBeNull()
    expect(parseCsatButtonId(42)).toBeNull()
  })

  it('keeps every button title within Meta’s 20-character limit', () => {
    for (const o of CSAT_OPTIONS) expect(o.title.length).toBeLessThanOrEqual(20)
    expect(CSAT_OPTIONS).toHaveLength(3)
  })
})

describe('normalizeCsatMessage', () => {
  it('falls back to the default when empty', () => {
    expect(normalizeCsatMessage('   ')).toBe(CSAT_DEFAULT_MESSAGE)
    expect(normalizeCsatMessage(undefined)).toBe(CSAT_DEFAULT_MESSAGE)
  })
  it('trims and caps at 1024 characters', () => {
    expect(normalizeCsatMessage('  Rate us  ')).toBe('Rate us')
    expect(normalizeCsatMessage('x'.repeat(2000))).toHaveLength(1024)
  })
})

describe('summarizeCsat', () => {
  it('handles no surveys', () => {
    const s = summarizeCsat([])
    expect(s).toMatchObject({ sent: 0, answered: 0, responseRate: null, average: null, greatPct: null })
  })

  it('counts unanswered surveys in the response rate only', () => {
    const s = summarizeCsat([{ rating: 3 }, { rating: 3 }, { rating: 1 }, { rating: null }])
    expect(s.sent).toBe(4)
    expect(s.answered).toBe(3)
    expect(s.responseRate).toBe(75)
    expect(s.average).toBe(2.33)
    expect(s.distribution).toEqual({ 1: 1, 2: 0, 3: 2 })
    expect(s.greatPct).toBe(67)
  })

  it('ignores out-of-range ratings', () => {
    const s = summarizeCsat([{ rating: 9 }, { rating: 2 }])
    expect(s.answered).toBe(1)
    expect(s.average).toBe(2)
  })
})
