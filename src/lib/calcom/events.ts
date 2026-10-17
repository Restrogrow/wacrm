// ============================================================
// Cal.com bookings -> WhatsApp templates: pure registry + payload
// helpers, no I/O. Mirrors lib/calendly/events.ts (and reuses its meeting
// time formatting and reminder timing).
// ============================================================

import { formatMeetingTime } from '@/lib/calendly/events';

export { reminderDue } from '@/lib/calendly/events';

export const CALCOM_EVENTS = [
  'booking_confirmed',
  'booking_rescheduled',
  'reminder_24h',
  'reminder_1h',
  'booking_cancelled',
] as const;

export type CalComEvent = (typeof CALCOM_EVENTS)[number];

export function isCalComEvent(value: unknown): value is CalComEvent {
  return (
    typeof value === 'string' && (CALCOM_EVENTS as readonly string[]).includes(value)
  );
}

export const CALCOM_EVENT_META: Record<CalComEvent, { label: string; description: string }> = {
  booking_confirmed: {
    label: 'Booking confirmed',
    description: 'As soon as someone books, with the date, time and meeting link.',
  },
  booking_rescheduled: {
    label: 'Booking rescheduled',
    description: 'When the meeting is moved, with the new date and time.',
  },
  reminder_24h: {
    label: 'Reminder — 24 hours before',
    description: 'Sent a day ahead (skipped for meetings booked less than a day in advance).',
  },
  reminder_1h: {
    label: 'Reminder — 1 hour before',
    description: 'Sent an hour ahead with the meeting link. The best way to cut no-shows.',
  },
  booking_cancelled: {
    label: 'Booking cancelled',
    description: 'When the meeting is cancelled. Include the booking page so they can rebook.',
  },
};

// ------------------------------------------------------------
// Template variables
// ------------------------------------------------------------

export interface BookingContext {
  attendee_name: string | null;
  attendee_full_name: string | null;
  event_name: string | null;
  date: string | null;
  time: string | null;
  date_time: string | null;
  meeting_link: string | null;
  location: string | null;
  host_name: string | null;
  reschedule_url: string | null;
  cancel_url: string | null;
  booking_page: string | null;
}

export type CalComVariable = keyof BookingContext;

export const CALCOM_VARIABLES: { key: CalComVariable; label: string; example: string }[] = [
  { key: 'attendee_name', label: 'Attendee first name', example: 'Priya' },
  { key: 'attendee_full_name', label: 'Attendee full name', example: 'Priya Sharma' },
  { key: 'event_name', label: 'Meeting name', example: '30 Minute Demo' },
  { key: 'date', label: 'Date', example: 'Tue, 14 Oct' },
  { key: 'time', label: 'Time', example: '4:30 pm IST' },
  { key: 'date_time', label: 'Date and time', example: 'Tue, 14 Oct, 4:30 pm IST' },
  { key: 'meeting_link', label: 'Meeting link (or location)', example: 'https://meet.google.com/abc-defg-hij' },
  { key: 'location', label: 'Location', example: 'Google Meet' },
  { key: 'host_name', label: 'Host name', example: 'Rahul' },
  { key: 'reschedule_url', label: 'Reschedule link', example: 'https://cal.com/reschedule/abc123' },
  { key: 'cancel_url', label: 'Cancel link', example: 'https://cal.com/booking/abc123?cancel=true' },
  { key: 'booking_page', label: 'Booking page (to rebook)', example: 'https://cal.com/yourname' },
];

export function isCalComVariable(value: unknown): value is CalComVariable {
  return typeof value === 'string' && CALCOM_VARIABLES.some((v) => v.key === value);
}

export const CALCOM_SAMPLE_CONTEXT: BookingContext = Object.fromEntries(
  CALCOM_VARIABLES.map((v) => [v.key, v.example])
) as unknown as BookingContext;

/** Meta rejects empty text parameters, so a missing value becomes "-". */
export function resolveCalComParams(variables: CalComVariable[], ctx: BookingContext): string[] {
  return variables.map((key) => {
    const value = ctx[key];
    return value && value.trim() ? value.trim() : '-';
  });
}

// ------------------------------------------------------------
// Payload helpers (Cal.com webhook body: { triggerEvent, createdAt, payload })
// ------------------------------------------------------------

/* eslint-disable @typescript-eslint/no-explicit-any */
type Json = Record<string, any>;

