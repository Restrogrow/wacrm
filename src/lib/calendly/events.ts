// ============================================================
// Calendly bookings → WhatsApp templates — pure registry + payload
// helpers, no I/O.
//
// Webhook payloads are Calendly API v2 `InviteePayload` objects
// (invitee.created / invitee.canceled / invitee_no_show.created), with
// the meeting embedded as `scheduled_event`.
// https://developer.calendly.com/openapi/calendly-api.yaml
// ============================================================

export const CALENDLY_EVENTS = [
  'booking_confirmed',
  'booking_rescheduled',
  'reminder_24h',
  'reminder_1h',
  'booking_cancelled',
  'no_show',
] as const;

export type CalendlyEvent = (typeof CALENDLY_EVENTS)[number];

export function isCalendlyEvent(value: unknown): value is CalendlyEvent {
  return (
    typeof value === 'string' &&
    (CALENDLY_EVENTS as readonly string[]).includes(value)
  );
}

export const CALENDLY_EVENT_META: Record<
  CalendlyEvent,
  { label: string; description: string }
> = {
  booking_confirmed: {
    label: 'Booking confirmed',
    description:
      'As soon as someone books, with the date, time and meeting link.',
  },
  booking_rescheduled: {
    label: 'Booking rescheduled',
    description:
      'When the invitee moves the meeting, with the new date and time.',
  },
  reminder_24h: {
    label: 'Reminder — 24 hours before',
    description:
      'Sent a day ahead (skipped for meetings booked less than a day in advance).',
  },
  reminder_1h: {
    label: 'Reminder — 1 hour before',
    description:
      'Sent an hour ahead with the meeting link. The best way to cut no-shows.',
  },
  booking_cancelled: {
    label: 'Booking cancelled',
    description:
      'When the meeting is cancelled. Include the booking link so they can rebook.',
  },
  no_show: {
    label: 'No-show follow-up',
    description: 'When you mark the invitee as a no-show in Calendly.',
  },
};

/** Webhook events we subscribe to. */
export const CALENDLY_WEBHOOK_EVENTS = [
  'invitee.created',
  'invitee.canceled',
  'invitee_no_show.created',
] as const;

// ------------------------------------------------------------
// Template variables
// ------------------------------------------------------------

