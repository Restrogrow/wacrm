import { describe, expect, it } from 'vitest';

import {
  addDays,
  contactVars,
  dueOccurrence,
  eventDateInYear,
  evaluateExit,
  frequencyCapBlocked,
  isQuietHours,
  localNow,
  localToUtc,
  monthlyJourneyCap,
  nextAfterStep,
  parseFlexibleDate,
  renderVars,
  startOfLocalDay,
  validateJourneyInput,
  validateSettingsInput,
} from './core';

const IST = 'Asia/Kolkata';

describe('parseFlexibleDate', () => {
  it('reads ISO, Indian day-first and word dates', () => {
    expect(parseFlexibleDate('1990-08-15')).toEqual({ y: 1990, m: 8, d: 15 });
    expect(parseFlexibleDate('2026-08-15T10:00:00Z')).toEqual({ y: 2026, m: 8, d: 15 });
    expect(parseFlexibleDate('15/08/1990')).toEqual({ y: 1990, m: 8, d: 15 });
    expect(parseFlexibleDate('05-03-1991')).toEqual({ y: 1991, m: 3, d: 5 }); // day first
    expect(parseFlexibleDate('15 Aug 1990')).toEqual({ y: 1990, m: 8, d: 15 });
    expect(parseFlexibleDate('Aug 15, 1990')).toEqual({ y: 1990, m: 8, d: 15 });
    expect(parseFlexibleDate('15/08')).toEqual({ y: null, m: 8, d: 15 });
  });
  it('rejects impossible or unreadable dates', () => {
    expect(parseFlexibleDate('31/02/2020')).toBeNull();
    expect(parseFlexibleDate('29/02/2021')).toBeNull(); // not a leap year
    expect(parseFlexibleDate('13/13/2020')).toBeNull();
    expect(parseFlexibleDate('soon')).toBeNull();
    expect(parseFlexibleDate('')).toBeNull();
    expect(parseFlexibleDate(null)).toBeNull();
  });
  it('accepts Feb 29 in a leap year and with no year', () => {
    expect(parseFlexibleDate('29/02/2000')).toEqual({ y: 2000, m: 2, d: 29 });
    expect(parseFlexibleDate('29/02')).toEqual({ y: null, m: 2, d: 29 });
  });
});

describe('eventDateInYear (leap-day birthdays)', () => {
  it('moves Feb 29 to Feb 28 in non-leap years only', () => {
    const b = { y: 2000, m: 2, d: 29 };
    expect(eventDateInYear(b, 2027)).toEqual({ y: 2027, m: 2, d: 28 });
    expect(eventDateInYear(b, 2028)).toEqual({ y: 2028, m: 2, d: 29 });
  });
});