function str(value: unknown): string | null {
  if (value === null || value === undefined) return null;
  const s = String(value).trim();
  return s ? s : null;
}

/** Cal.com stores form answers as responses.<field>.value (or a plain value). */
function responseValue(responses: Json | undefined, field: string): string | null {
  const entry = responses?.[field];
  if (entry === null || entry === undefined) return null;
  if (typeof entry === 'object') return str((entry as Json).value);
  return str(entry);
}

const PHONE_FIELDS = ['attendeePhoneNumber', 'phone', 'phoneNumber', 'mobile', 'whatsapp', 'smsReminderNumber'];

/** The attendee's phone: configured field, attendee.phoneNumber, then the standard fields. */
export function attendeePhone(payload: Json, phoneField?: string | null): string | null {
  const responses = payload.responses as Json | undefined;
  if (phoneField) {
    const configured = responseValue(responses, phoneField);
    if (configured) return configured;
  }
  const attendee = Array.isArray(payload.attendees) ? payload.attendees[0] : null;
  const direct = str(attendee?.phoneNumber);
  if (direct) return direct;
  for (const field of PHONE_FIELDS) {
    const v = responseValue(responses, field);
    if (v) return v;
  }
  return null;
}

export function bookingLink(payload: Json): string | null {
  return (
    str(payload.videoCallData?.url) ??
    str(payload.metadata?.videoCallUrl) ??
    (typeof payload.location === 'string' && /^https?:\/\//i.test(payload.location)
      ? payload.location
      : null)
  );
}

function locationLabel(payload: Json): string | null {
  const loc = str(payload.location);
  if (!loc) return null;
  if (/^https?:\/\//i.test(loc)) {
    if (/meet\.google/i.test(loc)) return 'Google Meet';
    if (/zoom\./i.test(loc)) return 'Zoom';
    if (/teams\.microsoft/i.test(loc)) return 'Microsoft Teams';
    return null;
  }
  // "integrations:google:meet" style ids -> a readable label
  const m = /^integrations:(.+)$/.exec(loc);
  if (m) return m[1].split(':').map((p) => p.charAt(0).toUpperCase() + p.slice(1)).join(' ');
  return loc;
}

export interface BookingFields {
  booking_uid: string;
  event_name: string | null;
  host_name: string | null;
  start_time: string;
  end_time: string | null;
  timezone: string | null;
  attendee_name: string | null;
  attendee_email: string | null;
  phone: string | null;
  join_url: string | null;
  location: string | null;
}

/** Columns for calcom_bookings from a webhook payload, or null if it lacks a uid / start time. */
export function bookingFields(payload: Json, phoneField?: string | null): BookingFields | null {
  const uid = str(payload.uid);
  const start = str(payload.startTime);
  if (!uid || !start || Number.isNaN(Date.parse(start))) return null;
  const attendee = Array.isArray(payload.attendees) ? payload.attendees[0] : null;
  return {
    booking_uid: uid,
    event_name: str(payload.title) ?? str(payload.eventTitle) ?? str(payload.type),
    host_name: str(payload.organizer?.name),
    start_time: new Date(start).toISOString(),
    end_time: str(payload.endTime) && !Number.isNaN(Date.parse(payload.endTime)) ? new Date(payload.endTime).toISOString() : null,
    // Show times in the attendee's own zone.
    timezone: str(attendee?.timeZone) ?? str(payload.organizer?.timeZone),
    attendee_name: str(attendee?.name),
    attendee_email: str(attendee?.email),
    phone: attendeePhone(payload, phoneField),
    join_url: bookingLink(payload),
    location: locationLabel(payload),
  };
}

export function bookingContext(
  booking: Omit<BookingFields, 'booking_uid'> & { booking_uid?: string },
  host: string
): BookingContext {
  const when = formatMeetingTime(booking.start_time, booking.timezone);
  const full = booking.attendee_name;
  const uid = booking.booking_uid ? encodeURIComponent(booking.booking_uid) : null;
  return {
    attendee_name: full?.split(/\s+/)[0] ?? null,
    attendee_full_name: full,
    event_name: booking.event_name,
    date: when.date,
    time: when.time,
    date_time: when.dateTime,
    meeting_link: booking.join_url ?? booking.location,
    location: booking.location,
    host_name: booking.host_name,
    reschedule_url: uid ? `${host}/reschedule/${uid}` : null,
    cancel_url: uid ? `${host}/booking/${uid}?cancel=true` : null,
    booking_page: host,
  };
}
