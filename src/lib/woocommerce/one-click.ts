// One-click WooCommerce connection, using WooCommerce's built-in app
// authorization (/wc-auth/v1/authorize):
//
//   1. Repeat Grow (or the Repeat Grow plugin) sends the merchant to
//      {store}/wc-auth/v1/authorize with a signed `user_id` (our state).
//   2. The merchant clicks Approve in their own store.
//   3. WooCommerce POSTs a fresh REST key pair to our callback with that
//      `user_id`; we verify the signature, then save the keys encrypted.
//   4. Back in Repeat Grow, the order webhooks are created through the
//      store's REST API (setup-webhooks.ts), so nothing is pasted by hand.
//
// The state is an HMAC-signed, expiring token naming the account, the user
// and the store, so a callback can only attach keys to the store the admin
// chose. Pure apart from reading ENCRYPTION_KEY.

import { createHmac, randomBytes, timingSafeEqual } from 'node:crypto'

export const WOO_APP_NAME = 'Repeat Grow'
export const WOO_STATE_TTL_MS = 60 * 60 * 1000
export const WOO_CALLBACK_PATH = '/api/integrations/woocommerce/wc-auth/callback'

export interface WooState {
  accountId: string
  userId: string
  storeUrl: string
  /** Expiry, ms since epoch. */
  exp: number
}

function stateKey(): Buffer {
  const secret = process.env.ENCRYPTION_KEY
  if (!secret) throw new Error('ENCRYPTION_KEY is not set')
  return createHmac('sha256', secret).update('woocommerce-wc-auth-state').digest()
}

const sign = (body: string, key: Buffer) => createHmac('sha256', key).update(body).digest('base64url')

/** `<payload>.<signature>`, URL-safe. */
export function signWooState(s: Omit<WooState, 'exp'>, now = Date.now(), key = stateKey()): string {
  const payload: WooState & { n: string } = { ...s, exp: now + WOO_STATE_TTL_MS, n: randomBytes(9).toString('base64url') }
  const body = Buffer.from(JSON.stringify(payload)).toString('base64url')
  return `${body}.${sign(body, key)}`
}

/** The state's contents when the signature is valid and it hasn't expired, else null. */
export function verifyWooState(state: unknown, now = Date.now(), key = stateKey()): WooState | null {
  if (typeof state !== 'string' || state.length > 1000) return null
  const [body, sig, extra] = state.split('.')
  if (!body || !sig || extra !== undefined) return null
  const expected = Buffer.from(sign(body, key))
  const given = Buffer.from(sig)
  if (expected.length !== given.length || !timingSafeEqual(expected, given)) return null
  try {
    const p = JSON.parse(Buffer.from(body, 'base64url').toString('utf8')) as Partial<WooState>
    if (typeof p.accountId !== 'string' || typeof p.userId !== 'string' || typeof p.storeUrl !== 'string' || typeof p.exp !== 'number') return null
    if (p.exp < now) return null
    return { accountId: p.accountId, userId: p.userId, storeUrl: p.storeUrl, exp: p.exp }
  } catch {
    return null
  }
}

/** The store's own "Approve Repeat Grow" screen. */
export function wooAuthorizeUrl(args: { storeUrl: string; state: string; returnUrl: string; callbackUrl: string }): string {
  const q = new URLSearchParams({
    app_name: WOO_APP_NAME,
    scope: 'read_write',
    user_id: args.state,
    return_url: args.returnUrl,
    callback_url: args.callbackUrl,
  })
  return `${args.storeUrl.replace(/\/+$/, '')}/wc-auth/v1/authorize?${q}`
}

/** What WooCommerce POSTs to the callback. */
export interface WooAuthCallback {
  key_id?: unknown
  user_id?: unknown
  consumer_key?: unknown
  consumer_secret?: unknown
  key_permissions?: unknown
}

/** Validates the callback body; returns the keys and the verified state, or an error. */
export function parseWooCallback(
  body: WooAuthCallback | null,
  now = Date.now(),
  key = stateKey(),
): { ok: true; state: WooState; consumerKey: string; consumerSecret: string } | { ok: false; error: string } {
  if (!body) return { ok: false, error: 'Empty callback' }
  const state = verifyWooState(body.user_id, now, key)
  if (!state) return { ok: false, error: 'Invalid or expired state' }
  const ck = typeof body.consumer_key === 'string' ? body.consumer_key.trim() : ''
  const cs = typeof body.consumer_secret === 'string' ? body.consumer_secret.trim() : ''
  if (!/^ck_[A-Za-z0-9]{20,80}$/.test(ck) || !/^cs_[A-Za-z0-9]{20,80}$/.test(cs)) return { ok: false, error: 'Missing or malformed keys' }
  if (body.key_permissions !== undefined && body.key_permissions !== 'read_write') {
    return { ok: false, error: 'Read/write access is needed to create the order webhooks' }
  }
  return { ok: true, state, consumerKey: ck, consumerSecret: cs }
}
