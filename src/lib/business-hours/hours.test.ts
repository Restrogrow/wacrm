import { describe, expect, it } from 'vitest'

import {
  DEFAULT_SETTINGS,
  businessMinutesBetween,
  isOpenNow,
  isSlaBreached,
  pickAutoReply,
  renderAutoReply,
  rowToSettings,
  validateSettings,
  type BusinessHoursSettings,
  type DayKey,
} from './hours'

const IST_OFFSET_MIN = 330

/** An instant from a wall-clock reading in India (UTC+5:30, no DST). */
function ist(y: number, mo: number, d: number, h: number, mi = 0): Date {
  return new Date(Date.UTC(y, mo - 1, d, h, mi) - IST_OFFSET_MIN * 60_000)
}

function settings(overrides: Partial<BusinessHoursSettings> = {}): BusinessHoursSettings {
  return {
    ...DEFAULT_SETTINGS,
    weekly: { ...DEFAULT_SETTINGS.weekly },
    enabled: true,
    ...overrides,
  }
}

// 2026-10-19 is a Monday, 2026-10-23 a Friday, 2026-10-24 a Saturday.
describe('isOpenNow', () => {
  it('is always open when business hours are disabled', () => {
    const s = settings({ enabled: false })
    expect(isOpenNow(s, ist(2026, 10, 25, 3))).toBe(true) // Sunday 3am
  })

  it('is open during weekday hours and closed outside them', () => {
    const s = settings()
    expect(isOpenNow(s, ist(2026, 10, 19, 10, 30))).toBe(true)
    expect(isOpenNow(s, ist(2026, 10, 19, 8, 59))).toBe(false)
    expect(isOpenNow(s, ist(2026, 10, 19, 20, 0))).toBe(false)
  })

  it('includes the opening minute and excludes the closing minute', () => {
    const s = settings()
    expect(isOpenNow(s, ist(2026, 10, 19, 9, 0))).toBe(true)
    expect(isOpenNow(s, ist(2026, 10, 19, 17, 59))).toBe(true)
    expect(isOpenNow(s, ist(2026, 10, 19, 18, 0))).toBe(false)
  })

  it('is closed on days switched off', () => {
    const s = settings()
    expect(isOpenNow(s, ist(2026, 10, 24, 11))).toBe(false) // Saturday
    expect(isOpenNow(s, ist(2026, 10, 25, 11))).toBe(false) // Sunday
  })

  it('reads the clock in the account timezone, not UTC', () => {
    const s = settings()
    // 04:30 UTC = 10:00 IST on a Monday.
    const instant = new Date(Date.UTC(2026, 9, 19, 4, 30))
    expect(isOpenNow(s, instant)).toBe(true)
    expect(isOpenNow(settings({ timezone: 'UTC' }), instant)).toBe(false)
  })

  it('handles a timezone with daylight saving', () => {
    const s = settings({ timezone: 'America/New_York' })
    // Mon 2026-07-06 10:00 EDT = 14:00 UTC (UTC-4).
    expect(isOpenNow(s, new Date(Date.UTC(2026, 6, 6, 14, 0)))).toBe(true)
    // Mon 2026-01-05 10:00 EST = 15:00 UTC (UTC-5): 14:00 UTC is only 9:00 EST.
    expect(isOpenNow(s, new Date(Date.UTC(2026, 0, 5, 14, 0)))).toBe(true)
    expect(isOpenNow(s, new Date(Date.UTC(2026, 0, 5, 13, 59)))).toBe(false)
  })

  it('falls back to India time for an invalid timezone', () => {
    const s = settings({ timezone: 'Not/AZone' })
    expect(isOpenNow(s, ist(2026, 10, 19, 10))).toBe(true)
  })

  it('supports overnight shifts that run past midnight', () => {
    const s = settings()
    s.weekly.fri = { open: true, start: '22:00', end: '02:00' }
    expect(isOpenNow(s, ist(2026, 10, 23, 21, 59))).toBe(false)
    expect(isOpenNow(s, ist(2026, 10, 23, 22, 0))).toBe(true)
    expect(isOpenNow(s, ist(2026, 10, 23, 23, 30))).toBe(true)
    // Saturday 01:00 is the tail of Friday's shift.
    expect(isOpenNow(s, ist(2026, 10, 24, 1, 0))).toBe(true)
    expect(isOpenNow(s, ist(2026, 10, 24, 2, 0))).toBe(false)
    expect(isOpenNow(s, ist(2026, 10, 24, 3, 0))).toBe(false)
  })

  it('treats start = end as open all day', () => {
    const s = settings()
    s.weekly.sat = { open: true, start: '00:00', end: '00:00' }
    expect(isOpenNow(s, ist(2026, 10, 24, 3, 0))).toBe(true)
    expect(isOpenNow(s, ist(2026, 10, 24, 23, 59))).toBe(true)
  })

  it('is closed all day on holidays', () => {
    const s = settings({ holidays: ['2026-10-19'] })
    expect(isOpenNow(s, ist(2026, 10, 19, 10))).toBe(false)
    expect(isOpenNow(s, ist(2026, 10, 20, 10))).toBe(true)
  })

  it('does not carry an overnight shift past a holiday start', () => {
    const s = settings({ holidays: ['2026-10-23'] })
    s.weekly.fri = { open: true, start: '22:00', end: '02:00' }
    expect(isOpenNow(s, ist(2026, 10, 24, 1, 0))).toBe(false)
  })
})