describe('dueOccurrence', () => {
  const bday = { y: 1990, m: 8, d: 15 };

  it('fires on the day, the day before and the day after', () => {
    expect(dueOccurrence({ date: bday, recurrence: 'yearly', offsetDays: 0, today: { y: 2026, m: 8, d: 15 } })).toBe('2026');
    expect(dueOccurrence({ date: bday, recurrence: 'yearly', offsetDays: -1, today: { y: 2026, m: 8, d: 14 } })).toBe('2026');
    expect(dueOccurrence({ date: bday, recurrence: 'yearly', offsetDays: 2, today: { y: 2026, m: 8, d: 17 } })).toBe('2026');
    expect(dueOccurrence({ date: bday, recurrence: 'yearly', offsetDays: 0, today: { y: 2026, m: 8, d: 16 } })).toBeNull();
  });

  it('is keyed by the EVENT year across New Year', () => {
    const jan1 = { y: 1985, m: 1, d: 1 };
    // "1 day before" Jan 1 2027 is Dec 31 2026 -> the 2027 occurrence.
    expect(dueOccurrence({ date: jan1, recurrence: 'yearly', offsetDays: -1, today: { y: 2026, m: 12, d: 31 } })).toBe('2027');
    // "2 days after" Dec 31 2026 is Jan 2 2027 -> the 2026 occurrence.
    const dec31 = { y: 1985, m: 12, d: 31 };
    expect(dueOccurrence({ date: dec31, recurrence: 'yearly', offsetDays: 2, today: { y: 2027, m: 1, d: 2 } })).toBe('2026');
  });

  it('handles a Feb 29 birthday in leap and non-leap years', () => {
    const leap = { y: 2000, m: 2, d: 29 };
    expect(dueOccurrence({ date: leap, recurrence: 'yearly', offsetDays: 0, today: { y: 2027, m: 2, d: 28 } })).toBe('2027');
    expect(dueOccurrence({ date: leap, recurrence: 'yearly', offsetDays: 0, today: { y: 2027, m: 3, d: 1 } })).toBeNull();
    expect(dueOccurrence({ date: leap, recurrence: 'yearly', offsetDays: 0, today: { y: 2028, m: 2, d: 29 } })).toBe('2028');
    expect(dueOccurrence({ date: leap, recurrence: 'yearly', offsetDays: 0, today: { y: 2028, m: 2, d: 28 } })).toBeNull();
  });

  it('never fires on or before the year of a known date (anniversaries)', () => {
    const added = { y: 2026, m: 10, d: 17 };
    expect(dueOccurrence({ date: added, recurrence: 'yearly', offsetDays: 0, today: { y: 2026, m: 10, d: 17 } })).toBeNull();
    expect(dueOccurrence({ date: added, recurrence: 'yearly', offsetDays: 0, today: { y: 2027, m: 10, d: 17 } })).toBe('2027');
  });

  it('works for dates without a year', () => {
    expect(dueOccurrence({ date: { y: null, m: 8, d: 15 }, recurrence: 'yearly', offsetDays: 0, today: { y: 2031, m: 8, d: 15 } })).toBe('2031');
  });

  it('supports one-off dates and needs a year for them', () => {
    const renewal = { y: 2026, m: 11, d: 30 };
    expect(dueOccurrence({ date: renewal, recurrence: 'once', offsetDays: -7, today: { y: 2026, m: 11, d: 23 } })).toBe('once');
    expect(dueOccurrence({ date: renewal, recurrence: 'once', offsetDays: -7, today: { y: 2027, m: 11, d: 23 } })).toBeNull();
    expect(dueOccurrence({ date: { y: null, m: 11, d: 30 }, recurrence: 'once', offsetDays: 0, today: { y: 2026, m: 11, d: 30 } })).toBeNull();
  });
});

describe('time zones', () => {
  it('converts local send time to UTC (IST is UTC+5:30)', () => {
    expect(localToUtc({ y: 2026, m: 8, d: 15 }, '10:00', IST).toISOString()).toBe('2026-08-15T04:30:00.000Z');
    expect(localToUtc({ y: 2026, m: 8, d: 15 }, '00:00', IST).toISOString()).toBe('2026-08-14T18:30:00.000Z');
  });
  it('handles zones with daylight saving', () => {
    // New York is UTC-4 in summer and UTC-5 in winter.
    expect(localToUtc({ y: 2026, m: 7, d: 1 }, '09:00', 'America/New_York').toISOString()).toBe('2026-07-01T13:00:00.000Z');
    expect(localToUtc({ y: 2026, m: 1, d: 1 }, '09:00', 'America/New_York').toISOString()).toBe('2026-01-01T14:00:00.000Z');
  });
  it('reads the local date near midnight', () => {
    // 20:00 UTC on Aug 14 is 01:30 on Aug 15 in India.
    const t = localNow(new Date('2026-08-14T20:00:00Z'), IST);
    expect(t.date).toEqual({ y: 2026, m: 8, d: 15 });
    expect(t.minutes).toBe(90);
    expect(startOfLocalDay(new Date('2026-08-14T20:00:00Z'), IST).toISOString()).toBe('2026-08-14T18:30:00.000Z');
  });
  it('falls back to India time for an unknown zone name', () => {
    expect(localNow(new Date('2026-08-14T20:00:00Z'), 'Mars/Phobos').date).toEqual({ y: 2026, m: 8, d: 15 });
  });
});

