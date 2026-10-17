// ============================================================
// Business hours + SLA maths (pure, no I/O).
//
// Settings live in `business_hours_settings` (migration 066). Local
// times are worked out in the account's IANA timezone with Intl, so
// no date library is needed.
//
// Conventions
//   - weekly[day] = { open, start: "HH:MM", end: "HH:MM" }.
//   - start < end        : a normal same-day shift.
//   - start > end        : an overnight shift (runs past midnight).
//   - start = end        : open all day (24h).
//   - holidays           : "YYYY-MM-DD" dates the business is closed
//                          the whole day (the day a shift starts).
//   - enabled = false    : always open.
// ============================================================

export const DAY_KEYS = ['sun', 'mon', 'tue', 'wed', 'thu', 'fri', 'sat'] as const;
export type DayKey = (typeof DAY_KEYS)[number];

export const DAY_LABELS: Record<DayKey, string> = {
  sun: 'Sunday',
  mon: 'Monday',
  tue: 'Tuesday',
  wed: 'Wednesday',
  thu: 'Thursday',
  fri: 'Friday',
  sat: 'Saturday',
};

export interface DayHours {
  open: boolean;
  /** "HH:MM", 24 hour clock. */
  start: string;
  end: string;
}

export type WeeklyHours = Record<DayKey, DayHours>;

export interface BusinessHoursSettings {
  enabled: boolean;
  timezone: string;
  weekly: WeeklyHours;
  holidays: string[];
  welcome_enabled: boolean;
  welcome_message: string;
  away_enabled: boolean;
  away_message: string;
  away_cooldown_hours: number;
  sla_enabled: boolean;
  sla_first_response_minutes: number;
  sla_business_hours_only: boolean;
}

export const DEFAULT_TIMEZONE = 'Asia/Kolkata';

const weekday = (open: boolean): DayHours => ({ open, start: '09:00', end: '18:00' });

export const DEFAULT_SETTINGS: BusinessHoursSettings = {
  enabled: false,
  timezone: DEFAULT_TIMEZONE,
  weekly: {
    sun: weekday(false),
    mon: weekday(true),
    tue: weekday(true),
    wed: weekday(true),
    thu: weekday(true),
    fri: weekday(true),
    sat: weekday(false),
  },
  holidays: [],
  welcome_enabled: false,
  welcome_message: 'Hi {{name}}, thanks for contacting us! A teammate will reply shortly.',
  away_enabled: false,
  away_message:
    'Hi {{name}}, we are away right now. We received your message and will reply when we are back.',
  away_cooldown_hours: 12,
  sla_enabled: false,
  sla_first_response_minutes: 15,
  sla_business_hours_only: false,
};

export const TIME_RE = /^([01]\d|2[0-3]):([0-5]\d)$/;
export const DATE_RE = /^\d{4}-(0[1-9]|1[0-2])-(0[1-9]|[12]\d|3[01])$/;

export function isValidTimezone(tz: string): boolean {
  try {
    new Intl.DateTimeFormat('en-US', { timeZone: tz });
    return true;
  } catch {
    return false;
  }
}

/** "HH:MM" -> minutes since midnight, or null when malformed. */
export function toMinutes(time: string): number | null {
  const m = TIME_RE.exec(time);
  return m ? Number(m[1]) * 60 + Number(m[2]) : null;
}

// ------------------------------------------------------------
// Timezone helpers
// ------------------------------------------------------------

interface LocalParts {
  /** Days since 1970-01-01 on the local calendar. */
  dayIndex: number;
  /** Minutes since local midnight. */
  minutes: number;
  day: DayKey;
  /** "YYYY-MM-DD" on the local calendar. */
  date: string;
}

function safeTimezone(tz: string): string {
  return isValidTimezone(tz) ? tz : DEFAULT_TIMEZONE;
}

/**
 * Local wall-clock reading of `instant` in `tz`, plus the offset (in
 * minutes) from UTC at that moment.
 */
function zoned(instant: Date, tz: string): LocalParts & { offsetMin: number } {
  const fmt = new Intl.DateTimeFormat('en-US', {
    timeZone: safeTimezone(tz),
    hourCycle: 'h23',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
  });
  const p: Record<string, string> = {};
  for (const part of fmt.formatToParts(instant)) p[part.type] = part.value;
  const y = Number(p.year);
  const mo = Number(p.month);
  const d = Number(p.day);
  const h = Number(p.hour) % 24;
  const mi = Number(p.minute);
  const localAsUtc = Date.UTC(y, mo - 1, d, h, mi);
  const wholeMinuteUtc = Math.floor(instant.getTime() / 60000) * 60000;
  const dayIndex = Math.floor(localAsUtc / 86400000);
  return {
    dayIndex,
    minutes: h * 60 + mi,
    day: DAY_KEYS[new Date(localAsUtc).getUTCDay()],
    date: `${p.year}-${p.month}-${p.day}`,
    offsetMin: Math.round((localAsUtc - wholeMinuteUtc) / 60000),
  };
}