describe('businessMinutesBetween', () => {
  it('equals wall-clock minutes when hours are disabled', () => {
    const s = settings({ enabled: false })
    expect(businessMinutesBetween(s, ist(2026, 10, 19, 10), ist(2026, 10, 19, 12))).toBe(120)
  })

  it('counts only minutes inside business hours', () => {
    const s = settings()
    // Mon 17:00 -> Tue 10:00: 1h before close + 1h after open.
    expect(businessMinutesBetween(s, ist(2026, 10, 19, 17), ist(2026, 10, 20, 10))).toBe(120)
  })

  it('skips weekends', () => {
    const s = settings()
    // Fri 17:00 -> Mon 10:00.
    expect(businessMinutesBetween(s, ist(2026, 10, 23, 17), ist(2026, 10, 26, 10))).toBe(120)
  })

  it('skips holidays', () => {
    const s = settings({ holidays: ['2026-10-20'] })
    // Mon 17:00 -> Wed 10:00 with Tuesday off: 60 + 60.
    expect(businessMinutesBetween(s, ist(2026, 10, 19, 17), ist(2026, 10, 21, 10))).toBe(120)
  })

  it('returns 0 for an empty or backwards range', () => {
    const s = settings()
    expect(businessMinutesBetween(s, ist(2026, 10, 19, 12), ist(2026, 10, 19, 11))).toBe(0)
  })

  it('counts a full overnight shift once', () => {
    const s = settings()
    s.weekly.mon = { open: true, start: '22:00', end: '02:00' }
    // Mon 22:00 -> Tue 02:00 = 4h.
    expect(businessMinutesBetween(s, ist(2026, 10, 19, 22), ist(2026, 10, 20, 2))).toBe(240)
  })
})

describe('isSlaBreached', () => {
  const base = { sla_enabled: true, sla_first_response_minutes: 15 }

  it('is never breached when SLA is off', () => {
    const s = settings({ sla_enabled: false })
    expect(isSlaBreached(s, ist(2026, 10, 19, 10), ist(2026, 10, 19, 15))).toBe(false)
  })

  it('breaches once the wall-clock wait reaches the target', () => {
    const s = settings({ ...base, enabled: false })
    expect(isSlaBreached(s, ist(2026, 10, 19, 10, 0), ist(2026, 10, 19, 10, 14))).toBe(false)
    expect(isSlaBreached(s, ist(2026, 10, 19, 10, 0), ist(2026, 10, 19, 10, 15))).toBe(true)
  })

  it('counts overnight waits in full when business hours are not used', () => {
    const s = settings({ ...base })
    expect(isSlaBreached(s, ist(2026, 10, 19, 17, 55), ist(2026, 10, 19, 22, 0))).toBe(true)
  })

  it('pauses the clock outside business hours when asked to', () => {
    const s = settings({ ...base, sla_business_hours_only: true })
    // Message at 17:55: only 5 business minutes by 22:00, so not breached.
    expect(isSlaBreached(s, ist(2026, 10, 19, 17, 55), ist(2026, 10, 19, 22, 0))).toBe(false)
    // Next morning at 09:10: 5 + 10 = 15 minutes, breached.
    expect(isSlaBreached(s, ist(2026, 10, 19, 17, 55), ist(2026, 10, 20, 9, 10))).toBe(true)
  })
})

