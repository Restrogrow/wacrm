// ============================================================
// Journeys — pure logic (no I/O): date maths, quiet hours, frequency
// caps, exit conditions, step scheduling, variable rendering and input
// validation. Shared by the cron processor, the API routes and the UI.
// ============================================================

export type JourneyKind = 'date' | 'drip' | 'winback';
export type JourneyStatus = 'draft' | 'active' | 'paused';

export interface Ymd {
  y: number;
  m: number;
  d: number;
}

/** A parsed date whose year may be unknown (a birthday written "15/08"). */
export interface LooseYmd {
  y: number | null;
  m: number;
  d: number;
}

export const TIME_RE = /^([01]\d|2[0-3]):([0-5]\d)$/;
const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
export const DEFAULT_TIMEZONE = 'Asia/Kolkata';

// ------------------------------------------------------------
// Calendar maths (proleptic Gregorian, no time zones)
// ------------------------------------------------------------

export function isLeap(y: number): boolean {
  return (y % 4 === 0 && y % 100 !== 0) || y % 400 === 0;
}

export function daysInMonth(y: number, m: number): number {
  return [31, isLeap(y) ? 29 : 28, 31, 30, 31, 30, 31, 31, 30, 31, 30, 31][m - 1];
}

export function dayIndex(v: Ymd): number {
  return Math.floor(Date.UTC(v.y, v.m - 1, v.d) / 86_400_000);
}

export function fromDayIndex(i: number): Ymd {
  const dt = new Date(i * 86_400_000);
  return { y: dt.getUTCFullYear(), m: dt.getUTCMonth() + 1, d: dt.getUTCDate() };
}

export function addDays(v: Ymd, n: number): Ymd {
  return fromDayIndex(dayIndex(v) + n);
}

export function ymdString(v: Ymd): string {
  const p = (n: number, w = 2) => String(n).padStart(w, '0');
  return `${p(v.y, 4)}-${p(v.m)}-${p(v.d)}`;
}

const MONTHS: Record<string, number> = {
  jan: 1, feb: 2, mar: 3, apr: 4, may: 5, jun: 6,
  jul: 7, aug: 8, sep: 9, oct: 10, nov: 11, dec: 12,
};

function validMonthDay(m: number, d: number, y: number | null): boolean {
  if (!Number.isInteger(m) || !Number.isInteger(d) || m < 1 || m > 12 || d < 1) return false;
  // A year-less date may be Feb 29.
  return d <= daysInMonth(y ?? 2000, m);
}

/**
 * Read a date the way people type it into a custom field: ISO
 * (2026-08-15), Indian day-first (15/08/1990, 15-08-1990), day-month
 * without a year (15/08) and "15 Aug 1990" / "Aug 15, 1990".
 * Returns null for anything else, including impossible dates.
 */
export function parseFlexibleDate(raw: string | null | undefined): LooseYmd | null {
  const s = (raw ?? '').trim();
  if (!s) return null;

  let m = /^(\d{4})-(\d{1,2})-(\d{1,2})(?:[T\s].*)?$/.exec(s);
  if (m) {
    const [y, mo, d] = [Number(m[1]), Number(m[2]), Number(m[3])];
    return validMonthDay(mo, d, y) ? { y, m: mo, d } : null;
  }

  m = /^(\d{1,2})[/\-.](\d{1,2})[/\-.](\d{4})$/.exec(s);
  if (m) {
    const [d, mo, y] = [Number(m[1]), Number(m[2]), Number(m[3])];
    return validMonthDay(mo, d, y) ? { y, m: mo, d } : null;
  }

  m = /^(\d{1,2})[/\-.](\d{1,2})$/.exec(s);
  if (m) {
    const [d, mo] = [Number(m[1]), Number(m[2])];
    return validMonthDay(mo, d, null) ? { y: null, m: mo, d } : null;
  }

  m = /^(\d{1,2})\s+([A-Za-z]{3,9})\.?,?\s*(\d{4})?$/.exec(s);
  if (m) {
    const mo = MONTHS[m[2].slice(0, 3).toLowerCase()];
    const y = m[3] ? Number(m[3]) : null;
    const d = Number(m[1]);
    return mo && validMonthDay(mo, d, y) ? { y, m: mo, d } : null;
  }

  m = /^([A-Za-z]{3,9})\.?\s+(\d{1,2}),?\s*(\d{4})?$/.exec(s);
  if (m) {
    const mo = MONTHS[m[1].slice(0, 3).toLowerCase()];
    const y = m[3] ? Number(m[3]) : null;
    const d = Number(m[2]);
    return mo && validMonthDay(mo, d, y) ? { y, m: mo, d } : null;
  }
  return null;
}

