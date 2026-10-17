import { describe, expect, it } from 'vitest'

import type { Contact } from '@/types'

import { defaultChoices, fieldConflicts, pickField, previewMerge } from './merge'

function contact(over: Partial<Contact>): Contact {
  return {
    id: 'id',
    user_id: 'u',
    account_id: 'a',
    phone: '+919876543210',
    created_at: '2026-01-10T00:00:00.000Z',
    updated_at: '2026-01-10T00:00:00.000Z',
    ...over,
  }
}

describe('pickField', () => {
  it('prefers the chosen side', () => {
    expect(pickField('Asha', 'Asha K', 'primary')).toBe('Asha')
    expect(pickField('Asha', 'Asha K', 'secondary')).toBe('Asha K')
  })

  it('falls back when the chosen side is blank', () => {
    expect(pickField('', 'Asha K', 'primary')).toBe('Asha K')
    expect(pickField('Asha', '   ', 'secondary')).toBe('Asha')
    expect(pickField(null, undefined, 'primary')).toBeNull()
  })

  it('defaults to the primary', () => {
    expect(pickField('A', 'B', undefined)).toBe('A')
  })
})

describe('fieldConflicts', () => {
  it('lists only fields where both have different values', () => {
    const p = contact({ name: 'Asha', email: 'a@x.com', company: 'Acme' })
    const s = contact({ name: 'Asha K', email: 'A@X.COM', company: '' })
    expect(fieldConflicts(p, s)).toEqual(['name'])
  })
})

describe('previewMerge', () => {
  it('combines fields, keeps the oldest created date and the primary phone', () => {
    const p = contact({ name: 'Asha', company: 'Acme', created_at: '2026-01-01T00:00:00.000Z' })
    const s = contact({ name: 'Asha K', email: 's@x.com', phone: '9876543210', created_at: '2026-03-01T00:00:00.000Z' })
    const m = previewMerge(p, s, { ...defaultChoices(), name: 'secondary' })
    expect(m).toMatchObject({
      name: 'Asha K',
      email: 's@x.com',
      company: 'Acme',
      phone: '+919876543210',
      created_at: '2026-01-01T00:00:00.000Z',
    })
  })

  it('uses the secondary phone when the primary has none', () => {
    const p = contact({ phone: '' })
    const s = contact({ phone: '9876543210' })
    expect(previewMerge(p, s, {}).phone).toBe('9876543210')
  })

  it('never re-subscribes: keeps the earliest opt-out from either side', () => {
    const p = contact({ opted_out_at: null })
    const s = contact({ opted_out_at: '2026-02-01T00:00:00.000Z' })
    expect(previewMerge(p, s, {}).opted_out_at).toBe('2026-02-01T00:00:00.000Z')
    const both = previewMerge(
      contact({ opted_out_at: '2026-03-01T00:00:00.000Z' }),
      contact({ opted_out_at: '2026-02-01T00:00:00.000Z' }),
      {},
    )
    expect(both.opted_out_at).toBe('2026-02-01T00:00:00.000Z')
    expect(previewMerge(contact({}), contact({}), {}).opted_out_at).toBeNull()
  })

  it('takes the older ad first-touch', () => {
    const p = contact({ ad_first_seen_at: '2026-03-01T00:00:00.000Z' })
    const s = contact({ ad_first_seen_at: '2026-02-01T00:00:00.000Z' })
    expect(previewMerge(p, s, {}).adFromSecondary).toBe(true)
    expect(previewMerge(s, p, {}).adFromSecondary).toBe(false)
    expect(previewMerge(contact({}), contact({}), {}).adFromSecondary).toBe(false)
    expect(previewMerge(contact({}), s, {}).adFromSecondary).toBe(true)
  })
})
