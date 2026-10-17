import { describe, expect, it } from 'vitest'

import {
  MAX_LEAD_DAYS,
  SESSION_WINDOW_MS,
  isWindowOpen,
  validateSchedule,
  windowClosesAt,
  windowWarning,
} from './core'

const NOW = new Date('2026-10-17T10:00:00.000Z')
const inMinutes = (m: number) => new Date(NOW.getTime() + m * 60_000).toISOString()

describe('validateSchedule', () => {
  it('accepts a normal future time', () => {
    const r = validateSchedule({ scheduledAt: inMinutes(30), text: 'Hello' }, NOW)
    expect(r.ok).toBe(true)
  })

  it('rejects empty or whitespace text', () => {
    expect(validateSchedule({ scheduledAt: inMinutes(30), text: '   ' }, NOW).ok).toBe(false)
    expect(validateSchedule({ scheduledAt: inMinutes(30), text: undefined }, NOW).ok).toBe(false)
  })

  it('rejects text over 4096 characters', () => {
    expect(validateSchedule({ scheduledAt: inMinutes(30), text: 'a'.repeat(4097) }, NOW).ok).toBe(false)
    expect(validateSchedule({ scheduledAt: inMinutes(30), text: 'a'.repeat(4096) }, NOW).ok).toBe(true)
  })

  it('rejects missing or invalid dates', () => {
    expect(validateSchedule({ scheduledAt: undefined, text: 'Hi' }, NOW).ok).toBe(false)
    expect(validateSchedule({ scheduledAt: 'not a date', text: 'Hi' }, NOW).ok).toBe(false)
  })

  it('rejects times in the past or under a minute away', () => {
    expect(validateSchedule({ scheduledAt: inMinutes(-5), text: 'Hi' }, NOW).ok).toBe(false)
    expect(validateSchedule({ scheduledAt: inMinutes(0.5), text: 'Hi' }, NOW).ok).toBe(false)
    expect(validateSchedule({ scheduledAt: inMinutes(2), text: 'Hi' }, NOW).ok).toBe(true)
  })

  it('rejects more than 30 days ahead but allows exactly 30', () => {
    const day = 24 * 60
    expect(validateSchedule({ scheduledAt: inMinutes(MAX_LEAD_DAYS * day), text: 'Hi' }, NOW).ok).toBe(true)
    expect(validateSchedule({ scheduledAt: inMinutes(MAX_LEAD_DAYS * day + 5), text: 'Hi' }, NOW).ok).toBe(false)
  })
})

describe('24-hour window', () => {
  const last = '2026-10-17T08:00:00.000Z'

  it('closes 24 hours after the last customer message', () => {
    expect(windowClosesAt(last)?.toISOString()).toBe('2026-10-18T08:00:00.000Z')
    expect(windowClosesAt(null)).toBeNull()
    expect(windowClosesAt('garbage')).toBeNull()
  })

  it('is open before and closed at/after the boundary', () => {
    const closes = new Date(new Date(last).getTime() + SESSION_WINDOW_MS)
    expect(isWindowOpen(last, new Date(closes.getTime() - 1))).toBe(true)
    expect(isWindowOpen(last, closes)).toBe(false)
    expect(isWindowOpen(null, NOW)).toBe(false)
  })

  it('warns only when the scheduled time is outside the window', () => {
    expect(windowWarning(last, new Date('2026-10-17T20:00:00.000Z'))).toBeNull()
    expect(windowWarning(last, new Date('2026-10-18T09:00:00.000Z'))).toMatch(/24-hour/)
    expect(windowWarning(null, new Date('2026-10-17T20:00:00.000Z'))).toMatch(/has not messaged/)
  })
})