/** The event's date in a given year; Feb 29 falls on Feb 28 in non-leap years. */
export function eventDateInYear(date: LooseYmd, year: number): Ymd {
  const d = date.m === 2 && date.d === 29 && !isLeap(year) ? 28 : date.d;
  return { y: year, m: date.m, d };
}

export type Recurrence = 'yearly' | 'once';

/**
 * Does `today` (the account's local date) fall on the send date for this
 * contact's event? Returns the occurrence key ("2026" for the 2026
 * occurrence, or "once") or null.
 *
 *  - yearly: the event repeats every year. When the date has a known
 *    year, only later years count (a 2026 "added on" date does not fire
 *    on the day itself, and a 1990 birthday never fires in 1989).
 *    The key is the year of the EVENT, so "day before birthday" on
 *    31 Dec 2026 is the 2027 occurrence.
 *  - once: a single fixed date; needs a year.
 */
export function dueOccurrence(args: {
  date: LooseYmd;
  recurrence: Recurrence;
  offsetDays: number;
  today: Ymd;
}): string | null {
  const { date, recurrence, offsetDays, today } = args;
  const todayIdx = dayIndex(today);

  if (recurrence === 'once') {
    if (date.y === null) return null;
    const ev = { y: date.y, m: date.m, d: date.d };
    return dayIndex(addDays(ev, offsetDays)) === todayIdx ? 'once' : null;
  }

  // The offset is at most a year, so the event is in the previous, this
  // or the next calendar year.
  for (const year of [today.y - 1, today.y, today.y + 1]) {
    if (date.y !== null && year <= date.y) continue;
    const ev = eventDateInYear(date, year);
    if (dayIndex(addDays(ev, offsetDays)) === todayIdx) return String(year);
  }
  return null;
}

// ------------------------------------------------------------
// Time zones
// ------------------------------------------------------------

export function isValidTimezone(tz: string): boolean {
  try {
    new Intl.DateTimeFormat('en-US', { timeZone: tz });
    return true;
  } catch {
    return false;
  }
}

function safeTz(tz: string): string {
  return isValidTimezone(tz) ? tz : DEFAULT_TIMEZONE;
}

/** Offset (minutes east of UTC) of `tz` at the given instant. */
export function tzOffsetMinutes(instantMs: number, tz: string): number {
  const fmt = new Intl.DateTimeFormat('en-US', {
    timeZone: safeTz(tz),
    hourCycle: 'h23',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
  });
  const p: Record<string, string> = {};
  for (const part of fmt.formatToParts(new Date(instantMs))) p[part.type] = part.value;
  const localAsUtc = Date.UTC(
    Number(p.year),
    Number(p.month) - 1,
    Number(p.day),
    Number(p.hour) % 24,
    Number(p.minute),
  );
  return Math.round((localAsUtc - Math.floor(instantMs / 60_000) * 60_000) / 60_000);
}

/** The local calendar date and minutes-since-midnight of `now` in `tz`. */
export function localNow(now: Date, tz: string): { date: Ymd; minutes: number } {
  const off = tzOffsetMinutes(now.getTime(), tz);
  const local = new Date(Math.floor(now.getTime() / 60_000) * 60_000 + off * 60_000);
  return {
    date: { y: local.getUTCFullYear(), m: local.getUTCMonth() + 1, d: local.getUTCDate() },
    minutes: local.getUTCHours() * 60 + local.getUTCMinutes(),
  };
}

export function toMinutes(time: string): number | null {
  const m = TIME_RE.exec(time);
  return m ? Number(m[1]) * 60 + Number(m[2]) : null;
}

/** The UTC instant of local wall-clock `hhmm` on local date `ymd` in `tz`. */
export function localToUtc(ymd: Ymd, hhmm: string, tz: string): Date {
  const mins = toMinutes(hhmm) ?? 0;
  const naive = Date.UTC(ymd.y, ymd.m - 1, ymd.d, Math.floor(mins / 60), mins % 60);
  // Two passes settle the offset across a DST change.
  let guess = naive - tzOffsetMinutes(naive, tz) * 60_000;
  guess = naive - tzOffsetMinutes(guess, tz) * 60_000;
  return new Date(guess);
}