describe('auto-reply helpers', () => {
  it('fills the customer name', () => {
    expect(renderAutoReply('Hi {{name}}!', 'Priya Sharma')).toBe('Hi Priya!')
    expect(renderAutoReply('Hi {{ NAME }}!', '  ')).toBe('Hi there!')
    expect(renderAutoReply('Dear {{full_name}}', 'Priya Sharma')).toBe('Dear Priya Sharma')
    expect(renderAutoReply('Hi {{name}}', null)).toBe('Hi there')
  })

  it('picks away outside hours, otherwise welcome on the first message', () => {
    const s = settings({ welcome_enabled: true, away_enabled: true })
    const closed = ist(2026, 10, 19, 22)
    const open = ist(2026, 10, 19, 11)
    expect(pickAutoReply(s, { isFirstInboundMessage: true, now: closed })).toBe('away')
    expect(pickAutoReply(s, { isFirstInboundMessage: false, now: closed })).toBe('away')
    expect(pickAutoReply(s, { isFirstInboundMessage: true, now: open })).toBe('welcome')
    expect(pickAutoReply(s, { isFirstInboundMessage: false, now: open })).toBeNull()
  })

  it('does not send away when business hours are off', () => {
    const s = settings({ enabled: false, away_enabled: true })
    expect(pickAutoReply(s, { isFirstInboundMessage: false, now: ist(2026, 10, 19, 22) })).toBeNull()
  })

  it('falls back to welcome when away is disabled', () => {
    const s = settings({ welcome_enabled: true, away_enabled: false })
    expect(pickAutoReply(s, { isFirstInboundMessage: true, now: ist(2026, 10, 19, 22) })).toBe('welcome')
  })
})

describe('validateSettings / rowToSettings', () => {
  it('accepts the defaults', () => {
    expect(validateSettings(DEFAULT_SETTINGS).ok).toBe(true)
  })

  it('rejects bad times, dates, timezones and numbers', () => {
    const bad = (patch: Partial<BusinessHoursSettings>) => validateSettings({ ...DEFAULT_SETTINGS, ...patch })
    expect(bad({ timezone: 'Mars/Base' }).ok).toBe(false)
    expect(bad({ holidays: ['20-10-2026'] }).ok).toBe(false)
    expect(bad({ away_cooldown_hours: 0 }).ok).toBe(false)
    expect(bad({ sla_first_response_minutes: 5000 }).ok).toBe(false)
    expect(bad({ welcome_enabled: true, welcome_message: '  ' }).ok).toBe(false)
    const weekly = { ...DEFAULT_SETTINGS.weekly, mon: { open: true, start: '9am', end: '18:00' } }
    expect(bad({ weekly }).ok).toBe(false)
  })

  it('merges a partial database row onto the defaults', () => {
    const s = rowToSettings({
      enabled: true,
      timezone: 'UTC',
      weekly: { mon: { open: false, start: '10:00', end: '12:00' } },
      holidays: ['2026-12-25', 'nonsense', 42],
      sla_first_response_minutes: 30,
    })
    expect(s.enabled).toBe(true)
    expect(s.timezone).toBe('UTC')
    expect(s.weekly.mon).toEqual({ open: false, start: '10:00', end: '12:00' })
    expect(s.weekly.tue.open).toBe(true)
    expect(s.holidays).toEqual(['2026-12-25'])
    expect(s.sla_first_response_minutes).toBe(30)
    expect(s.away_cooldown_hours).toBe(DEFAULT_SETTINGS.away_cooldown_hours)
  })

  it('returns independent defaults for an empty row', () => {
    const a = rowToSettings(null)
    const day: DayKey = 'mon'
    a.weekly[day].open = false
    expect(DEFAULT_SETTINGS.weekly[day].open).toBe(true)
  })
})
