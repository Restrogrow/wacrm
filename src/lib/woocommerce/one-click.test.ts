import { describe, expect, it } from 'vitest'

import { parseWooCallback, signWooState, verifyWooState, WOO_STATE_TTL_MS, wooAuthorizeUrl } from './one-click'

const key = Buffer.alloc(32, 7)
const otherKey = Buffer.alloc(32, 9)
const base = { accountId: 'acc-1', userId: 'user-1', storeUrl: 'https://shop.example.com' }
const now = 1_700_000_000_000
const CK = `ck_${'a'.repeat(40)}`
const CS = `cs_${'b'.repeat(40)}`

describe('WooCommerce one-click state', () => {
  it('round-trips and carries the account, user and store', () => {
    const s = signWooState(base, now, key)
    expect(verifyWooState(s, now + 1000, key)).toEqual({ ...base, exp: now + WOO_STATE_TTL_MS })
  })

  it('rejects a tampered, foreign-key or expired state', () => {
    const s = signWooState(base, now, key)
    const [body, sig] = s.split('.')
    const forged = Buffer.from(JSON.stringify({ ...base, accountId: 'acc-evil', exp: now + 9e9 })).toString('base64url')
    expect(verifyWooState(`${forged}.${sig}`, now, key)).toBeNull()
    expect(verifyWooState(`${body}.${sig}x`, now, key)).toBeNull()
    expect(verifyWooState(s, now, otherKey)).toBeNull()
    expect(verifyWooState(s, now + WOO_STATE_TTL_MS + 1, key)).toBeNull()
    expect(verifyWooState('nonsense', now, key)).toBeNull()
    expect(verifyWooState(42, now, key)).toBeNull()
  })
})

describe('wooAuthorizeUrl', () => {
  it("points at the store's wc-auth screen with read_write scope", () => {
    const u = new URL(wooAuthorizeUrl({ storeUrl: 'https://shop.example.com/', state: 'S', returnUrl: 'https://rg/r', callbackUrl: 'https://rg/cb' }))
    expect(u.origin + u.pathname).toBe('https://shop.example.com/wc-auth/v1/authorize')
    expect(u.searchParams.get('scope')).toBe('read_write')
    expect(u.searchParams.get('user_id')).toBe('S')
    expect(u.searchParams.get('callback_url')).toBe('https://rg/cb')
  })
})

describe('parseWooCallback', () => {
  const state = signWooState(base, now, key)

  it('accepts a valid callback', () => {
    const r = parseWooCallback({ user_id: state, consumer_key: CK, consumer_secret: CS, key_permissions: 'read_write' }, now, key)
    expect(r).toMatchObject({ ok: true, consumerKey: CK, consumerSecret: CS, state: { accountId: 'acc-1' } })
  })

  it('rejects bad state, bad keys or read-only keys', () => {
    expect(parseWooCallback(null, now, key).ok).toBe(false)
    expect(parseWooCallback({ user_id: 'x', consumer_key: CK, consumer_secret: CS }, now, key).ok).toBe(false)
    expect(parseWooCallback({ user_id: state, consumer_key: 'nope', consumer_secret: CS }, now, key).ok).toBe(false)
    expect(parseWooCallback({ user_id: state, consumer_key: CK, consumer_secret: CS, key_permissions: 'read' }, now, key).ok).toBe(false)
  })
})
