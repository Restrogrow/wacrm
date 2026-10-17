import { createHmac } from 'node:crypto'
import { describe, expect, it } from 'vitest'

import {
  attendeePhone,
  bookingContext,
  bookingFields,
  reminderDue,
  resolveCalComParams,
} from './events'
import { normalizeBookingHost, verifyCalComWebhook } from './verify'

const SECRET = 'whsec_test_secret_value'
const sign = (body: string, secret = SECRET) => createHmac('sha256', secret).update(body, 'utf8').digest('hex')

describe('verifyCalComWebhook', () => {
  const body = JSON.stringify({ triggerEvent: 'BOOKING_CREATED', payload: { uid: 'abc' } })

  it('accepts the correct signature', () => {
    expect(verifyCalComWebhook(body, sign(body), SECRET)).toBe(true)
  })
  it('accepts an upper-case hex signature', () => {
    expect(verifyCalComWebhook(body, sign(body).toUpperCase(), SECRET)).toBe(true)
  })
  it('rejects a signature made with another secret', () => {
    expect(verifyCalComWebhook(body, sign(body, 'other'), SECRET)).toBe(false)
  })
  it('rejects a tampered body', () => {
    expect(verifyCalComWebhook(body + ' ', sign(body), SECRET)).toBe(false)
  })
  it('rejects missing header, empty secret and wrong length', () => {
    expect(verifyCalComWebhook(body, null, SECRET)).toBe(false)
    expect(verifyCalComWebhook(body, sign(body), '')).toBe(false)
    expect(verifyCalComWebhook(body, 'abcd', SECRET)).toBe(false)
  })
})

describe('normalizeBookingHost', () => {
  it('normalises what merchants paste', () => {
    expect(normalizeBookingHost('cal.com')).toBe('https://cal.com')
    expect(normalizeBookingHost('https://cal.mycompany.com/team/x')).toBe('https://cal.mycompany.com')
    expect(normalizeBookingHost('http://localhost:3000')).toBeNull()
  })
  it('rejects junk and non-http schemes', () => {
    expect(normalizeBookingHost('javascript:alert(1)')).toBeNull()
    expect(normalizeBookingHost('not a url')).toBeNull()
    expect(normalizeBookingHost('')).toBeNull()
    expect(normalizeBookingHost(null)).toBeNull()
  })
})

const payload = {
  uid: 'bk_123',
  title: '30 Min Demo between Rahul and Priya',
  startTime: '2026-10-14T11:00:00.000Z',
  endTime: '2026-10-14T11:30:00.000Z',
  organizer: { name: 'Rahul', email: 'rahul@example.com', timeZone: 'Asia/Kolkata' },
  attendees: [{ name: 'Priya Sharma', email: 'priya@example.com', timeZone: 'Asia/Kolkata' }],
  responses: { attendeePhoneNumber: { value: '+91 98765 43210', label: 'Phone' } },
  videoCallData: { url: 'https://meet.google.com/abc-defg-hij' },
  location: 'integrations:google:meet',
}

describe('attendeePhone', () => {
  it('reads the standard phone response', () => {
    expect(attendeePhone(payload)).toBe('+91 98765 43210')
  })
  it('prefers a configured field name', () => {
    const p = { ...payload, responses: { ...payload.responses, mobile_no: { value: '99999 88888' } } }
    expect(attendeePhone(p, 'mobile_no')).toBe('99999 88888')
  })
  it('reads attendees[0].phoneNumber', () => {
    const p = { ...payload, responses: {}, attendees: [{ ...payload.attendees[0], phoneNumber: '+919876500000' }] }
    expect(attendeePhone(p)).toBe('+919876500000')
  })
  it('is null when there is no phone', () => {
    expect(attendeePhone({ ...payload, responses: {} })).toBeNull()
  })
})

describe('bookingFields and bookingContext', () => {
  it('maps a webhook payload to a booking row', () => {
    const f = bookingFields(payload)!
    expect(f.booking_uid).toBe('bk_123')
    expect(f.attendee_name).toBe('Priya Sharma')
    expect(f.host_name).toBe('Rahul')
    expect(f.phone).toBe('+91 98765 43210')
    expect(f.join_url).toBe('https://meet.google.com/abc-defg-hij')
    expect(f.location).toBe('Google Meet')
    expect(f.start_time).toBe('2026-10-14T11:00:00.000Z')
  })

  it('returns null without a uid or a valid start time', () => {
    expect(bookingFields({ ...payload, uid: '' })).toBeNull()
    expect(bookingFields({ ...payload, startTime: 'nope' })).toBeNull()
  })

  it('builds the template context with reschedule and cancel links on the configured host', () => {
    const ctx = bookingContext(bookingFields(payload)!, 'https://cal.mycompany.com')
    expect(ctx.attendee_name).toBe('Priya')
    expect(ctx.date_time).toMatch(/Oct/)
    expect(ctx.date_time).toMatch(/4:30/) // 11:00 UTC is 4:30 pm IST
    expect(ctx.reschedule_url).toBe('https://cal.mycompany.com/reschedule/bk_123')
    expect(ctx.cancel_url).toBe('https://cal.mycompany.com/booking/bk_123?cancel=true')
    expect(ctx.booking_page).toBe('https://cal.mycompany.com')
  })

  it('fills missing values with "-"', () => {
    const ctx = bookingContext({ ...bookingFields(payload)!, attendee_name: null }, 'https://cal.com')
    expect(resolveCalComParams(['attendee_name', 'event_name'], ctx)).toEqual(['-', '30 Min Demo between Rahul and Priya'])
  })
})

describe('reminderDue (shared with Calendly)', () => {
  const start = '2026-10-14T11:00:00.000Z'
  const now = Date.parse('2026-10-14T10:00:00.000Z') // 1 hour before
  it('is due within the window for a booking made well in advance', () => {
    expect(reminderDue(start, '2026-10-01T00:00:00.000Z', 60, now)).toBe(true)
  })
  it('is not due for a last-minute booking or a meeting that already started', () => {
    // Booked 30 minutes before the start: the confirmation just went out.
    expect(reminderDue(start, '2026-10-14T10:30:00.000Z', 60, now)).toBe(false)
    expect(reminderDue(start, '2026-10-01T00:00:00.000Z', 60, Date.parse('2026-10-14T11:05:00.000Z'))).toBe(false)
  })
})
