// Diagnostic v3: "Unsupported request - method type: post" on /register.
// Figures out what each stored ID ACTUALLY is (phone number node vs WABA node),
// whether the number is on the mobile-app platform, and whether the app is
// subscribed to the real WABA. Optionally fixes the subscription with --fix.
// Never prints the token.
//
// Usage: node scripts/whatsapp-register-diagnose3.mjs [--fix]

import { readFileSync } from 'fs'
import crypto from 'crypto'

const API_VERSION = 'v21.0'
const FIX = process.argv.includes('--fix')

const envText = readFileSync(new URL('../.env.local', import.meta.url), 'utf8')
const env = {}
for (const line of envText.split(/\r?\n/)) {
  const m = line.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*?)\s*$/)
  if (m && !(m[1] in env)) env[m[1]] = m[2].replace(/^["']|["']$/g, '')
}

const rows = await fetch(
  `${env.NEXT_PUBLIC_SUPABASE_URL}/rest/v1/whatsapp_config?select=phone_number_id,waba_id,signup_method,status,last_registration_error,access_token&order=connected_at.desc&limit=1`,
  { headers: { apikey: env.SUPABASE_SERVICE_ROLE_KEY, Authorization: `Bearer ${env.SUPABASE_SERVICE_ROLE_KEY}` } }
).then(r => r.json())
const row = rows?.[0]
if (!row) { console.error('No whatsapp_config row'); process.exit(1) }

const [ivHex, ctHex, tagHex] = row.access_token.split(':')
const d = crypto.createDecipheriv('aes-256-gcm', Buffer.from(env.ENCRYPTION_KEY, 'hex'), Buffer.from(ivHex, 'hex'))
d.setAuthTag(Buffer.from(tagHex, 'hex'))
const token = d.update(ctHex, 'hex', 'utf8') + d.final('utf8')

console.log(`Row: signup_method=${row.signup_method} status=${row.status}`)
console.log(`Stored phone_number_id=${row.phone_number_id}`)
console.log(`Stored waba_id=${row.waba_id}`)
console.log(`Token OK (${token.length} chars, prefix ${token.slice(0, 6)}…)`)
if (row.last_registration_error) console.log(`Last error: ${row.last_registration_error.slice(0, 120)}`)

const graph = async (path, opts = {}) => {
  const res = await fetch(`https://graph.facebook.com/${API_VERSION}/${path}`, {
    ...opts,
    headers: { Authorization: `Bearer ${token}`, ...(opts.headers || {}) },
  })
  return { status: res.status, body: await res.json().catch(() => ({})) }
}
const err = (r) => r.body?.error?.message ?? JSON.stringify(r.body)

// Node-type probes ---------------------------------------------------------
async function identify(id, label) {
  console.log(`\n=== Identifying ${label} ${id} ===`)

  // Phone-number-only fields
  const phone = await graph(`${id}?fields=id,display_phone_number,verified_name,platform_type,code_verification_status`)
  if (phone.status === 200 && phone.body.platform_type !== undefined) {
    console.log(`→ It IS a phone number node:`)
    console.log(JSON.stringify(phone.body, null, 2))
    return { id, type: 'phone', info: phone.body }
  }
  console.log(`  phone-fields probe: ${phone.status === 200 ? 'ambiguous' : err(phone).slice(0, 100)}`)

  // WABA-only fields
  const waba = await graph(`${id}?fields=id,name,timezone_id,message_template_namespace,business_verification_status`)
  if (waba.status === 200 && waba.body.message_template_namespace !== undefined) {
    console.log(`→ It IS a WABA node:`)
    console.log(JSON.stringify(waba.body, null, 2))
    return { id, type: 'waba', info: waba.body }
  }
  console.log(`  waba-fields probe: ${waba.status === 200 ? 'ambiguous' : err(waba).slice(0, 100)}`)

  // Phone-only edge: owning WABA
  const owner = await graph(`${id}/whatsapp_business_account?fields=id,name`)
  if (owner.status === 200 && owner.body.data) {
    console.log(`→ It IS a phone number node; owning WABA: ${JSON.stringify(owner.body.data)}`)
    return { id, type: 'phone', info: { owningWaba: owner.body.data?.[0]?.id } }
  }
  console.log(`  owning-waba probe: ${err(owner).slice(0, 100)}`)
  return { id, type: 'unknown' }
}

const a = await identify(row.phone_number_id, 'stored phone_number_id')
const b = row.waba_id && row.waba_id !== row.phone_number_id ? await identify(row.waba_id, 'stored waba_id') : null

// Conclusion ----------------------------------------------------------------
console.log('\n=== Conclusion ===')
const realPhone = a.type === 'phone' ? a : (b?.type === 'phone' ? b : null)
const realWaba = b?.type === 'waba' ? b : (a.type === 'waba' ? a : (realPhone?.info?.owningWaba ? { id: realPhone.info.owningWaba, type: 'waba(via-edge)' } : null))

if (realPhone && a.type !== 'phone') {
  console.log(`⚠ SWAPPED IDs: "phone_number_id" field holds a ${a.type}. The actual phone number ID is ${realPhone.id}.`)
}
if (realWaba && b?.type !== 'waba' && realWaba.type !== 'waba(via-edge)') {
  console.log(`⚠ SWAPPED IDs: "waba_id" field holds a ${b ? b.type : 'unknown'}. The actual WABA ID is ${realWaba.id}.`)
}
if (realPhone?.info && realPhone.info.platform_type && realPhone.info.platform_type !== 'cloud_api') {
  console.log(`⚠ platform_type=${realPhone.info.platform_type} — number is NOT on Cloud API. /register only works for cloud_api numbers.`)
}
if (!realWaba) {
  console.log('⚠ Could not identify any WABA the token can see — asset assignment in Business Settings is still missing.')
}

if (realWaba) {
  console.log(`\n=== App subscription on WABA ${realWaba.id} ===`)
  const sub = await graph(`${realWaba.id}/subscribed_apps?fields=id,name`)
  if (sub.status === 200) {
    const apps = sub.body.data ?? []
    console.log(apps.length ? `Subscribed apps: ${apps.map(x => `${x.name} (${x.id})`).join(', ')}` : 'No apps subscribed')
    const mine = apps.find(x => String(x.id) === String(env.META_APP_ID))
    console.log(mine ? '→ Your app IS subscribed' : `→ Your app ${env.META_APP_ID} is NOT subscribed`)
    if (!mine && FIX) {
      console.log('\n--- FIX: subscribing your app to the WABA (idempotent) ---')
      const post = await graph(`${realWaba.id}/subscribed_apps`, { method: 'POST' })
      console.log(post.status === 200 ? 'Subscribed OK' : `FAILED: ${err(post)}`)
    }
  } else {
    console.log(`subscribed_apps probe: ${err(sub).slice(0, 120)}`)
  }
}
