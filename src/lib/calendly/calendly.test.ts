import { createHmac } from 'node:crypto';
import { describe, expect, it } from 'vitest';

import {
  bookingContext,
  bookingFields,
  formatMeetingTime,
  inviteePhone,
  meetingLocation,
  reminderDue,
  resolveBookingParams,
} from './events';
import { verifyCalendlySignature } from './verify';

const INVITEE = {
  uri: 'https://api.calendly.com/scheduled_events/E1/invitees/I1',
  name: 'Priya Sharma',
  email: 'priya@example.com',
  timezone: 'Asia/Kolkata',
  text_reminder_number: null,
  cancel_url: 'https://calendly.com/cancellations/I1',
  reschedule_url: 'https://calendly.com/reschedulings/I1',
  questions_and_answers: [
    { question: 'Company', answer: 'Acme', position: 0 },
    { question: 'WhatsApp number', answer: '98765 43210', position: 1 },
  ],
  scheduled_event: {
    uri: 'https://api.calendly.com/scheduled_events/E1',
    name: '30 Minute Demo',
    start_time: '2026-10-14T11:00:00.000000Z',
    end_time: '2026-10-14T11:30:00.000000Z',
    location: {
      type: 'google_conference',
      join_url: 'https://meet.google.com/abc-defg-hij',
    },
    event_memberships: [{ user_name: 'Rahul Verma' }],
  },
};

describe('inviteePhone', () => {
  it('prefers the configured question, then SMS number, then a phone-like question', () => {
    expect(inviteePhone(INVITEE, 'Company')).toBe('Acme');
    expect(
      inviteePhone({ ...INVITEE, text_reminder_number: '+91 90000 00000' })
    ).toBe('+91 90000 00000');
    expect(inviteePhone(INVITEE)).toBe('98765 43210');
  });

  it('falls back to the outbound-call number', () => {
    expect(
      inviteePhone({
        questions_and_answers: [],
        scheduled_event: {
          location: { type: 'outbound_call', location: '+919876543210' },
        },
      })
    ).toBe('+919876543210');
    expect(inviteePhone({ questions_and_answers: [] })).toBeNull();
  });
});

describe('booking fields and context', () => {
  it('extracts the booking', () => {
    const b = bookingFields(INVITEE)!;
    expect(b.event_name).toBe('30 Minute Demo');
    expect(b.host_name).toBe('Rahul Verma');
    expect(b.join_url).toBe('https://meet.google.com/abc-defg-hij');
    expect(b.location).toBe('Google Meet');
    expect(b.phone).toBe('98765 43210');
  });

  it('returns null without a meeting time', () => {
    expect(bookingFields({ uri: 'x', scheduled_event: {} })).toBeNull();
  });

  it("formats in the invitee's time zone", () => {
    const t = formatMeetingTime('2026-10-14T11:00:00Z', 'Asia/Kolkata');
    expect(t.date).toMatch(/14 Oct/);
    expect(t.time).toMatch(/4:30/);
    expect(formatMeetingTime(null, 'Asia/Kolkata').date).toBeNull();
    // Unknown zones fall back to IST rather than throwing.
    expect(formatMeetingTime('2026-10-14T11:00:00Z', 'Mars/Base').time).toMatch(
      /4:30/
    );
  });

  it('builds template params', () => {
    const ctx = bookingContext(
      bookingFields(INVITEE)!,
      'https://calendly.com/rahul'
    );
    expect(ctx.invitee_name).toBe('Priya');
    expect(ctx.meeting_link).toBe('https://meet.google.com/abc-defg-hij');
    expect(
      resolveBookingParams(['invitee_name', 'event_name', 'host_name'], ctx)
    ).toEqual(['Priya', '30 Minute Demo', 'Rahul Verma']);
    expect(
      resolveBookingParams(['cancel_url'], { ...ctx, cancel_url: null })
    ).toEqual(['-']);
  });

  it('labels physical locations and keeps their address as the link', () => {
    expect(
      meetingLocation({
        location: { type: 'physical', location: 'MG Road, Pune' },
      })
    ).toEqual({
      link: 'MG Road, Pune',
      label: 'In person',
    });
  });
});

describe('verifyCalendlySignature', () => {
  const key = 'signing-key';
  const body = JSON.stringify({ event: 'invitee.created' });
  const now = 1_760_000_000_000;
  const t = Math.floor(now / 1000);
  const sig = createHmac('sha256', key).update(`${t}.${body}`).digest('hex');

  it('accepts a fresh, correct signature', () => {
    expect(verifyCalendlySignature(body, `t=${t},v1=${sig}`, key, now)).toBe(
      true
    );
  });

  it('rejects tampering, wrong keys, stale timestamps and junk', () => {
    expect(
      verifyCalendlySignature(body + ' ', `t=${t},v1=${sig}`, key, now)
    ).toBe(false);
    expect(
      verifyCalendlySignature(body, `t=${t},v1=${sig}`, 'other', now)
    ).toBe(false);
    expect(
      verifyCalendlySignature(body, `t=${t},v1=${sig}`, key, now + 10 * 60_000)
    ).toBe(false);
    expect(verifyCalendlySignature(body, 'garbage', key, now)).toBe(false);
    expect(verifyCalendlySignature(body, null, key, now)).toBe(false);
  });
});

describe('reminderDue', () => {
  const now = Date.parse('2026-10-14T10:00:00Z');

  it('sends the 1-hour reminder inside the window when booked well ahead', () => {
    expect(
      reminderDue('2026-10-14T10:45:00Z', '2026-10-10T10:00:00Z', 60, now)
    ).toBe(true);
    expect(
      reminderDue('2026-10-14T11:30:00Z', '2026-10-10T10:00:00Z', 60, now)
    ).toBe(false);
    expect(
      reminderDue('2026-10-14T09:59:00Z', '2026-10-10T10:00:00Z', 60, now)
    ).toBe(false);
  });

  it('skips reminders for last-minute bookings', () => {
    // Booked 70 minutes before the meeting: no "1 hour before" message.
    expect(
      reminderDue('2026-10-14T10:45:00Z', '2026-10-14T09:35:00Z', 60, now)
    ).toBe(false);
    // Booked 3 hours ahead: no "24 hours before" message.
    expect(
      reminderDue('2026-10-14T13:00:00Z', '2026-10-14T10:00:00Z', 1440, now)
    ).toBe(false);
  });
});
