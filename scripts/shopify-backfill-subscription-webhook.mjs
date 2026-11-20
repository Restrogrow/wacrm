// One-off backfill for the Shopify Billing API work (migration 102,
// lib/shopify/billing.ts).
//
// registerWebhooks() only runs when a store connects or reconnects, so
// every OAuth-connected store that connected *before* today only has
// the order/fulfillment/checkout/app-uninstalled subscriptions — not
// APP_SUBSCRIPTIONS_UPDATE. Without it, Shopify never tells us when a
// merchant approves (or loses) a subscription, so the plan would never
// actually change. This adds just that one topic to every active OAuth
// store, without touching the others (webhookSubscriptionCreate is
// idempotent — "already exists" is treated as success, same as
// registerWebhooks() does).
//
// Safe to re-run. Run once after pasting migration 102:
//   node scripts/shopify-backfill-subscription-webhook.mjs

import { readFileSync } from 'fs'
import crypto from 'crypto'

const SHOPIFY_API_VERSION = '2026-10' // keep in sync with lib/shopify/config.ts

// --- load .env.local ---
const envText = readFileSync(new URL('../.env.local', import.meta.url), 'utf8')
const env = {}
for (const line of envText.split(/\r?\n/)) {
  const m = line.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*?)\s*$/)
  if (m) env[m[1]] = m[2].replace(/^["']|["']$/g, '')
}

const {
  ENCRYPTION_KEY: encryptionKey,
  NEXT_PUBLIC_SUPABASE_URL: supaUrl,
  SUPABASE_SERVICE_ROLE_KEY: serviceKey,
  SHOPIFY_API_KEY: clientId,
  SHOPIFY_API_SECRET: clientSecret,
  NEXT_PUBLIC_SITE_URL: siteUrl,
} = env

for (const [k, v] of Object.entries({
  ENCRYPTION_KEY: encryptionKey,
  NEXT_PUBLIC_SUPABASE_URL: supaUrl,
  SUPABASE_SERVICE_ROLE_KEY: serviceKey,
  SHOPIFY_API_KEY: clientId,
  SHOPIFY_API_SECRET: clientSecret,
  NEXT_PUBLIC_SITE_URL: siteUrl,
})) {
  if (!v) {
    console.error(`Missing ${k} in .env.local`)
    process.exit(1)
  }
}

const webhookUri = `${siteUrl.replace(/\/+$/, '')}/api/integrations/shopify/webhooks`

// --- lib/whatsapp/encryption.ts, duplicated (plain .mjs can't import TS) ---
function decrypt(encryptedText) {
  const parts = encryptedText.split(':')
  if (parts.length === 3) {
    const [ivHex, ctHex, tagHex] = parts
    const decipher = crypto.createDecipheriv(
      'aes-256-gcm',
      Buffer.from(encryptionKey, 'hex'),
      Buffer.from(ivHex, 'hex')
    )
    decipher.setAuthTag(Buffer.from(tagHex, 'hex'))
    return decipher.update(ctHex, 'hex', 'utf8') + decipher.final('utf8')
  }
  if (parts.length === 2) {
    const [ivHex, ctHex] = parts
    const decipher = crypto.createDecipheriv(
      'aes-256-cbc',
      Buffer.from(encryptionKey, 'hex'),
      Buffer.from(ivHex, 'hex')
    )
    return decipher.update(ctHex, 'hex', 'utf8') + decipher.final('utf8')
  }
  throw new Error('Unrecognised encrypted-token format')
}

function encrypt(text) {
  const iv = crypto.randomBytes(12)
  const cipher = crypto.createCipheriv('aes-256-gcm', Buffer.from(encryptionKey, 'hex'), iv)
  const encrypted = cipher.update(text, 'utf8', 'hex') + cipher.final('hex')
  return `${iv.toString('hex')}:${encrypted}:${cipher.getAuthTag().toString('hex')}`
}

async function supabase(path, init = {}) {
  const res = await fetch(`${supaUrl}/rest/v1/${path}`, {
    ...init,
    headers: {
      apikey: serviceKey,
      Authorization: `Bearer ${serviceKey}`,
      'Content-Type': 'application/json',
      ...(init.headers || {}),
    },
  })
  if (!res.ok) throw new Error(`Supabase ${path} → HTTP ${res.status}: ${await res.text()}`)
  return res.status === 204 ? null : res.json()
}

async function refreshAccessToken(shop, refreshToken) {
  const res = await fetch(`https://${shop}/admin/oauth/access_token`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded', Accept: 'application/json' },
    body: new URLSearchParams({
      client_id: clientId,
      client_secret: clientSecret,
      grant_type: 'refresh_token',
      refresh_token: refreshToken,
    }).toString(),
  })
  const json = await res.json().catch(() => ({}))
  if (!res.ok || !json.access_token) {
    throw new Error(json.error_description || json.error || `HTTP ${res.status}`)
  }
  return {
    accessToken: json.access_token,
    expiresAt: json.expires_in ? new Date(Date.now() + json.expires_in * 1000).toISOString() : null,
  }
}