/** Start of the local day containing `now`, as a UTC instant. */
export function startOfLocalDay(now: Date, tz: string): Date {
  return localToUtc(localNow(now, tz).date, '00:00', tz);
}

/**
 * Are we inside the quiet window? Handles overnight windows (21:00 to
 * 09:00). start === end means "no quiet hours".
 */
export function isQuietHours(now: Date, tz: string, start: string, end: string): boolean {
  const s = toMinutes(start);
  const e = toMinutes(end);
  if (s === null || e === null || s === e) return false;
  const { minutes } = localNow(now, tz);
  return s < e ? minutes >= s && minutes < e : minutes >= s || minutes < e;
}

// ------------------------------------------------------------
// Caps, exits, step scheduling
// ------------------------------------------------------------

/**
 * One journey message per contact per `cooldownHours`, across all
 * journeys. `lastSent` are the contact's recent sent timestamps.
 */
export function frequencyCapBlocked(
  lastSent: Array<string | null | undefined>,
  now: Date,
  cooldownHours: number,
): boolean {
  if (cooldownHours <= 0) return false;
  const since = now.getTime() - cooldownHours * 3_600_000;
  return lastSent.some((t) => {
    if (!t) return false;
    const ms = Date.parse(t);
    return Number.isFinite(ms) && ms > since;
  });
}

export type ExitReason = 'opted_out' | 'replied' | 'tag_added';

/** Why an enrollment should stop before sending its next step (priority order). */
export function evaluateExit(args: {
  optedOut: boolean;
  onReply: boolean;
  repliedSinceEnroll: boolean;
  exitTagId: string | null;
  hasExitTag: boolean;
}): ExitReason | null {
  if (args.optedOut) return 'opted_out';
  if (args.onReply && args.repliedSinceEnroll) return 'replied';
  if (args.exitTagId && args.hasExitTag) return 'tag_added';
  return null;
}

export interface StepTiming {
  delay_minutes: number;
}

/** After step `currentIndex` was handled: the next step and when it is due, or done. */
export function nextAfterStep(
  steps: StepTiming[],
  currentIndex: number,
  now: Date,
): { done: true } | { done: false; nextIndex: number; nextRunAt: Date } {
  const nextIndex = currentIndex + 1;
  if (nextIndex >= steps.length) return { done: true };
  const delay = Math.max(0, steps[nextIndex].delay_minutes);
  return { done: false, nextIndex, nextRunAt: new Date(now.getTime() + delay * 60_000) };
}

/** Monthly journey message cap by effective plan (null = unlimited). */
export function monthlyJourneyCap(plan: string | null | undefined): number | null {
  switch (plan) {
    case 'enterprise':
      return null;
    case 'pro':
      return 20_000;
    case 'growth':
    case 'trial':
      return 5_000;
    case 'starter':
      return 500;
    default:
      return 0;
  }
}

/** A date journey enrolled late (cron was down) is dropped after this many hours. */
export const DATE_SEND_GRACE_HOURS = 6;

// ------------------------------------------------------------
// Variables
// ------------------------------------------------------------

export interface VarContact {
  name?: string | null;
  phone?: string | null;
  email?: string | null;
  company?: string | null;
}

export function contactVars(c: VarContact, extra: Record<string, string> = {}): Record<string, string> {
  const name = (c.name ?? '').trim();
  return {
    name: name || 'there',
    first_name: name ? name.split(/\s+/)[0] : 'there',
    phone: c.phone ?? '',
    email: c.email ?? '',
    company: c.company ?? '',
    ...extra,
  };
}

/** Replace {{name}}-style variables; unknown names become empty. */
export function renderVars(template: string, vars: Record<string, string>): string {
  return template.replace(/\{\{\s*([a-z_]+)\s*\}\}/gi, (_, key: string) => vars[key.toLowerCase()] ?? '');
}

export const VARIABLE_HELP = ['name', 'first_name', 'phone', 'email', 'company'] as const;

// ------------------------------------------------------------
// Input validation
// ------------------------------------------------------------

export interface StepInput {
  delay_minutes: number;
  message_type: 'template' | 'text';
  template_name: string | null;
  template_language: string | null;
  template_params: string[];
  text_body: string | null;
}