function dateOfIndex(dayIndex: number): string {
  return new Date(dayIndex * 86400000).toISOString().slice(0, 10);
}

function dayOfIndex(dayIndex: number): DayKey {
  return DAY_KEYS[new Date(dayIndex * 86400000).getUTCDay()];
}

/**
 * The minute ranges, relative to local midnight of the day a shift
 * starts, during which the business is open. An overnight shift
 * returns an end past 1440.
 */
function shiftFor(settings: BusinessHoursSettings, dayIndex: number): [number, number] | null {
  const dh = settings.weekly[dayOfIndex(dayIndex)];
  if (!dh || !dh.open) return null;
  if (settings.holidays.includes(dateOfIndex(dayIndex))) return null;
  const start = toMinutes(dh.start);
  const end = toMinutes(dh.end);
  if (start === null || end === null) return null;
  if (start === end) return [0, 1440];
  if (start < end) return [start, end];
  return [start, 1440 + end];
}

// ------------------------------------------------------------
// Public API
// ------------------------------------------------------------

/** Is the business open at `now`? Always true when hours are disabled. */
export function isOpenNow(settings: BusinessHoursSettings, now: Date = new Date()): boolean {
  if (!settings.enabled) return true;
  const local = zoned(now, settings.timezone);

  const today = shiftFor(settings, local.dayIndex);
  if (today && local.minutes >= today[0] && local.minutes < Math.min(today[1], 1440)) {
    return true;
  }
  // The tail of yesterday's overnight shift.
  const yesterday = shiftFor(settings, local.dayIndex - 1);
  if (yesterday && yesterday[1] > 1440 && local.minutes < yesterday[1] - 1440) {
    return true;
  }
  return false;
}

/** Longest stretch we will walk when counting business minutes. */
const MAX_RANGE_DAYS = 62;

/**
 * Minutes between `from` and `to` that fall inside business hours
 * (wall-clock minutes when hours are disabled). Negative ranges are 0.
 */
export function businessMinutesBetween(
  settings: BusinessHoursSettings,
  from: Date,
  to: Date,
): number {
  if (to <= from) return 0;
  const wall = (to.getTime() - from.getTime()) / 60000;
  if (!settings.enabled) return wall;

  // Work on a local-time minute line so days are simple 1440 blocks.
  const a = zoned(from, settings.timezone);
  const b = zoned(to, settings.timezone);
  const fromLocal = Math.floor(from.getTime() / 60000) + a.offsetMin;
  const toLocal = Math.floor(to.getTime() / 60000) + b.offsetMin;
  if (toLocal <= fromLocal) return 0;

  const firstDay = Math.max(a.dayIndex - 1, b.dayIndex - MAX_RANGE_DAYS);
  let total = 0;
  for (let day = firstDay; day <= b.dayIndex; day++) {
    const shift = shiftFor(settings, day);
    if (!shift) continue;
    const start = day * 1440 + shift[0];
    const end = day * 1440 + shift[1];
    const overlap = Math.min(end, toLocal) - Math.max(start, fromLocal);
    if (overlap > 0) total += overlap;
  }
  return total;
}

/**
 * Has a customer waited longer than the first-response target?
 * `waitingSince` is the customer message that started the wait.
 */
export function isSlaBreached(
  settings: BusinessHoursSettings,
  waitingSince: Date,
  now: Date = new Date(),
): boolean {
  if (!settings.sla_enabled) return false;
  const waited =
    settings.sla_business_hours_only && settings.enabled
      ? businessMinutesBetween(settings, waitingSince, now)
      : (now.getTime() - waitingSince.getTime()) / 60000;
  return waited >= settings.sla_first_response_minutes;
}

// ------------------------------------------------------------
// Auto-reply text
// ------------------------------------------------------------

/** Fills {{name}} (first name) and {{full_name}}; falls back to "there". */
export function renderAutoReply(template: string, contactName: string | null | undefined): string {
  const full = (contactName ?? '').trim();
  const first = full.split(/\s+/)[0] || 'there';
  return template
    .replace(/\{\{\s*name\s*\}\}/gi, first)
    .replace(/\{\{\s*full_name\s*\}\}/gi, full || 'there')
    .trim();
}

