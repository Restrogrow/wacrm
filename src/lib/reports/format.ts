// Number formatting shared by the report cards and tables.

/** "—" when there is no sample, otherwise "45s", "4m 12s", "2h 5m", "1d 3h". */
export function formatDuration(seconds: number | null | undefined): string {
  if (seconds === null || seconds === undefined || !Number.isFinite(seconds) || seconds < 0) return '—'
  const s = Math.round(seconds)
  if (s < 60) return `${s}s`
  const m = Math.floor(s / 60)
  if (m < 60) return `${m}m ${s % 60}s`
  const h = Math.floor(m / 60)
  if (h < 24) return `${h}h ${m % 60}m`
  return `${Math.floor(h / 24)}d ${h % 24}h`
}

/** n / d as a 0–100 percentage, or null when there is nothing to divide by. */
export function ratePct(n: number, d: number): number | null {
  if (!d || d <= 0) return null
  return (n / d) * 100
}

export function formatPct(value: number | null | undefined): string {
  if (value === null || value === undefined || !Number.isFinite(value)) return '—'
  return `${value.toFixed(value >= 99.95 || value === 0 ? 0 : 1)}%`
}

export function formatCount(n: number): string {
  return new Intl.NumberFormat('en-IN').format(Math.round(n))
}
