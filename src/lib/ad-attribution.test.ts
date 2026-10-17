import { describe, expect, it } from 'vitest'

import {
  adSourceLabel,
  aggregateLeadSources,
  parseReferral,
  referralToColumns,
} from './ad-attribution'

describe('parseReferral', () => {
  it('parses a full Meta ad referral', () => {
    const ref = parseReferral({
      source_url: 'https://fb.me/abc',
      source_id: '120210000000001',
      source_type: 'ad',
      headline: 'Diwali offer',
      body: '20% off',
      ctwa_clid: 'ARAk123',
      media_type: 'image',
    })
    expect(ref).toEqual({
      type: 'ad',
      id: '120210000000001',
      url: 'https://fb.me/abc',
      headline: 'Diwali offer',
      body: '20% off',
      ctwaClid: 'ARAk123',
    })
  })

  it('maps post and unknown source types', () => {
    expect(parseReferral({ source_id: '1', source_type: 'POST' })?.type).toBe('post')
    expect(parseReferral({ source_id: '1', source_type: 'weird' })?.type).toBe('other')
    expect(parseReferral({ source_id: '1' })?.type).toBe('other')
  })

  it('returns null for missing or empty input', () => {
    expect(parseReferral(undefined)).toBeNull()
    expect(parseReferral(null)).toBeNull()
    expect(parseReferral('x')).toBeNull()
    expect(parseReferral({})).toBeNull()
    expect(parseReferral({ source_type: 'ad' })).toBeNull()
  })

  it('drops non-http urls and non-string fields', () => {
    const ref = parseReferral({ source_url: 'javascript:alert(1)', source_id: 42, headline: 'ok' })
    expect(ref?.url).toBeNull()
    expect(ref?.id).toBeNull()
    expect(ref?.headline).toBe('ok')
  })

  it('caps overly long values', () => {
    const ref = parseReferral({ source_id: 'a'.repeat(500), headline: 'h'.repeat(2000) })
    expect(ref?.id?.length).toBe(100)
    expect(ref?.headline?.length).toBe(300)
  })
})

describe('referralToColumns', () => {
  it('maps to contact columns with a first-seen timestamp', () => {
    const now = new Date('2026-10-17T10:00:00Z')
    const cols = referralToColumns(
      { type: 'ad', id: '9', url: null, headline: 'H', body: null, ctwaClid: 'c' },
      now,
    )
    expect(cols).toMatchObject({
      ad_source_type: 'ad',
      ad_source_id: '9',
      ad_headline: 'H',
      ad_ctwa_clid: 'c',
      ad_first_seen_at: '2026-10-17T10:00:00.000Z',
    })
  })
})

describe('adSourceLabel', () => {
  it('is null for contacts not from an ad', () => {
    expect(adSourceLabel({})).toBeNull()
  })
  it('prefers headline, then id, then url host', () => {
    const base = { ad_first_seen_at: '2026-10-17T00:00:00Z' }
    expect(adSourceLabel({ ...base, ad_source_type: 'ad', ad_headline: 'Sale' })).toBe('Ad: Sale')
    expect(adSourceLabel({ ...base, ad_source_type: 'post', ad_source_id: '77' })).toBe('Post: #77')
    expect(
      adSourceLabel({ ...base, ad_source_type: 'ad', ad_source_url: 'https://www.example.com/x' }),
    ).toBe('Ad: example.com')
    expect(adSourceLabel({ ...base, ad_source_type: 'ad' })).toBe('Ad')
  })
})

describe('aggregateLeadSources', () => {
  it('groups by source and sorts by count', () => {
    const t = '2026-10-17T00:00:00Z'
    const rows = [
      { ad_first_seen_at: t, ad_source_type: 'ad', ad_source_id: '1', ad_headline: 'A' },
      { ad_first_seen_at: t, ad_source_type: 'ad', ad_source_id: '2', ad_headline: 'B' },
      { ad_first_seen_at: t, ad_source_type: 'ad', ad_source_id: '2', ad_headline: 'B' },
      { ad_first_seen_at: null, ad_source_type: 'ad', ad_source_id: '3' },
    ]
    const out = aggregateLeadSources(rows)
    expect(out.map((r) => [r.label, r.count])).toEqual([
      ['B', 2],
      ['A', 1],
    ])
  })
  it('keeps ad and post with the same id separate', () => {
    const t = '2026-10-17T00:00:00Z'
    const out = aggregateLeadSources([
      { ad_first_seen_at: t, ad_source_type: 'ad', ad_source_id: '5' },
      { ad_first_seen_at: t, ad_source_type: 'post', ad_source_id: '5' },
    ])
    expect(out).toHaveLength(2)
  })
})