describe('isQuietHours', () => {
  it('covers an overnight 21:00-09:00 window in local time', () => {
    const at = (iso: string) => isQuietHours(new Date(iso), IST, '21:00', '09:00');
    expect(at('2026-08-15T16:30:00Z')).toBe(true); // 22:00 IST
    expect(at('2026-08-15T22:00:00Z')).toBe(true); // 03:30 IST next day
    expect(at('2026-08-15T03:00:00Z')).toBe(true); // 08:30 IST: still quiet until 09:00
  });
  it('is open in the middle of the day and respects the exact boundaries', () => {
    const at = (iso: string) => isQuietHours(new Date(iso), IST, '21:00', '09:00');
    expect(at('2026-08-15T06:30:00Z')).toBe(false); // 12:00 IST
    expect(at('2026-08-15T03:30:00Z')).toBe(false); // 09:00 IST: quiet ends
    expect(at('2026-08-15T15:30:00Z')).toBe(true); // 21:00 IST: quiet begins
    expect(at('2026-08-15T15:29:00Z')).toBe(false); // 20:59 IST
  });
  it('supports a same-day window and "no quiet hours"', () => {
    expect(isQuietHours(new Date('2026-08-15T07:00:00Z'), IST, '12:00', '14:00')).toBe(true); // 12:30
    expect(isQuietHours(new Date('2026-08-15T10:00:00Z'), IST, '12:00', '14:00')).toBe(false); // 15:30
    expect(isQuietHours(new Date('2026-08-15T16:30:00Z'), IST, '00:00', '00:00')).toBe(false);
  });
});

describe('frequencyCapBlocked', () => {
  const now = new Date('2026-08-15T12:00:00Z');
  it('blocks a second message inside the cooldown window', () => {
    expect(frequencyCapBlocked(['2026-08-15T01:00:00Z'], now, 24)).toBe(true);
    expect(frequencyCapBlocked(['2026-08-14T11:59:00Z'], now, 24)).toBe(false);
  });
  it('is off at 0 hours and ignores empty or invalid entries', () => {
    expect(frequencyCapBlocked(['2026-08-15T11:59:00Z'], now, 0)).toBe(false);
    expect(frequencyCapBlocked([null, undefined, 'nope'], now, 24)).toBe(false);
    expect(frequencyCapBlocked([], now, 24)).toBe(false);
  });
});

describe('evaluateExit', () => {
  const base = { optedOut: false, onReply: true, repliedSinceEnroll: false, exitTagId: null, hasExitTag: false };
  it('exits on opt-out first, then reply, then tag', () => {
    expect(evaluateExit({ ...base, optedOut: true, repliedSinceEnroll: true })).toBe('opted_out');
    expect(evaluateExit({ ...base, repliedSinceEnroll: true, exitTagId: 't', hasExitTag: true })).toBe('replied');
    expect(evaluateExit({ ...base, exitTagId: 't', hasExitTag: true })).toBe('tag_added');
  });
  it('keeps going when nothing applies or the rule is off', () => {
    expect(evaluateExit(base)).toBeNull();
    expect(evaluateExit({ ...base, onReply: false, repliedSinceEnroll: true })).toBeNull();
    expect(evaluateExit({ ...base, exitTagId: 't', hasExitTag: false })).toBeNull();
    expect(evaluateExit({ ...base, exitTagId: null, hasExitTag: true })).toBeNull();
  });
});

describe('nextAfterStep', () => {
  const now = new Date('2026-08-15T12:00:00Z');
  const steps = [{ delay_minutes: 0 }, { delay_minutes: 60 }, { delay_minutes: 2880 }];
  it('schedules the next step after its own delay', () => {
    const r = nextAfterStep(steps, 0, now);
    expect(r).toEqual({ done: false, nextIndex: 1, nextRunAt: new Date('2026-08-15T13:00:00Z') });
    const r2 = nextAfterStep(steps, 1, now);
    expect(r2.done).toBe(false);
    if (!r2.done) expect(r2.nextRunAt.toISOString()).toBe('2026-08-17T12:00:00.000Z');
  });
  it('finishes after the last step', () => {
    expect(nextAfterStep(steps, 2, now)).toEqual({ done: true });
    expect(nextAfterStep([{ delay_minutes: 0 }], 0, now)).toEqual({ done: true });
  });
});

describe('renderVars / contactVars', () => {
  it('fills known variables and blanks unknown ones', () => {
    const v = contactVars({ name: 'Priya Sharma', phone: '+91999', company: 'Acme' });
    expect(renderVars('Hi {{first_name}} from {{ company }}! {{unknown}}', v)).toBe('Hi Priya from Acme! ');
  });
  it('falls back to "there" with no name', () => {
    expect(renderVars('Hi {{name}}', contactVars({ name: null }))).toBe('Hi there');
  });
});

