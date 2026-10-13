// ============================================================
// Date bucketing for the platform admin dashboard — pure.
//
// "Today" and the daily chart use India time (Asia/Kolkata, UTC+5:30,
// no DST) so a sign-up at 1 a.m. IST counts for the right day.
// ============================================================

const IST_OFFSET_MS = 5.5 * 60 * 60 * 1000;
const DAY_MS = 24 * 60 * 60 * 1000;

/** "2026-10-14" — the IST calendar day of an instant. */
export function istDayKey(at: Date | string | number): string {
  const ms = typeof at === 'number' ? at : new Date(at).getTime();
  return new Date(ms + IST_OFFSET_MS).toISOString().slice(0, 10);
}

/** UTC instant when the IST day containing `now` started. */
export function istStartOfDay(now = Date.now()): Date {
  const key = istDayKey(now);
  return new Date(Date.parse(`${key}T00:00:00Z`) - IST_OFFSET_MS);
}

/** Start of the IST day `days` days before today (0 = today). */
export function istDaysAgo(days: number, now = Date.now()): Date {
  return new Date(istStartOfDay(now).getTime() - days * DAY_MS);
}

export interface DayCount {
  day: string; // "2026-10-14"
  count: number;
}

/** One entry per IST day for the last `days` days (oldest first), zero-filled. */
export function dailyCounts(
  timestamps: (string | null | undefined)[],
  days: number,
  now = Date.now()
): DayCount[] {
  const buckets = new Map<string, number>();
  for (let i = days - 1; i >= 0; i--) {
    buckets.set(istDayKey(istDaysAgo(i, now)), 0);
  }
  for (const ts of timestamps) {
    if (!ts) continue;
    const key = istDayKey(ts);
    if (buckets.has(key)) buckets.set(key, (buckets.get(key) ?? 0) + 1);
  }
  return [...buckets].map(([day, count]) => ({ day, count }));
}

/** Count timestamps in [from, to). */
export function countBetween(
  timestamps: (string | null | undefined)[],
  from: Date,
  to: Date = new Date(8.64e15)
): number {
  const a = from.getTime();
  const b = to.getTime();
  let n = 0;
  for (const ts of timestamps) {
    if (!ts) continue;
    const t = Date.parse(ts);
    if (t >= a && t < b) n++;
  }
  return n;
}

/** "+3", "−2", "±0" against the previous period. */
export function formatDelta(current: number, previous: number): string {
  const d = current - previous;
  if (d === 0) return '±0';
  return d > 0 ? `+${d}` : `−${Math.abs(d)}`;
}

/** "14 Oct" */
export function formatDayLabel(day: string): string {
  return new Date(`${day}T00:00:00Z`).toLocaleDateString('en-IN', {
    day: 'numeric',
    month: 'short',
    timeZone: 'UTC',
  });
}
