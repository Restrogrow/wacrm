// Pure CSAT rules (no I/O): button ids, parsing the customer's tap, summary maths.

export type CsatRating = 1 | 2 | 3

export const CSAT_DEFAULT_MESSAGE = 'Thanks for chatting with us! How was your experience today?'
export const CSAT_THANKS_MESSAGE = 'Thank you for your feedback! 🙏'
export const CSAT_MAX_MESSAGE_LENGTH = 1024

/** Meta limits button titles to 20 characters. */
export const CSAT_OPTIONS: { rating: CsatRating; title: string; label: string }[] = [
  { rating: 3, title: '😀 Great', label: 'Great' },
  { rating: 2, title: '😐 Okay', label: 'Okay' },
  { rating: 1, title: '😞 Bad', label: 'Bad' },
]

export const CSAT_LABELS: Record<CsatRating, string> = { 1: 'Bad', 2: 'Okay', 3: 'Great' }

const UUID = '[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}'
const BUTTON_ID = new RegExp(`^csat:(${UUID}):([1-3])$`, 'i')

/** The id carried by each button: ties a tap to the survey row. */
export function csatButtonId(responseId: string, rating: CsatRating): string {
  return `csat:${responseId}:${rating}`
}

/** Read a button id back. Returns null for any id that is not a CSAT button. */
export function parseCsatButtonId(id: unknown): { responseId: string; rating: CsatRating } | null {
  if (typeof id !== 'string') return null
  const m = BUTTON_ID.exec(id.trim())
  if (!m) return null
  return { responseId: m[1].toLowerCase(), rating: Number(m[2]) as CsatRating }
}

/** Clean the message the admin typed; falls back to the default when empty. */
export function normalizeCsatMessage(input: unknown): string {
  const text = typeof input === 'string' ? input.trim() : ''
  if (!text) return CSAT_DEFAULT_MESSAGE
  return text.slice(0, CSAT_MAX_MESSAGE_LENGTH)
}

export interface CsatRow {
  rating: number | null
}

export interface CsatSummary {
  sent: number
  answered: number
  /** Share of surveys answered, 0-100, or null when none were sent. */
  responseRate: number | null
  /** Average of 1-3, or null when there are no answers. */
  average: number | null
  distribution: Record<CsatRating, number>
  /** Share rating Great, 0-100, or null when there are no answers. */
  greatPct: number | null
}

export function summarizeCsat(rows: CsatRow[]): CsatSummary {
  const distribution: Record<CsatRating, number> = { 1: 0, 2: 0, 3: 0 }
  let total = 0
  let answered = 0
  for (const r of rows) {
    if (r.rating === 1 || r.rating === 2 || r.rating === 3) {
      distribution[r.rating] += 1
      total += r.rating
      answered += 1
    }
  }
  return {
    sent: rows.length,
    answered,
    responseRate: rows.length ? Math.round((answered / rows.length) * 100) : null,
    average: answered ? Math.round((total / answered) * 100) / 100 : null,
    distribution,
    greatPct: answered ? Math.round((distribution[3] / answered) * 100) : null,
  }
}