export interface JourneyInput {
  name: string;
  kind: JourneyKind;
  config: Record<string, unknown>;
  daily_cap: number;
  steps: StepInput[];
}

type Result<T> = { ok: true; value: T } | { ok: false; error: string };

const asInt = (v: unknown, min: number, max: number): number | null => {
  const n = typeof v === 'number' ? v : typeof v === 'string' && v.trim() !== '' ? Number(v) : NaN;
  return Number.isInteger(n) && n >= min && n <= max ? n : null;
};

function validateConfig(kind: JourneyKind, raw: unknown): Result<Record<string, unknown>> {
  const c = (raw && typeof raw === 'object' ? raw : {}) as Record<string, unknown>;

  if (kind === 'date') {
    const src = (c.date_source ?? {}) as Record<string, unknown>;
    let date_source: Record<string, unknown>;
    if (src.type === 'custom_field') {
      if (typeof src.field_id !== 'string' || !UUID_RE.test(src.field_id)) {
        return { ok: false, error: 'Pick the contact field that holds the date.' };
      }
      date_source = { type: 'custom_field', field_id: src.field_id };
    } else if (src.type === 'contact_created') {
      date_source = { type: 'contact_created' };
    } else {
      return { ok: false, error: 'Pick where the date comes from.' };
    }
    const offset = asInt(c.offset_days, -365, 365);
    if (offset === null) return { ok: false, error: 'Days before/after must be between -365 and 365.' };
    const sendTime = typeof c.send_time === 'string' ? c.send_time : '';
    if (!TIME_RE.test(sendTime)) return { ok: false, error: 'Send time must look like 10:00.' };
    const recurrence = c.recurrence === 'once' ? 'once' : 'yearly';
    return { ok: true, value: { date_source, offset_days: offset, send_time: sendTime, recurrence } };
  }

  if (kind === 'drip') {
    const en = (c.enrollment ?? {}) as Record<string, unknown>;
    let enrollment: Record<string, unknown>;
    if (en.mode === 'tag') {
      if (typeof en.tag_id !== 'string' || !UUID_RE.test(en.tag_id)) {
        return { ok: false, error: 'Pick the tag that enrolls contacts.' };
      }
      enrollment = { mode: 'tag', tag_id: en.tag_id };
    } else if (en.mode === 'segment') {
      if (typeof en.segment_id !== 'string' || !UUID_RE.test(en.segment_id)) {
        return { ok: false, error: 'Pick the segment that enrolls contacts.' };
      }
      enrollment = { mode: 'segment', segment_id: en.segment_id };
    } else if (en.mode === 'manual') {
      enrollment = { mode: 'manual' };
    } else {
      return { ok: false, error: 'Choose how contacts join this sequence.' };
    }
    const ex = (c.exit ?? {}) as Record<string, unknown>;
    const exitTag = typeof ex.tag_id === 'string' && UUID_RE.test(ex.tag_id) ? ex.tag_id : null;
    return {
      ok: true,
      value: { enrollment, exit: { on_reply: ex.on_reply !== false, tag_id: exitTag } },
    };
  }

  // winback
  const inactive = asInt(c.inactive_days, 7, 365);
  if (inactive === null) return { ok: false, error: 'Inactive days must be between 7 and 365.' };
  const cooldown = asInt(c.cooldown_days ?? 90, 14, 365);
  if (cooldown === null) return { ok: false, error: 'Do not message again for must be between 14 and 365 days.' };
  const perRun = asInt(c.per_run_limit ?? 100, 1, 500);
  if (perRun === null) return { ok: false, error: 'Contacts enrolled per run must be between 1 and 500.' };
  return { ok: true, value: { inactive_days: inactive, cooldown_days: cooldown, per_run_limit: perRun } };
}