export interface BookingContext {
  invitee_name: string | null;
  invitee_full_name: string | null;
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

export type CalendlyVariable = keyof BookingContext;

export const CALENDLY_VARIABLES: {
  key: CalendlyVariable;
  label: string;
  example: string;
}[] = [
  { key: 'invitee_name', label: 'Invitee first name', example: 'Priya' },
  {
    key: 'invitee_full_name',
    label: 'Invitee full name',
    example: 'Priya Sharma',
  },
  { key: 'event_name', label: 'Meeting name', example: '30 Minute Demo' },
  { key: 'date', label: 'Date', example: 'Tue, 14 Oct' },
  { key: 'time', label: 'Time', example: '4:30 pm IST' },
  {
    key: 'date_time',
    label: 'Date and time',
    example: 'Tue, 14 Oct, 4:30 pm IST',
  },
  {
    key: 'meeting_link',
    label: 'Meeting link (or location)',
    example: 'https://meet.google.com/abc-defg-hij',
  },
  { key: 'location', label: 'Location', example: 'Google Meet' },
  { key: 'host_name', label: 'Host name', example: 'Rahul' },
  {
    key: 'reschedule_url',
    label: 'Reschedule link',
    example: 'https://calendly.com/reschedulings/abc',
  },
  {
    key: 'cancel_url',
    label: 'Cancel link',
    example: 'https://calendly.com/cancellations/abc',
  },
  {
    key: 'booking_page',
    label: 'Booking page (to rebook)',
    example: 'https://calendly.com/yourname',
  },
];

export function isCalendlyVariable(value: unknown): value is CalendlyVariable {
  return (
    typeof value === 'string' && CALENDLY_VARIABLES.some((v) => v.key === value)
  );
}

export const SAMPLE_BOOKING_CONTEXT: BookingContext = Object.fromEntries(
  CALENDLY_VARIABLES.map((v) => [v.key, v.example])
) as unknown as BookingContext;

/** Meta rejects empty text parameters, so a missing value becomes "-". */
export function resolveBookingParams(
  variables: CalendlyVariable[],
  ctx: BookingContext
): string[] {
  return variables.map((key) => {
    const value = ctx[key];
    return value && value.trim() ? value.trim() : '-';
  });
}

// ------------------------------------------------------------
// Payload helpers
// ------------------------------------------------------------

/* eslint-disable @typescript-eslint/no-explicit-any */
type Json = Record<string, any>;

function str(value: unknown): string | null {
  if (value === null || value === undefined) return null;
  const s = String(value).trim();
  return s ? s : null;
}

const PHONE_QUESTION_RE = /phone|mobile|whats\s*app|contact\s*(number|no)/i;

/**
 * The invitee's phone number, from (in order): the configured booking
 * question, the SMS-reminder number, any question mentioning phone /
 * mobile / WhatsApp, or the number given for an outbound phone call.
 */
export function inviteePhone(
  invitee: Json,
  phoneQuestion?: string | null
): string | null {
  const answers: { question?: string; answer?: string }[] = Array.isArray(
    invitee.questions_and_answers
  )
    ? invitee.questions_and_answers
    : [];
  if (phoneQuestion) {
    const exact = answers.find(
      (qa) => qa.question?.trim() === phoneQuestion.trim()
    );
    if (str(exact?.answer)) return str(exact?.answer);
  }
  if (str(invitee.text_reminder_number))
    return str(invitee.text_reminder_number);
  const byLabel = answers.find(
    (qa) => PHONE_QUESTION_RE.test(qa.question ?? '') && str(qa.answer)
  );
  if (byLabel) return str(byLabel.answer);
  const location = invitee.scheduled_event?.location;
  if (location?.type === 'outbound_call' && str(location.location))
    return str(location.location);
  return null;
}

const LOCATION_LABELS: Record<string, string> = {
  google_conference: 'Google Meet',
  zoom: 'Zoom',
  zoom_conference: 'Zoom',
  microsoft_teams_conference: 'Microsoft Teams',
  webex_conference: 'Webex',
  gotomeeting: 'GoTo Meeting',
  outbound_call: 'Phone call (we call you)',
  inbound_call: 'Phone call',
  physical: 'In person',
};

export function meetingLocation(event: Json): {
  link: string | null;
  label: string | null;
} {
  const loc = event?.location ?? {};
  const link = str(loc.join_url);
  const place = str(loc.location);
  const label =
    LOCATION_LABELS[String(loc.type ?? '')] ??
    (place && !/^\+?\d[\d\s-]+$/.test(place) ? place : null);
  return { link: link ?? (loc.type === 'physical' ? place : null), label };
}

function safeTimeZone(tz: string | null | undefined): string {
  if (tz) {
    try {
      new Intl.DateTimeFormat('en', { timeZone: tz });
      return tz;
    } catch {
      // fall through
    }
  }
  return 'Asia/Kolkata';
}

/** "Tue, 14 Oct", "4:30 pm IST" and both together, in the invitee's time zone. */
export function formatMeetingTime(
  startIso: string | null | undefined,
  timeZone: string | null | undefined
): { date: string | null; time: string | null; dateTime: string | null } {
  if (!startIso || Number.isNaN(Date.parse(startIso))) {
    return { date: null, time: null, dateTime: null };
  }
  const when = new Date(startIso);
  const tz = safeTimeZone(timeZone);
  const date = new Intl.DateTimeFormat('en-IN', {
    timeZone: tz,
    weekday: 'short',
    day: 'numeric',
    month: 'short',
  }).format(when);
  const time = new Intl.DateTimeFormat('en-IN', {
    timeZone: tz,
    hour: 'numeric',
    minute: '2-digit',
    timeZoneName: 'short',
  }).format(when);
  return { date, time, dateTime: `${date}, ${time}` };
}

export interface BookingFields {
  invitee_uri: string;
  event_uri: string | null;
  event_name: string | null;
  host_name: string | null;
  start_time: string;
  end_time: string | null;
  timezone: string | null;
  invitee_name: string | null;
  invitee_email: string | null;
  phone: string | null;
  join_url: string | null;
  location: string | null;
  cancel_url: string | null;
  reschedule_url: string | null;
}

/** Columns for calendly_bookings from an invitee payload, or null if it has no meeting time. */
export function bookingFields(
  invitee: Json,
  phoneQuestion?: string | null
): BookingFields | null {
  const event = invitee.scheduled_event ?? {};
  const start = str(event.start_time);
  const uri = str(invitee.uri);
  if (!start || !uri) return null;
  const where = meetingLocation(event);
  const host = Array.isArray(event.event_memberships)
    ? event.event_memberships[0]
    : null;
  return {
    invitee_uri: uri,
    event_uri: str(event.uri),
    event_name: str(event.name),
    host_name: str(host?.user_name),
    start_time: start,
    end_time: str(event.end_time),
    timezone: str(invitee.timezone),
    invitee_name: str(invitee.name),
    invitee_email: str(invitee.email),
    phone: inviteePhone(invitee, phoneQuestion),
    join_url: where.link,
    location: where.label,
    cancel_url: str(invitee.cancel_url),
    reschedule_url: str(invitee.reschedule_url),
  };
}

export function bookingContext(
  booking: Omit<BookingFields, 'invitee_uri'>,
  bookingPage: string | null
): BookingContext {
  const when = formatMeetingTime(booking.start_time, booking.timezone);
  const full = booking.invitee_name;
  return {
    invitee_name: full?.split(/\s+/)[0] ?? null,
    invitee_full_name: full,
    event_name: booking.event_name,
    date: when.date,
    time: when.time,
    date_time: when.dateTime,
    meeting_link: booking.join_url ?? booking.location,
    location: booking.location,
    host_name: booking.host_name,
    reschedule_url: booking.reschedule_url,
    cancel_url: booking.cancel_url,
    booking_page: bookingPage,
  };
}

// ------------------------------------------------------------
// Reminder timing
// ------------------------------------------------------------

/**
 * Is a reminder due now? Within `windowMinutes` of the start and not
 * started, and only if the meeting was booked comfortably before the
 * reminder point (a meeting booked 2 hours ahead gets no "24 hours
 * before" message — the confirmation just went out).
 */
export function reminderDue(
  startIso: string,
  bookedAtIso: string,
  windowMinutes: number,
  nowMs = Date.now()
): boolean {
  const start = Date.parse(startIso);
  const booked = Date.parse(bookedAtIso);
  if (Number.isNaN(start) || Number.isNaN(booked)) return false;
  const untilStart = start - nowMs;
  if (untilStart <= 0 || untilStart > windowMinutes * 60_000) return false;
  const leadMinutes = (start - booked) / 60_000;
  return leadMinutes > windowMinutes + Math.max(15, windowMinutes * 0.25);
}
