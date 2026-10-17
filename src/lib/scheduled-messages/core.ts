// Pure rules for scheduled chat messages (no I/O), shared by the API,
// the cron processor and the inbox UI.

/** WhatsApp lets free-form messages go out only this long after the customer's last message. */
export const SESSION_WINDOW_MS = 24 * 60 * 60 * 1000

/** Earliest a message can be scheduled, so the cron has a chance to pick it up. */
export const MIN_LEAD_MS = 60 * 1000

/** Furthest ahead a message can be scheduled. */
export const MAX_LEAD_DAYS = 30
export const MAX_LEAD_MS = MAX_LEAD_DAYS * 24 * 60 * 60 * 1000

export const MAX_TEXT_LENGTH = 4096

/** A row stuck in "sending" this long was interrupted (crash/timeout); it is failed, not retried, to avoid a double send. */
export const STALE_SENDING_MS = 10 * 60 * 1000

export type ScheduleCheck = { ok: true; at: Date } | { ok: false; error: string }

/** Validate the requested send time and text. */
export function validateSchedule(
  input: { scheduledAt: unknown; text: unknown },
  now: Date = new Date(),
): ScheduleCheck {
  const text = typeof input.text === 'string' ? input.text.trim() : ''
  if (!text) return { ok: false, error: 'Write the message to send.' }
  if (text.length > MAX_TEXT_LENGTH) {
    return { ok: false, error: `The message is over ${MAX_TEXT_LENGTH} characters.` }
  }
  if (typeof input.scheduledAt !== 'string') return { ok: false, error: 'Pick a date and time.' }
  const at = new Date(input.scheduledAt)
  if (Number.isNaN(at.getTime())) return { ok: false, error: 'That date and time is not valid.' }
  if (at.getTime() < now.getTime() + MIN_LEAD_MS) {
    return { ok: false, error: 'Pick a time at least a minute from now.' }
  }
  if (at.getTime() > now.getTime() + MAX_LEAD_MS) {
    return { ok: false, error: `Messages can be scheduled up to ${MAX_LEAD_DAYS} days ahead.` }
  }
  return { ok: true, at }
}

/** When the customer's 24-hour window closes, or null if they never wrote. */
export function windowClosesAt(lastCustomerMessageAt: string | Date | null | undefined): Date | null {
  if (!lastCustomerMessageAt) return null
  const t = new Date(lastCustomerMessageAt).getTime()
  if (Number.isNaN(t)) return null
  return new Date(t + SESSION_WINDOW_MS)
}

/** Is the 24-hour window still open at `at`? */
export function isWindowOpen(
  lastCustomerMessageAt: string | Date | null | undefined,
  at: Date = new Date(),
): boolean {
  const closes = windowClosesAt(lastCustomerMessageAt)
  return closes !== null && at.getTime() < closes.getTime()
}

/**
 * A heads-up shown when the chosen time falls after the window closes. The
 * message is still allowed (the customer may write again before then), but if
 * they don't, it will fail at send time.
 */
export function windowWarning(
  lastCustomerMessageAt: string | Date | null | undefined,
  scheduledAt: Date,
): string | null {
  const closes = windowClosesAt(lastCustomerMessageAt)
  if (!closes) {
    return 'This customer has not messaged you yet, so a free-form message cannot be sent. It will fail unless they write to you first.'
  }
  if (scheduledAt.getTime() >= closes.getTime()) {
    return 'The customer’s 24-hour reply window will have closed by then. The message will only send if they write to you again before it goes out.'
  }
  return null
}
