// ============================================================
// Razorpay helpers — payment links (server only except the pure
// amount helpers). Credentials are per account and stored encrypted in
// `razorpay_credentials` (service-role only, see migration 064).
// ============================================================

import crypto from 'crypto'
import type { SupabaseClient } from '@supabase/supabase-js'

import { decrypt, encrypt } from '@/lib/whatsapp/encryption'

const API = 'https://api.razorpay.com/v1'

/** Razorpay's smallest chargeable amount is ₹1; we cap a single link at ₹5,00,000. */
export const MIN_LINK_PAISE = 100
export const MAX_LINK_PAISE = 50_000_000

export class RazorpayError extends Error {
  readonly status: number
  constructor(message: string, status = 502) {
    super(message)
    this.name = 'RazorpayError'
    this.status = status
  }
}

// ---------- pure helpers ----------

/** Rupees typed by an agent ("1,499.50", 1499.5) → whole paise, or NaN. */
export function rupeesToPaise(value: number | string): number {
  const n = typeof value === 'number' ? value : Number(String(value).replace(/[,₹\s]/g, ''))
  return Number.isFinite(n) ? Math.round(n * 100) : NaN
}

/** Throws a user-readable error unless `paise` is a chargeable link amount. */
export function validateLinkAmount(paise: number): void {
  if (!Number.isInteger(paise) || paise < MIN_LINK_PAISE) {
    throw new RazorpayError('The minimum payment is ₹1.', 400)
  }
  if (paise > MAX_LINK_PAISE) {
    throw new RazorpayError('The maximum for one payment link is ₹5,00,000.', 400)
  }
}

/** A random per-account secret to paste into Razorpay's webhook settings. */
export function generateWebhookSecret(): string {
  return crypto.randomBytes(24).toString('hex')
}

/** Show only the tail of a key id, e.g. "rzp_live_••••••AbCd". */
export function maskKeyId(keyId: string): string {
  if (keyId.length <= 8) return '••••'
  return `${keyId.slice(0, 9)}••••${keyId.slice(-4)}`
}

/**
 * Verify Razorpay's `X-Razorpay-Signature`: hex HMAC-SHA256 of the RAW
 * request body keyed with the webhook secret. Constant-time compare;
 * any malformed input is simply "not valid".
 */
export function verifyRazorpaySignature(rawBody: string, signature: string | null, secret: string): boolean {
  if (!signature || !secret) return false
  const expected = crypto.createHmac('sha256', secret).update(rawBody).digest('hex')
  const a = Buffer.from(expected, 'utf8')
  const b = Buffer.from(signature.trim(), 'utf8')
  if (a.length !== b.length) return false
  return crypto.timingSafeEqual(a, b)
}

// ---------- credentials ----------

export interface RazorpayCreds {
  keyId: string
  keySecret: string
  webhookSecret: string
}

export async function loadRazorpayCreds(db: SupabaseClient, accountId: string): Promise<RazorpayCreds | null> {
  const { data } = await db
    .from('razorpay_credentials')
    .select('key_id, key_secret_enc, webhook_secret_enc')
    .eq('account_id', accountId)
    .maybeSingle()
  if (!data) return null
  try {
    return {
      keyId: data.key_id as string,
      keySecret: decrypt(data.key_secret_enc as string),
      webhookSecret: decrypt(data.webhook_secret_enc as string),
    }
  } catch {
    return null
  }
}

export function encryptSecret(plain: string): string {
  return encrypt(plain)
}

// ---------- Razorpay REST ----------

function authHeader(keyId: string, keySecret: string): string {
  return `Basic ${Buffer.from(`${keyId}:${keySecret}`).toString('base64')}`
}

async function call(creds: Pick<RazorpayCreds, 'keyId' | 'keySecret'>, path: string, init?: { method?: string; body?: unknown }) {
  let res: Response
  try {
    res = await fetch(`${API}${path}`, {
      method: init?.method ?? 'GET',
      headers: { Authorization: authHeader(creds.keyId, creds.keySecret), 'Content-Type': 'application/json' },
      body: init?.body ? JSON.stringify(init.body) : undefined,
      signal: AbortSignal.timeout(15_000),
    })
  } catch {
    throw new RazorpayError('Could not reach Razorpay. Please try again.', 502)
  }
  const json = (await res.json().catch(() => ({}))) as { error?: { description?: string } } & Record<string, unknown>
  if (res.status === 401) throw new RazorpayError('Razorpay rejected these API keys. Check the key id and secret.', 400)
  if (!res.ok) throw new RazorpayError(json.error?.description || `Razorpay returned ${res.status}`, 400)
  return json
}

/** Cheap read-only call that proves the key id + secret work. */
export async function verifyRazorpayCredentials(creds: Pick<RazorpayCreds, 'keyId' | 'keySecret'>): Promise<void> {
  await call(creds, '/payment_links?count=1')
}

export interface CreatedLink {
  id: string
  shortUrl: string
}

export async function createPaymentLink(
  creds: Pick<RazorpayCreds, 'keyId' | 'keySecret'>,
  args: { amountPaise: number; description: string; referenceId: string; notes: Record<string, string>; expiresInDays?: number },
): Promise<CreatedLink> {
  validateLinkAmount(args.amountPaise)
  const days = args.expiresInDays ?? 7
  const json = (await call(creds, '/payment_links', {
    method: 'POST',
    body: {
      amount: args.amountPaise,
      currency: 'INR',
      accept_partial: false,
      description: args.description.slice(0, 2000),
      reference_id: args.referenceId,
      // We send the link ourselves on WhatsApp; no SMS / email from Razorpay.
      notify: { sms: false, email: false },
      reminder_enable: false,
      expire_by: Math.floor(Date.now() / 1000) + days * 86_400,
      notes: args.notes,
    },
  })) as { id?: string; short_url?: string }
  if (!json.id || !json.short_url) throw new RazorpayError('Razorpay did not return a payment link.')
  return { id: json.id, shortUrl: json.short_url }
}

/** Best effort: stop a link we could not deliver from being paid later. */
export async function cancelPaymentLink(creds: Pick<RazorpayCreds, 'keyId' | 'keySecret'>, linkId: string): Promise<void> {
  try {
    await call(creds, `/payment_links/${encodeURIComponent(linkId)}/cancel`, { method: 'POST' })
  } catch {
    /* already cancelled / paid — nothing to do */
  }
}

// ---------- webhook payload ----------

export interface RazorpayWebhookEvent {
  event?: string
  payload?: {
    payment_link?: { entity?: { id?: string; reference_id?: string; status?: string; notes?: Record<string, string> | unknown[] } }
    payment?: { entity?: { id?: string; method?: string; notes?: Record<string, string> | unknown[]; error_description?: string } }
  }
}

/** Our `payment_links.id`, carried as the link's reference_id / notes. */
export function paymentIdFromEvent(ev: RazorpayWebhookEvent): string | null {
  const link = ev.payload?.payment_link?.entity
  const pay = ev.payload?.payment?.entity
  const fromNotes = (n: unknown) => (n && !Array.isArray(n) && typeof (n as Record<string, string>).rg_payment_id === 'string' ? (n as Record<string, string>).rg_payment_id : null)
  const candidate = link?.reference_id || fromNotes(link?.notes) || fromNotes(pay?.notes)
  return candidate && /^[0-9a-f-]{36}$/i.test(candidate) ? candidate : null
}
