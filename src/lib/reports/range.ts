// Date-range helpers for /reports. All boundaries are LOCAL calendar days
// (what a business user means by "last 7 days"); `to` is exclusive (the
// start of the day after the last included day) so it can be passed straight
// to SQL as `< to`.

import { localDayKey, startOfLocalDay } from '@/lib/dashboard/date-utils'

export const MAX_RANGE_DAYS = 365
export type RangePreset = 7 | 30 | 90

export interface ReportRange {
  /** Inclusive start (local midnight). */
  from: Date
  /** Exclusive end (local midnight after the last day). */
  to: Date
  /** Number of calendar days covered. */
  days: number
}

function addDays(d: Date, n: number): Date {
  const out = new Date(d)
  out.setDate(out.getDate() + n)
  return out
}

/** Calendar days from `from` (inclusive) to `to` (exclusive), DST-safe. */
export function countDays(from: Date, to: Date): number {
  let n = 0
  for (let d = new Date(from); d < to && n <= MAX_RANGE_DAYS + 2; d = addDays(d, 1)) n++
  return n
}

/** "Last N days" ending today (today included). */
export function presetRange(days: RangePreset, now: Date = new Date()): ReportRange {
  const today = startOfLocalDay(now)
  const from = addDays(today, -(days - 1))
  const to = addDays(today, 1)
  return { from, to, days }
}

function parseDateInput(value: string): Date | null {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(value.trim())
  if (!m) return null
  const d = new Date(Number(m[1]), Number(m[2]) - 1, Number(m[3]))
  // Reject overflow such as 2026-02-31 (JS would roll it into March).
  if (d.getFullYear() !== Number(m[1]) || d.getMonth() !== Number(m[2]) - 1 || d.getDate() !== Number(m[3])) {
    return null
  }
  return d
}

export type CustomRangeResult = { ok: true; range: ReportRange } | { ok: false; error: string }

/** Custom range from two `YYYY-MM-DD` inputs (both days inclusive). */
export function customRange(fromStr: string, toStr: string, now: Date = new Date()): CustomRangeResult {
  const from = parseDateInput(fromStr)
  const lastDay = parseDateInput(toStr)
  if (!from || !lastDay) return { ok: false, error: 'Pick both a start and an end date.' }
  if (lastDay < from) return { ok: false, error: 'The end date must be on or after the start date.' }
  const today = startOfLocalDay(now)
  if (from > today) return { ok: false, error: 'The start date cannot be in the future.' }
  const to = addDays(lastDay > today ? today : lastDay, 1)
  const days = countDays(from, to)
  if (days > MAX_RANGE_DAYS) return { ok: false, error: `Choose a range of ${MAX_RANGE_DAYS} days or fewer.` }
  return { ok: true, range: { from, to, days } }
}

/** Every local day key (YYYY-MM-DD) in the range, in order. */
export function dayKeys(range: ReportRange): string[] {
  const keys: string[] = []
  for (let d = new Date(range.from); d < range.to && keys.length <= MAX_RANGE_DAYS + 1; d = addDays(d, 1)) {
    keys.push(localDayKey(d))
  }
  return keys
}

/**
 * Turn sparse per-day rows into one row per day (missing days become `zero`)
 * so charts and tables show quiet days instead of skipping them.
 */
export function fillDays<T extends { day: string }>(
  keys: string[],
  rows: T[],
  zero: (day: string) => T,
): T[] {
  const byDay = new Map(rows.map((r) => [r.day, r]))
  return keys.map((k) => byDay.get(k) ?? zero(k))
}

/** Short axis label: "12 Oct". */
export function shortDayLabel(key: string): string {
  const [y, m, d] = key.split('-').map(Number)
  return new Date(y, m - 1, d).toLocaleDateString('en-IN', { day: 'numeric', month: 'short' })
}

/** Human label for the header, e.g. "12 Oct – 18 Oct 2026". */
export function describeRange(range: ReportRange): string {
  const last = addDays(range.to, -1)
  const fmt = (d: Date, withYear: boolean) =>
    d.toLocaleDateString('en-IN', { day: 'numeric', month: 'short', ...(withYear ? { year: 'numeric' } : {}) })
  return `${fmt(range.from, false)} – ${fmt(last, true)}`
}
