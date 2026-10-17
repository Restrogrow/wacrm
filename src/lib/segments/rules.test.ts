import { describe, expect, it } from 'vitest'

import {
  MAX_CONDITIONS,
  describeRules,
  emptyRules,
  newCondition,
  readRules,
  validateRules,
} from './rules'

const TAG = '11111111-1111-1111-1111-111111111111'
const TAG2 = '22222222-2222-2222-2222-222222222222'
const FIELD = '33333333-3333-3333-3333-333333333333'

describe('validateRules', () => {
  it('accepts an empty rule set (everyone)', () => {
    const r = validateRules({ match: 'all', conditions: [] })
    expect(r).toEqual({ ok: true, rules: { match: 'all', conditions: [] } })
  })

  it('defaults match to "all" and trims text', () => {
    const r = validateRules({ match: 'bogus', conditions: [{ field: 'name', op: 'contains', value: '  asha  ' }] })
    expect(r.ok && r.rules.match).toBe('all')
    expect(r.ok && r.rules.conditions[0].value).toBe('asha')
  })

  it('keeps match "any"', () => {
    const r = validateRules({ match: 'any', conditions: [{ field: 'opted_out', op: 'is_true' }] })
    expect(r.ok && r.rules.match).toBe('any')
  })

  it('drops unknown keys from conditions', () => {
    const r = validateRules({ conditions: [{ field: 'opted_out', op: 'is_true', value: 'x', evil: 1 }] })
    expect(r.ok && r.rules.conditions[0]).toEqual({ field: 'opted_out', op: 'is_true' })
  })

  it('rejects unknown fields and operators', () => {
    expect(validateRules({ conditions: [{ field: 'password', op: 'contains', value: 'x' }] }).ok).toBe(false)
    expect(validateRules({ conditions: [{ field: 'name', op: 'matches_regex', value: 'x' }] }).ok).toBe(false)
  })

  it('requires a value where an operator needs one', () => {
    expect(validateRules({ conditions: [{ field: 'name', op: 'contains', value: '   ' }] }).ok).toBe(false)
    expect(validateRules({ conditions: [{ field: 'name', op: 'is_empty' }] }).ok).toBe(true)
  })

  it('rejects over-long text', () => {
    const long = 'a'.repeat(201)
    expect(validateRules({ conditions: [{ field: 'name', op: 'contains', value: long }] }).ok).toBe(false)
  })

  it('validates tag conditions (uuid list, de-duplicated)', () => {
    const ok = validateRules({ conditions: [{ field: 'tag', op: 'has_any', value: [TAG, TAG, TAG2] }] })
    expect(ok.ok && ok.rules.conditions[0].value).toEqual([TAG, TAG2])
    expect(validateRules({ conditions: [{ field: 'tag', op: 'has_any', value: [] }] }).ok).toBe(false)
    expect(validateRules({ conditions: [{ field: 'tag', op: 'has_any', value: ['not-a-uuid'] }] }).ok).toBe(false)
    expect(validateRules({ conditions: [{ field: 'tag', op: 'has_any', value: 'nope' }] }).ok).toBe(false)
  })

  it('validates dates and day counts', () => {
    expect(validateRules({ conditions: [{ field: 'created_at', op: 'before', value: '2026-10-17' }] }).ok).toBe(true)
    expect(validateRules({ conditions: [{ field: 'created_at', op: 'before', value: '2026-13-40' }] }).ok).toBe(false)
    expect(validateRules({ conditions: [{ field: 'created_at', op: 'before', value: 'yesterday' }] }).ok).toBe(false)
    expect(validateRules({ conditions: [{ field: 'created_at', op: 'within_days', value: '30' }] }).ok).toBe(true)
    expect(validateRules({ conditions: [{ field: 'created_at', op: 'within_days', value: '0' }] }).ok).toBe(false)
    expect(validateRules({ conditions: [{ field: 'created_at', op: 'within_days', value: '1; drop table' }] }).ok).toBe(false)
  })

  it('requires a custom field id for custom field conditions', () => {
    expect(validateRules({ conditions: [{ field: 'custom_field', op: 'is', value: 'x' }] }).ok).toBe(false)
    const ok = validateRules({ conditions: [{ field: 'custom_field', field_id: FIELD, op: 'is', value: 'Pune' }] })
    expect(ok.ok && ok.rules.conditions[0].field_id).toBe(FIELD)
  })

  it('caps the number of conditions', () => {
    const many = Array.from({ length: MAX_CONDITIONS + 1 }, () => ({ field: 'opted_out', op: 'is_false' }))
    expect(validateRules({ conditions: many }).ok).toBe(false)
    expect(validateRules({ conditions: many.slice(0, MAX_CONDITIONS) }).ok).toBe(true)
  })

  it('rejects non-objects', () => {
    expect(validateRules(null).ok).toBe(false)
    expect(validateRules('x').ok).toBe(false)
    expect(validateRules({ conditions: 'x' }).ok).toBe(false)
  })
})

describe('readRules', () => {
  it('falls back to empty rules for corrupt data', () => {
    expect(readRules({ conditions: [{ field: 'nope', op: 'x' }] })).toEqual(emptyRules())
    expect(readRules(undefined)).toEqual(emptyRules())
  })
})

describe('newCondition', () => {
  it('starts every field with a valid-shaped condition', () => {
    expect(newCondition('name')).toEqual({ field: 'name', op: 'contains', value: '' })
    expect(newCondition('tag')).toEqual({ field: 'tag', op: 'has_any', value: [] })
    expect(newCondition('opted_out')).toEqual({ field: 'opted_out', op: 'is_true' })
  })
})

describe('describeRules', () => {
  const ctx = { tagNames: { [TAG]: 'VIP' }, fieldNames: { [FIELD]: 'City' } }

  it('reads naturally', () => {
    const rules = validateRules({
      match: 'all',
      conditions: [
        { field: 'tag', op: 'has_any', value: [TAG] },
        { field: 'created_at', op: 'within_days', value: '7' },
        { field: 'custom_field', field_id: FIELD, op: 'is', value: 'Pune' },
      ],
    })
    expect(rules.ok).toBe(true)
    if (!rules.ok) return
    expect(describeRules(rules.rules, ctx)).toBe(
      'Tags has any of VIP AND Added in the last 7 days AND City is "Pune"',
    )
  })

  it('says Everyone for no conditions and OR for any', () => {
    expect(describeRules(emptyRules(), ctx)).toBe('Everyone')
    const any = validateRules({
      match: 'any',
      conditions: [
        { field: 'opted_out', op: 'is_true' },
        { field: 'ad_source', op: 'from_ad' },
      ],
    })
    expect(any.ok && describeRules(any.rules, ctx)).toBe('Opted out (STOP) yes OR Came from an ad yes (any Click-to-WhatsApp ad)')
  })
})