/** Which auto-reply (if any) to send for an inbound message. */
export function pickAutoReply(
  settings: BusinessHoursSettings,
  opts: { isFirstInboundMessage: boolean; now?: Date },
): 'welcome' | 'away' | null {
  const open = isOpenNow(settings, opts.now);
  if (!open && settings.enabled && settings.away_enabled) return 'away';
  if (opts.isFirstInboundMessage && settings.welcome_enabled) return 'welcome';
  return null;
}

// ------------------------------------------------------------
// Validation (used by the settings form before saving)
// ------------------------------------------------------------

export function validateSettings(
  s: BusinessHoursSettings,
): { ok: true } | { ok: false; error: string } {
  if (!isValidTimezone(s.timezone)) return { ok: false, error: 'Pick a valid timezone.' };
  for (const day of DAY_KEYS) {
    const dh = s.weekly[day];
    if (!dh || toMinutes(dh.start) === null || toMinutes(dh.end) === null) {
      return { ok: false, error: `${DAY_LABELS[day]}: use times like 09:00.` };
    }
  }
  for (const h of s.holidays) {
    if (!DATE_RE.test(h)) return { ok: false, error: `Holiday "${h}" must look like 2026-10-20.` };
  }
  if (s.welcome_message.length > 1000 || s.away_message.length > 1000) {
    return { ok: false, error: 'Messages can be at most 1000 characters.' };
  }
  if (s.welcome_enabled && !s.welcome_message.trim()) {
    return { ok: false, error: 'Write the welcome message or switch it off.' };
  }
  if (s.away_enabled && !s.away_message.trim()) {
    return { ok: false, error: 'Write the away message or switch it off.' };
  }
  if (!Number.isInteger(s.away_cooldown_hours) || s.away_cooldown_hours < 1 || s.away_cooldown_hours > 168) {
    return { ok: false, error: 'Away cooldown must be 1 to 168 hours.' };
  }
  if (
    !Number.isInteger(s.sla_first_response_minutes) ||
    s.sla_first_response_minutes < 1 ||
    s.sla_first_response_minutes > 1440
  ) {
    return { ok: false, error: 'The reply target must be 1 to 1440 minutes.' };
  }
  return { ok: true };
}

function cloneWeekly(weekly: WeeklyHours): WeeklyHours {
  const out = {} as WeeklyHours;
  for (const day of DAY_KEYS) out[day] = { ...weekly[day] };
  return out;
}

/** Merge a database row (any missing/odd fields) onto the defaults. */
export function rowToSettings(row: Record<string, unknown> | null | undefined): BusinessHoursSettings {
  if (!row) {
    return { ...DEFAULT_SETTINGS, weekly: cloneWeekly(DEFAULT_SETTINGS.weekly), holidays: [] };
  }
  const weekly = cloneWeekly(DEFAULT_SETTINGS.weekly);
  const rawWeekly = (row.weekly ?? {}) as Partial<Record<DayKey, Partial<DayHours>>>;
  for (const day of DAY_KEYS) {
    const r = rawWeekly[day];
    if (r) {
      weekly[day] = {
        open: r.open === true,
        start: typeof r.start === 'string' ? r.start : weekly[day].start,
        end: typeof r.end === 'string' ? r.end : weekly[day].end,
      };
    }
  }
  const holidays = Array.isArray(row.holidays)
    ? (row.holidays as unknown[]).filter((h): h is string => typeof h === 'string' && DATE_RE.test(h))
    : [];
  const num = (v: unknown, fallback: number) => (typeof v === 'number' && Number.isFinite(v) ? v : fallback);
  return {
    enabled: row.enabled === true,
    timezone: typeof row.timezone === 'string' ? row.timezone : DEFAULT_TIMEZONE,
    weekly,
    holidays,
    welcome_enabled: row.welcome_enabled === true,
    welcome_message:
      typeof row.welcome_message === 'string' ? row.welcome_message : DEFAULT_SETTINGS.welcome_message,
    away_enabled: row.away_enabled === true,
    away_message: typeof row.away_message === 'string' ? row.away_message : DEFAULT_SETTINGS.away_message,
    away_cooldown_hours: num(row.away_cooldown_hours, DEFAULT_SETTINGS.away_cooldown_hours),
    sla_enabled: row.sla_enabled === true,
    sla_first_response_minutes: num(row.sla_first_response_minutes, DEFAULT_SETTINGS.sla_first_response_minutes),
    sla_business_hours_only: row.sla_business_hours_only === true,
  };
}
