// Pure helpers for the website chat widget: config sanitising (what the
// admin may save), the public-safe subset returned to visitors' browsers,
// and the wa.me link builder. No I/O so the rules are unit-testable.

import { normalizeWaNumber } from '@/lib/wa-link'

export const PUBLIC_ID_RE = /^[A-Za-z0-9]{10,24}$/

export const WIDGET_LIMITS = {
  buttonLabel: 40,
  greeting: 200,
  prefill: 300,
  offline: 200,
  name: 60,
} as const

export const WIDGET_COLORS = ['#25D366', '#087A4A', '#128C7E', '#1E3A5F', '#111111', '#7C3AED', '#E11D48'] as const

export interface WidgetConfig {
  enabled: boolean
  /** Digits-only international number, '' when not set. */
  phone: string
  position: 'left' | 'right'
  color: string
  button_label: string
  greeting: string
  prefill_message: string
  hours_aware: boolean
  offline_text: string
  collect_name: boolean
}

export const DEFAULT_WIDGET: WidgetConfig = {
  enabled: false,
  phone: '',
  position: 'right',
  color: '#25D366',
  button_label: 'Chat with us',
  greeting: 'Hi! How can we help you?',
  prefill_message: 'Hi! I have a question.',
  hours_aware: false,
  offline_text: 'We are offline right now. Send a message and we will reply as soon as we are back.',
  collect_name: false,
}

/** Strip control characters and collapse whitespace; plain text only. */
function cleanText(raw: unknown, max: number, fallback: string): string {
  if (typeof raw !== 'string') return fallback
  const text = raw
    .replace(/[\u0000-\u0008\u000b\u000c\u000e-\u001f\u007f]/g, '')
    .replace(/\s+\n/g, '\n')
    .trim()
    .slice(0, max)
  return text
}

/**
 * Validate an admin's submitted config. Unknown keys are dropped, text is
 * trimmed/capped, the colour must be #rrggbb and the phone must normalise
 * to a real international number (or be empty while the widget is off).
 */
export function sanitizeWidgetConfig(
  input: unknown,
): { ok: true; value: WidgetConfig } | { ok: false; error: string } {
  const b = (input && typeof input === 'object' ? input : {}) as Record<string, unknown>

  const enabled = b.enabled === true

  let phone = ''
  if (typeof b.phone === 'string' && b.phone.trim()) {
    const normalised = normalizeWaNumber(b.phone)
    if (!normalised) return { ok: false, error: 'Enter a valid WhatsApp number with country code.' }
    phone = normalised
  }
  if (enabled && !phone) return { ok: false, error: 'Add the WhatsApp number to show before turning the widget on.' }

  const position = b.position === 'left' ? 'left' : 'right'

  let color = DEFAULT_WIDGET.color
  if (typeof b.color === 'string') {
    if (!/^#[0-9a-fA-F]{6}$/.test(b.color.trim())) return { ok: false, error: 'Pick a colour like #25D366.' }
    color = b.color.trim().toUpperCase()
  }

  const buttonLabel = cleanText(b.button_label, WIDGET_LIMITS.buttonLabel, DEFAULT_WIDGET.button_label) || DEFAULT_WIDGET.button_label
  const greeting = cleanText(b.greeting, WIDGET_LIMITS.greeting, DEFAULT_WIDGET.greeting) || DEFAULT_WIDGET.greeting
  const prefill = cleanText(b.prefill_message, WIDGET_LIMITS.prefill, DEFAULT_WIDGET.prefill_message)
  const offline = cleanText(b.offline_text, WIDGET_LIMITS.offline, DEFAULT_WIDGET.offline_text) || DEFAULT_WIDGET.offline_text

  return {
    ok: true,
    value: {
      enabled,
      phone,
      position,
      color,
      button_label: buttonLabel,
      greeting,
      prefill_message: prefill,
      hours_aware: b.hours_aware === true,
      offline_text: offline,
      collect_name: b.collect_name === true,
    },
  }
}

/** The only fields a visitor's browser ever receives. */
export interface PublicWidgetConfig {
  enabled: boolean
  number?: string
  position?: 'left' | 'right'
  color?: string
  label?: string
  greeting?: string
  prefill?: string
  collectName?: boolean
  /** null when the widget is not business-hours aware. */
  open?: boolean | null
  offlineText?: string
}

export function toPublicConfig(row: WidgetConfig | null, open: boolean | null): PublicWidgetConfig {
  if (!row || !row.enabled || !row.phone) return { enabled: false }
  return {
    enabled: true,
    number: row.phone,
    position: row.position,
    color: row.color,
    label: row.button_label,
    greeting: row.greeting,
    prefill: row.prefill_message,
    collectName: row.collect_name,
    open: row.hours_aware ? open : null,
    offlineText: row.hours_aware ? row.offline_text : undefined,
  }
}

/**
 * wa.me link for a visitor. The optional first name is appended to the
 * pre-filled text so the team sees who is writing. The result is capped so
 * the URL stays short.
 */
export function buildWidgetWaLink(number: string, prefill: string, visitorName?: string): string | null {
  const digits = normalizeWaNumber(number)
  if (!digits) return null
  const name = (visitorName ?? '').replace(/[\u0000-\u001f\u007f]/g, ' ').replace(/\s+/g, ' ').trim().slice(0, WIDGET_LIMITS.name)
  let text = prefill.trim().slice(0, WIDGET_LIMITS.prefill)
  if (name) text = text ? `${text}\n\nName: ${name}` : `Name: ${name}`
  return text ? `https://wa.me/${digits}?text=${encodeURIComponent(text)}` : `https://wa.me/${digits}`
}

/** The one-line snippet customers paste into their site. */
export function widgetSnippet(origin: string, publicId: string): string {
  return `<script src="${origin.replace(/\/+$/, '')}/widget/${publicId}.js" async></script>`
}