describe('monthlyJourneyCap', () => {
  it('scales with the plan and is unlimited for enterprise', () => {
    expect(monthlyJourneyCap('starter')).toBe(500);
    expect(monthlyJourneyCap('trial')).toBe(5000);
    expect(monthlyJourneyCap('pro')).toBe(20000);
    expect(monthlyJourneyCap('enterprise')).toBeNull();
    expect(monthlyJourneyCap('expired')).toBe(0);
  });
});

describe('addDays', () => {
  it('crosses month and year boundaries', () => {
    expect(addDays({ y: 2026, m: 12, d: 31 }, 1)).toEqual({ y: 2027, m: 1, d: 1 });
    expect(addDays({ y: 2028, m: 3, d: 1 }, -1)).toEqual({ y: 2028, m: 2, d: 29 });
  });
});

describe('validateJourneyInput', () => {
  const tpl = { delay_minutes: 0, message_type: 'template', template_name: 'happy_birthday', template_language: 'en', template_params: ['{{first_name}}'] };
  const field = '11111111-1111-4111-8111-111111111111';

  it('accepts a date journey and zeroes the step delay', () => {
    const r = validateJourneyInput({
      name: 'Birthday',
      kind: 'date',
      config: { date_source: { type: 'custom_field', field_id: field }, offset_days: 0, send_time: '10:00', recurrence: 'yearly' },
      steps: [{ ...tpl, delay_minutes: 500 }],
    });
    expect(r.ok).toBe(true);
    if (r.ok) {
      expect(r.value.steps[0].delay_minutes).toBe(0);
      expect(r.value.daily_cap).toBe(200);
    }
  });
  it('rejects a bad send time, offset and missing date field', () => {
    const base = { name: 'x', kind: 'date', steps: [tpl] };
    expect(validateJourneyInput({ ...base, config: { date_source: { type: 'contact_created' }, offset_days: 0, send_time: '25:00' } }).ok).toBe(false);
    expect(validateJourneyInput({ ...base, config: { date_source: { type: 'contact_created' }, offset_days: 400, send_time: '10:00' } }).ok).toBe(false);
    expect(validateJourneyInput({ ...base, config: { date_source: { type: 'custom_field', field_id: 'nope' }, offset_days: 0, send_time: '10:00' } }).ok).toBe(false);
  });
  it('accepts a multi-step drip but not a multi-step win-back', () => {
    const drip = validateJourneyInput({
      name: 'Onboarding',
      kind: 'drip',
      config: { enrollment: { mode: 'manual' }, exit: { on_reply: true } },
      steps: [tpl, { ...tpl, delay_minutes: 1440 }],
    });
    expect(drip.ok).toBe(true);
    const wb = validateJourneyInput({
      name: 'Win back',
      kind: 'winback',
      config: { inactive_days: 30 },
      steps: [tpl, tpl],
    });
    expect(wb.ok).toBe(false);
  });
  it('requires a template name or message text, and sane limits', () => {
    const cfg = { inactive_days: 30 };
    expect(validateJourneyInput({ name: 'a', kind: 'winback', config: cfg, steps: [{ message_type: 'template' }] }).ok).toBe(false);
    expect(validateJourneyInput({ name: 'a', kind: 'winback', config: cfg, steps: [{ message_type: 'text', text_body: '  ' }] }).ok).toBe(false);
    expect(validateJourneyInput({ name: 'a', kind: 'winback', config: { inactive_days: 2 }, steps: [tpl] }).ok).toBe(false);
    expect(validateJourneyInput({ name: '', kind: 'winback', config: cfg, steps: [tpl] }).ok).toBe(false);
    expect(validateJourneyInput({ name: 'a', kind: 'winback', config: cfg, steps: [tpl], daily_cap: 99999 }).ok).toBe(false);
  });
});

describe('validateSettingsInput', () => {
  it('applies defaults and rejects bad values', () => {
    const ok = validateSettingsInput({});
    expect(ok.ok).toBe(true);
    if (ok.ok) expect(ok.value).toMatchObject({ timezone: 'Asia/Kolkata', quiet_start: '21:00', quiet_end: '09:00', contact_cooldown_hours: 24 });
    expect(validateSettingsInput({ timezone: 'Mars/Phobos' }).ok).toBe(false);
    expect(validateSettingsInput({ quiet_start: '9pm' }).ok).toBe(false);
    expect(validateSettingsInput({ contact_cooldown_hours: 500 }).ok).toBe(false);
  });
});
