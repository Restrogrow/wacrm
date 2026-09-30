// Diagnostic v2: separate "bad token" from "bad app credentials in .env.local",
// and optionally fix the missing WABA subscription with --fix.
// Never prints the token or secrets.
//
// Usage: node scripts/whatsapp-register-diagnose2.mjs [--fix]

import { readFileSync } from 'fs'
import crypto from 'crypto'

const API_VERSION = 'v21.0'
const FIX = process.argv.includes('--fix')

const envText = readFileSync(new URL('../.env.local', import.meta.url), 'utf8')
const envEntries = [] // { key, value, line }
const env = {}
envText.split(/\r?\n/).forEach((line, i) => {
  const m = line.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*?)\s*$/)
  if (!m) return
  const value = m[2].replace(/^["']|["']$/g, '')
  envEntries.push({ key: m[1], value, line: i + 1 })
  if (!(m[1] in env)) env[m[1]] = value // first occurrence wins, like dotenv
})

const mask = (v) => (v ? `${String(v).slice(0, 4)}…(${String(v).length} chars)` : '(empty)')

// --- 0. env hygiene report ---
console.log('=== 0. .env.local key analysis ===')
for (const key of ['META_APP_ID', 'NEXT_PUBLIC_META_APP_ID', 'META_APP_SECRET', 'NEXT_PUBLIC_META_CONFIG_ID', 'ENCRYPTION_KEY']) {
  const hits = envEntries.filter(e => e.key === key)
  const distinct = [...new Set(hits.map(h => h.value))]
  const where = hits.map(h => `line ${h.line}`).join(', ')
  console.log(`${key}: ${hits.length} entry(ies) [${where}], ${distinct.length} distinct value(s) → ${distinct.map(mask).join(' | ')}`)
  if (hits.length > 1) console.log(`  ⚠ duplicate — first occurrence wins, rest are ignored (but may confuse tooling)`)
}
const { META_APP_ID: appId, META_APP_SECRET: appSecret } = env
if (!appId || !appSecret) { console.error('Missing META_APP_ID / META_APP_SECRET'); process.exit(1) }

// distinct (appId, secret) pairs — env may define conflicting combos
const pairs = [...new Set(envEntries.filter(e => e.key === 'META_APP_ID').map(e => e.value))]
  .flatMap(a => [...new Set(envEntries.filter(e => e.key === 'META_APP_SECRET').map(e => e.value))]
    .map(s => ({ appId: a, appSecret: s })))
if (pairs.length > 1) console.log(`⚠ ${pairs.length} possible (META_APP_ID, META_APP_SECRET) combinations exist — testing each below.`)

// --- fetch newest stored config + decrypt token ---
const rows = await fetch(
  `${env.NEXT_PUBLIC_SUPABASE_URL}/rest/v1/whatsapp_config?select=phone_number_id,waba_id,signup_method,status,last_registration_error,access_token&order=connected_at.desc&limit=1`,
  { headers: { apikey: env.SUPABASE_SERVICE_ROLE_KEY, Authorization: `Bearer ${env.SUPABASE_SERVICE_ROLE_KEY}` } }
).then(r => r.json())
const row = rows?.[0]
if (!row) { console.error('No whatsapp_config row'); process.exit(1) }

function decrypt(t) {
  const [ivHex, ctHex, tagHex] = t.split(':')
  const d = crypto.createDecipheriv('aes-256-gcm', Buffer.from(env.ENCRYPTION_KEY, 'hex'), Buffer.from(ivHex, 'hex'))
  d.setAuthTag(Buffer.from(tagHex, 'hex'))
  return d.update(ctHex, 'hex', 'utf8') + d.final('utf8')
}
const token = decrypt(row.access_token)
console.log(`\nStored row: signup_method=${row.signup_method} status=${row.status} phone_id=${row.phone_number_id} waba_id=${row.waba_id}`)
console.log(`Token decrypted OK (${token.length} chars, prefix ${token.slice(0, 6)}…, not printed)`)

const graph = async (path, opts = {}) => {
  const res = await fetch(`https://graph.facebook.com/${API_VERSION}/${path}`, {
    ...opts,
    headers: { Authorization: `Bearer ${token}`, ...(opts.headers || {}) },
  })
  return { status: res.status, body: await res.json().catch(() => ({})) }
}
const fail = (r) => `FAIL ${r.status}: ${r.body?.error?.message ?? JSON.stringify(r.body)}`

// --- 1. Is the USER token itself valid? (independent of app secret) ---
console.log('\n=== 1. Token validity via GET /me ===')
const me = await graph('me?fields=id,name')
console.log(me.status === 200 ? JSON.stringify(me.body) : fail(me))

console.log('\n=== 2. Granted scopes via GET /me/permissions ===')
const perms = await graph('me/permissions')
if (perms.status === 200) {
  const granted = (perms.body.data ?? []).filter(p => p.status === 'granted').map(p => p.permission)
  console.log(granted.length ? granted.join(', ') : '(none granted)')
} else {
  console.log(fail(perms))
}

// --- 3. Can the token READ the phone number with real fields? ---
console.log('\n=== 3. GET phone number fields ===')
const pn = await graph(`${row.phone_number_id}?fields=display_phone_number,verified_name,code_verification_status,platform_type,quality_rating`)
console.log(pn.status === 200 ? JSON.stringify(pn.body, null, 2) : fail(pn))

// --- 4. Can the token see the WABA? ---
console.log(`\n=== 4. GET WABA ${row.waba_id} ===`)
const waba = await graph(`${row.waba_id}?fields=name,timezone_id,message_template_namespace`)
console.log(waba.status === 200 ? JSON.stringify(waba.body) : fail(waba))

// --- 5. Which (appId, secret) pair is valid, and which app is the token scoped to? ---
console.log('\n=== 5. debug_token per (META_APP_ID, META_APP_SECRET) pair ===')
for (const p of pairs) {
  const dbg = await fetch(
    `https://graph.facebook.com/${API_VERSION}/debug_token?input_token=${encodeURIComponent(token)}`,
    { headers: { Authorization: `Bearer ${p.appId}|${p.appSecret}` } }
  ).then(r => r.json()).catch(() => ({}))
  const label = `app ${mask(p.appId)} + secret ${mask(p.appSecret)}`
  if (dbg.data) {
    console.log(`${label} → VALID. Token is scoped to app_id=${dbg.data.app_id}, expires=${dbg.data.expires_at ? new Date(dbg.data.expires_at * 1000).toISOString() : 'never'}, type=${dbg.data.type}`)
    if (String(dbg.data.app_id) !== String(p.appId)) {
      console.log(`  ⚠ Token belongs to app ${dbg.data.app_id}, NOT to ${p.appId} in your env — THAT is the app Meta sees.`)
    }
  } else {
    console.log(`${label} → INVALID: ${dbg.error?.message ?? 'unknown error'}`)
  }
}

// --- 6. Optional fix: subscribe WABA to app ---
if (FIX) {
  console.log(`\n=== 6. FIX: POST ${row.waba_id}/subscribed_apps ===`)
  const sub = await graph(`${row.waba_id}/subscribed_apps`, { method: 'POST' })
  console.log(sub.status === 200 ? JSON.stringify(sub.body) : fail(sub))
} else {
  console.log('\n(Re-run with --fix to POST /{waba_id}/subscribed_apps — idempotent, same call the app makes after embedded signup.)')
}
