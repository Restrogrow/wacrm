import { describe, expect, it } from 'vitest'

import { countDays, customRange, dayKeys, describeRange, fillDays, presetRange } from './range'

const NOW = new Date(2026, 9, 17, 15, 30) // 17 Oct 2026, local

describe('presetRange', () => {
  it('covers N calendar days ending today, with an exclusive end', () => {
    const r = presetRange(7, NOW)
    expect(r.days).toBe(7)
    expect(r.from).toEqual(new Date(2026, 9, 11))
    expect(r.to).toEqual(new Date(2026, 9, 18))
    expect(countDays(r.from, r.to)).toBe(7)
  })
})

describe('customRange', () => {
  it('includes both the start and end days', () => {
    const r = customRange('2026-10-01', '2026-10-10', NOW)
    expect(r.ok && r.range.days).toBe(10)
    expect(r.ok && r.range.to).toEqual(new Date(2026, 9, 11))
  })

  it('clamps an end date in the future to today', () => {
    const r = customRange('2026-10-15', '2026-12-31', NOW)
    expect(r.ok && r.range.to).toEqual(new Date(2026, 9, 18))
  })

  it('rejects bad input', () => {
    expect(customRange('', '2026-10-10', NOW).ok).toBe(false)
    expect(customRange('2026-02-31', '2026-03-05', NOW).ok).toBe(false)
    expect(customRange('2026-10-10', '2026-10-01', NOW).ok).toBe(false)
    expect(customRange('2026-11-01', '2026-11-05', NOW).ok).toBe(false)
  })

  it('caps the range at 365 days', () => {
    expect(customRange('2025-10-17', '2026-10-17', NOW).ok).toBe(false) // 366 days
    expect(customRange('2025-10-18', '2026-10-17', NOW).ok).toBe(true) // 365 days
  })
})

describe('dayKeys / fillDays', () => {
  it('lists one key per day and fills quiet days with zeros', () => {
    const r = presetRange(7, NOW)
    const keys = dayKeys(r)
    expect(keys).toEqual([
      '2026-10-11',
      '2026-10-12',
      '2026-10-13',
      '2026-10-14',
      '2026-10-15',
      '2026-10-16',
      '2026-10-17',
    ])
    const filled = fillDays(keys, [{ day: '2026-10-13', n: 5 }], (day) => ({ day, n: 0 }))
    expect(filled.map((x) => x.n)).toEqual([0, 0, 5, 0, 0, 0, 0])
  })
})

describe('describeRange', () => {
  it('shows the first and last included day', () => {
    expect(describeRange(presetRange(7, NOW))).toContain('2026')
  })
})
