import { afterEach, describe, expect, it, vi } from 'vitest'

vi.mock('@/lib/flows/admin-client', () => ({ supabaseAdmin: () => ({}) }))
vi.mock('@/lib/whatsapp/encryption', () => ({ decrypt: (s: string) => s }))
vi.mock('@/lib/email/mailer', () => ({ isEmailConfigured: () => false, sendEmail: vi.fn() }))

import { assessHealth, describeLimit, fetchNumberHealthFromMeta, limitAllowsCalling } from './number-health'

describe('assessHealth', () => {
  it('is ok for a green, available number', () => {
    expect(assessHealth({ quality_rating: 'GREEN', can_send: 'AVAILABLE', name_status: 'APPROVED', number_status: 'CONNECTED' })).toEqual({
      level: 'ok',
      reasons: [],
    })
  })

  it('warns on yellow quality', () => {
    const r = assessHealth({ quality_rating: 'YELLOW', can_send: 'AVAILABLE', name_status: null, number_status: 'CONNECTED' })
    expect(r.level).toBe('warning')
    expect(r.reasons[0]).toMatch(/medium/)
  })

  it('is critical when red or blocked, with every reason listed', () => {
    const r = assessHealth({ quality_rating: 'RED', can_send: 'BLOCKED', name_status: 'DECLINED', number_status: 'CONNECTED' })
    expect(r.level).toBe('critical')
    expect(r.reasons).toHaveLength(3)
  })

  it('treats a restricted number as critical', () => {
    expect(assessHealth({ quality_rating: 'GREEN', can_send: null, name_status: null, number_status: 'RESTRICTED' }).level).toBe('critical')
  })

  it('is unknown when nothing has been read', () => {
    expect(assessHealth({ quality_rating: null, can_send: null, name_status: null, number_status: null }).level).toBe('unknown')
  })
})

describe('messaging limits', () => {
  it('describes tiers in plain words', () => {
    expect(describeLimit('TIER_250')).toBe('250 customers a day')
    expect(describeLimit('TIER_2K')).toBe('2,000 customers a day')
    expect(describeLimit('TIER_100K')).toBe('1,00,000 customers a day')
    expect(describeLimit('TIER_UNLIMITED')).toBe('Unlimited')
    expect(describeLimit(null)).toBe('Unknown')
  })

  it('knows when calling is allowed (2,000+)', () => {
    expect(limitAllowsCalling('TIER_250')).toBe(false)
    expect(limitAllowsCalling('TIER_1K')).toBe(false)
    expect(limitAllowsCalling('TIER_2K')).toBe(true)
    expect(limitAllowsCalling('TIER_UNLIMITED')).toBe(true)
  })
})

describe('fetchNumberHealthFromMeta', () => {
  afterEach(() => vi.unstubAllGlobals())

  function stubGraph(handler: (url: string) => { status?: number; body: unknown }) {
    vi.stubGlobal(
      'fetch',
      vi.fn(async (url: string) => {
        const { status = 200, body } = handler(url)
        return new Response(JSON.stringify(body), { status })
      }),
    )
  }

  it('reads the new messaging limit field, send health and calling', async () => {
    stubGraph((url) => {
      if (url.includes('fields=health_status')) {
        return { body: { health_status: { can_send_message: 'LIMITED', entities: [{ errors: [{ error_description: 'Too many reports' }] }] } } }
      }
      if (url.endsWith('/settings')) return { body: { calling: { status: 'ENABLED' } } }
      return {
        body: {
          display_phone_number: '+91 98000 00000',
          verified_name: 'Priya Stores',
          quality_rating: 'GREEN',
          name_status: 'APPROVED',
          status: 'CONNECTED',
          whatsapp_business_manager_messaging_limit: 'TIER_2K',
        },
      }
    })
    const h = await fetchNumberHealthFromMeta('pn1', 'token')
    expect(h).toMatchObject({
      quality_rating: 'GREEN',
      messaging_limit: 'TIER_2K',
      can_send: 'LIMITED',
      calling_status: 'ENABLED',
      health_errors: [{ error_description: 'Too many reports' }],
    })
  })

  it('falls back to the deprecated field, and reports calling not allowed', async () => {
    stubGraph((url) => {
      if (url.includes('whatsapp_business_manager_messaging_limit')) {
        return { status: 400, body: { error: { message: '(#100) Tried accessing nonexisting field' } } }
      }
      if (url.includes('fields=health_status')) return { status: 400, body: { error: { message: 'nope' } } }
      if (url.endsWith('/settings')) {
        return { status: 400, body: { error: { message: 'WhatsApp Cloud API calling not enabled for this phone number.' } } }
      }
      return { body: { quality_rating: 'YELLOW', messaging_limit_tier: 'TIER_1K' } }
    })
    const h = await fetchNumberHealthFromMeta('pn1', 'token')
    expect(h).toMatchObject({ quality_rating: 'YELLOW', messaging_limit: 'TIER_1K', can_send: null, calling_status: 'NOT_ALLOWED' })
  })
})