async function subscribeAppSubscriptionsUpdate(shop, accessToken) {
  const res = await fetch(`https://${shop}/admin/api/${SHOPIFY_API_VERSION}/graphql.json`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'X-Shopify-Access-Token': accessToken },
    body: JSON.stringify({
      query: `mutation($topic: WebhookSubscriptionTopic!, $webhookSubscription: WebhookSubscriptionInput!) {
        webhookSubscriptionCreate(topic: $topic, webhookSubscription: $webhookSubscription) {
          webhookSubscription { id }
          userErrors { field message }
        }
      }`,
      variables: {
        topic: 'APP_SUBSCRIPTIONS_UPDATE',
        webhookSubscription: { uri: webhookUri },
      },
    }),
  })
  const json = await res.json().catch(() => ({}))
  if (!res.ok || json.errors) {
    throw new Error(Array.isArray(json.errors) ? json.errors.map((e) => e.message).join('; ') : `HTTP ${res.status}`)
  }
  const errors = json.data.webhookSubscriptionCreate.userErrors.filter(
    (e) => !/already been taken|already exists/i.test(e.message)
  )
  if (errors.length > 0) throw new Error(errors.map((e) => e.message).join('; '))
}

async function main() {
  const stores = await supabase(
    'shopify_stores?connection_type=eq.oauth&status=eq.active&select=id,shop_domain,access_token,refresh_token,access_token_expires_at'
  )
  console.log(`${stores.length} active OAuth-connected store(s) to update.\n`)

  let ok = 0
  let failed = 0
  for (const store of stores) {
    try {
      let accessToken = decrypt(store.access_token)
      const expiresAt = store.access_token_expires_at ? Date.parse(store.access_token_expires_at) : null
      if ((!expiresAt || expiresAt - Date.now() <= 60_000) && store.refresh_token) {
        const refreshed = await refreshAccessToken(store.shop_domain, decrypt(store.refresh_token))
        accessToken = refreshed.accessToken
        await supabase(`shopify_stores?id=eq.${store.id}`, {
          method: 'PATCH',
          body: JSON.stringify({
            access_token: encrypt(refreshed.accessToken),
            access_token_expires_at: refreshed.expiresAt,
            updated_at: new Date().toISOString(),
          }),
        })
      }
      await subscribeAppSubscriptionsUpdate(store.shop_domain, accessToken)
      console.log(`OK    ${store.shop_domain}`)
      ok++
    } catch (err) {
      console.error(`FAIL  ${store.shop_domain} — ${err instanceof Error ? err.message : err}`)
      failed++
    }
  }
  console.log(`\n${ok} succeeded, ${failed} failed.`)
  process.exit(failed > 0 ? 1 : 0)
}

main()
