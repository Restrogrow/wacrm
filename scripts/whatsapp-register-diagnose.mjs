// Diagnostic: why does POST /{phone_number_id}/register fail?
//
// Decrypts the stored access token locally (ENCRYPTION_KEY from .env.local),
// then asks Meta what the token can and cannot see. Never prints the token.
//
// Usage: node scripts/whatsapp-register-diagnose.mjs

import { readFileSync } from 'fs'
import crypto from 'crypto'

const API_VERSION = 'v21.0'

// --- load .env.local (key names only; values stay in memory) ---
const envText = readFileSync(new URL('../.env.local', import.meta.url), 'utf8')
const env = {}
for (const line of envText.split(/\r?\n/)) {
  const m = line.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*?)\s*$/)
  if (m) env[m[1]] = m[2].replace(/^["']|["']$/g, '')
}

const {
  ENCRYPTION_KEY: key,
  NEXT_PUBLIC_SUPABASE_URL: supaUrl,
  SUPABASE_SERVICE_ROLE_KEY: serviceKey,
  META_APP_ID: appId,
  META_APP_SECRET: appSecret,
} = env

for (const [k, v] of Object.entries({ ENCRYPTION_KEY: key, SUPABASE_URL: supaUrl, SERVICE_KEY: serviceKey, META_APP_ID: appId, META_APP_SECRET: appSecret })) {
  if (!v) { console.error(`Missing ${k} in .env.local`); process.exit(1) }
}

function decrypt(t) {
  const parts = t.split(':')
  if (parts.length === 3) {
    const [ivHex, ctHex, tagHex] = parts
    const d = crypto.createDecipheriv('aes-256-gcm', Buffer.from(key, 'hex'), Buffer.from(ivHex, 'hex'))
    d.setAuthTag(Buffer.from(tagHex, 'hex'))
    return d.update(ctHex, 'hex', 'utf8') + d.final('utf8')
  }
  throw new Error('unexpected ciphertext format')
}

// --- read newest config row (metadata only) ---
const rows = await fetch(
  `${supaUrl}/rest/v1/whatsapp_config?select=phone_number_id,waba_id,business_id,signup_method,status,registered_at,last_registration_error,subscribed_apps_at,access_token&order=connected_at.desc&limit=1`,
  { headers: { apikey: serviceKey, Authorization: `Bearer ${serviceKey}` } }
).then(r => r.json())

const row = rows[0]
if (!row) { console.error('No whatsapp_config row found'); process.exit(1) }

console.log('=== Stored config ===')
console.log(JSON.stringify(row, null, 2))

let token
try {
  token = decrypt(row.access_token)
  console.log(`\nToken decrypted OK (length ${token.length}, prefix ${token.slice(0, 6)}…, not printed)`)
} catch (e) {
  console.error('Decrypt failed:', e.message)
  process.exit(1)
}

// --- Graph API helpers ---
const graph = async (path, opts = {}) => {
  const res = await fetch(`https://graph.facebook.com/${API_VERSION}/${path}`, {
    ...opts,
    headers: { Authorization: `Bearer ${token}`, ...(opts.headers || {}) },
  })
  return { status: res.status, body: await res.json().catch(() => ({})) }
}

console.log('\n=== 1. Token metadata (debug_token) ===')
const dbg = await fetch(
  `https://graph.facebook.com/${API_VERSION}/debug_token?input_token=${encodeURIComponent(token)}`,
  { headers: { Authorization: `Bearer ${appId}|${appSecret}` } }
).then(r => r.json()).catch(() => ({}))
if (dbg.data) {
  const d = dbg.data
  console.log(JSON.stringify({
    app_id: d.app_id,
    isValid: d.is_valid,
    type: d.type,
    expires_at: d.expires_at ? new Date(d.expires_at * 1000).toISOString() : 'never',
    scopes: d.scopes,
    granular_scopes: d.granular_scopes,
    user_id: d.user_id,
  }, null, 2))
} else {
  console.log(JSON.stringify(dbg, null, 2))
}

console.log('\n=== 2. Can the token see the phone number? ===')
const pn = await graph(`${row.phone_number_id}?fields=id,display_phone_number,verified_name,code_verification_status,quality_rating,platform_type`)
console.log(pn.status === 200 ? JSON.stringify(pn.body, null, 2) : `FAIL ${pn.status}: ${JSON.stringify(pn.body.error?.message ?? pn.body)}`)

let wabaId = row.waba_id
if (!wabaId && pn.status === 200) {
  const withWaba = await graph(`${row.phone_number_id}?fields=whatsapp_business_account_id`)
  wabaId = withWaba.body?.whatsapp_business_account_id
}

if (wabaId) {
  console.log(`\n=== 3. Is the app subscribed to WABA ${wabaId}? ===`)
  const sub = await graph(`${wabaId}/subscribed_apps?fields=id,name`)
  console.log(JSON.stringify(sub.body, null, 2))
  const mine = sub.body?.data?.find(a => a.id === appId)
  console.log(mine ? '→ App IS subscribed to this WABA' : `→ App ${appId} is NOT subscribed — this is the likely cause. Run: POST /${wabaId}/subscribed_apps`)
} else {
  console.log('\nCould not resolve a WABA ID for this phone number.')
}
