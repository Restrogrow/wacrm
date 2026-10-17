import { describe, expect, it } from 'vitest'

import { formatDuration, formatPct, ratePct } from './format'

describe('formatDuration', () => {
  it('formats across units', () => {
    expect(formatDuration(0)).toBe('0s')
    expect(formatDuration(45)).toBe('45s')
    expect(formatDuration(252)).toBe('4m 12s')
    expect(formatDuration(3900)).toBe('1h 5m')
    expect(formatDuration(97200)).toBe('1d 3h')
  })
  it('shows a dash when there is no sample', () => {
    expect(formatDuration(null)).toBe('—')
    expect(formatDuration(undefined)).toBe('—')
    expect(formatDuration(-1)).toBe('—')
  })
})

describe('ratePct / formatPct', () => {
  it('divides safely', () => {
    expect(ratePct(1, 4)).toBe(25)
    expect(ratePct(1, 0)).toBeNull()
    expect(formatPct(ratePct(1, 3))).toBe('33.3%')
    expect(formatPct(100)).toBe('100%')
    expect(formatPct(null)).toBe('—')
  })
})