function validateStep(raw: unknown, index: number): Result<StepInput> {
  const s = (raw && typeof raw === 'object' ? raw : {}) as Record<string, unknown>;
  const label = `Step ${index + 1}`;
  const delay = asInt(s.delay_minutes ?? 0, 0, 129_600);
  if (delay === null) return { ok: false, error: `${label}: the wait must be between 0 minutes and 90 days.` };

  if (s.message_type === 'template') {
    const name = typeof s.template_name === 'string' ? s.template_name.trim() : '';
    if (!name || name.length > 200) return { ok: false, error: `${label}: choose a message template.` };
    const lang = typeof s.template_language === 'string' && s.template_language.trim() ? s.template_language.trim() : null;
    const params = Array.isArray(s.template_params) ? s.template_params : [];
    if (params.length > 10 || params.some((p) => typeof p !== 'string' || p.length > 200)) {
      return { ok: false, error: `${label}: up to 10 template values of 200 characters each.` };
    }
    return {
      ok: true,
      value: {
        delay_minutes: delay,
        message_type: 'template',
        template_name: name,
        template_language: lang,
        template_params: params as string[],
        text_body: null,
      },
    };
  }

  if (s.message_type === 'text') {
    const body = typeof s.text_body === 'string' ? s.text_body.trim() : '';
    if (!body) return { ok: false, error: `${label}: write the message.` };
    if (body.length > 1024) return { ok: false, error: `${label}: the message is over 1,024 characters.` };
    return {
      ok: true,
      value: {
        delay_minutes: delay,
        message_type: 'text',
        template_name: null,
        template_language: null,
        template_params: [],
        text_body: body,
      },
    };
  }
  return { ok: false, error: `${label}: choose a template or a text message.` };
}

export function validateJourneyInput(body: unknown): Result<JourneyInput> {
  if (!body || typeof body !== 'object') return { ok: false, error: 'Invalid request.' };
  const b = body as Record<string, unknown>;

  const name = typeof b.name === 'string' ? b.name.trim() : '';
  if (!name || name.length > 80) return { ok: false, error: 'Give the journey a name (up to 80 characters).' };

  const kind = b.kind;
  if (kind !== 'date' && kind !== 'drip' && kind !== 'winback') {
    return { ok: false, error: 'Choose a journey type.' };
  }

  const cfg = validateConfig(kind, b.config);
  if (!cfg.ok) return cfg;

  const cap = asInt(b.daily_cap ?? 200, 1, 5000);
  if (cap === null) return { ok: false, error: 'Daily limit must be between 1 and 5,000.' };

  const rawSteps = Array.isArray(b.steps) ? b.steps : [];
  const maxSteps = kind === 'drip' ? 10 : 1;
  if (rawSteps.length < 1) return { ok: false, error: 'Add a message.' };
  if (rawSteps.length > maxSteps) {
    return { ok: false, error: kind === 'drip' ? 'A sequence can have up to 10 messages.' : 'This type sends a single message.' };
  }
  const steps: StepInput[] = [];
  for (let i = 0; i < rawSteps.length; i++) {
    const r = validateStep(rawSteps[i], i);
    if (!r.ok) return r;
    // Date and win-back messages go out at the scheduled time; no extra wait.
    steps.push(kind === 'drip' ? r.value : { ...r.value, delay_minutes: 0 });
  }
  return { ok: true, value: { name, kind, config: cfg.value, daily_cap: cap, steps } };
}

export function validateSettingsInput(body: unknown): Result<{
  timezone: string;
  quiet_start: string;
  quiet_end: string;
  contact_cooldown_hours: number;
  account_daily_cap: number;
}> {
  const b = (body && typeof body === 'object' ? body : {}) as Record<string, unknown>;
  const timezone = typeof b.timezone === 'string' ? b.timezone : DEFAULT_TIMEZONE;
  if (!isValidTimezone(timezone)) return { ok: false, error: 'Unknown time zone.' };
  const qs = typeof b.quiet_start === 'string' ? b.quiet_start : '21:00';
  const qe = typeof b.quiet_end === 'string' ? b.quiet_end : '09:00';
  if (!TIME_RE.test(qs) || !TIME_RE.test(qe)) return { ok: false, error: 'Quiet hours must look like 21:00.' };
  const cooldown = asInt(b.contact_cooldown_hours ?? 24, 0, 168);
  if (cooldown === null) return { ok: false, error: 'Wait between messages must be 0 to 168 hours.' };
  const cap = asInt(b.account_daily_cap ?? 300, 1, 20_000);
  if (cap === null) return { ok: false, error: 'Daily account limit must be between 1 and 20,000.' };
  return {
    ok: true,
    value: {
      timezone,
      quiet_start: qs,
      quiet_end: qe,
      contact_cooldown_hours: cooldown,
      account_daily_cap: cap,
    },
  };
}

export const JOURNEY_KIND_LABELS: Record<JourneyKind, string> = {
  date: 'Date-based message',
  drip: 'Drip sequence',
  winback: 'Win-back',
};
