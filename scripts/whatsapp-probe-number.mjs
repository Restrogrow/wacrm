// One-off probe: is phone node 1213200758539065 still alive and visible?
// Uses the newest stored token; never prints it.
// Usage: node scripts/whatsapp-probe-number.mjs [phoneId] [wabaId]

import { readFileSync } from 'fs'
import crypto from 'crypto'

const V = 'v21.0'
const phoneId = process.argv[2] ?? '1213200758539065'
const wabaId = process.argv[3] ?? '1039836645139461'

const envText = readFileSync(new URL('../.env.local', import.meta.url), 'utf8')
const env = {}
for (const line of envText.split(/\r?\n/)) {
  const m = line.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*?)\s*$/)
  if (m && !(m[1] in env)) env[m[1]] = m[2].replace(/^["']|["']$/g, '')
}

const rows = await fetch(
  `${env.NEXT_PUBLIC_SUPABASE_URL}/rest/v1/whatsapp_config?select=phone_number_id,access_token&order=connected_at.desc.nullslast&limit=1`,
  { headers: { apikey: env.SUPABASE_SERVICE_ROLE_KEY, Authorization: `Bearer ${env.SUPABASE_SERVICE_ROLE_KEY}` } }
).then(r => r.json())
const row = rows?.[0]
if (!row) { console.error('no row'); process.exit(1) }

const [ivHex, ctHex, tagHex] = row.access_token.split(':')
const d = crypto.createDecipheriv('aes-256-gcm', Buffer.from(env.ENCRYPTION_KEY, 'hex'), Buffer.from(ivHex, 'hex'))
d.setAuthTag(Buffer.from(tagHex, 'hex'))
const token = d.update(ctHex, 'hex', 'utf8') + d.final('utf8')
console.log(`(probe token from row ${row.phone_number_id}, ${token.length} chars)`)

const g = async (p) => {
  const r = await fetch(`https://graph.facebook.com/${V}/${p}`, { headers: { Authorization: `Bearer ${token}` } })
  return { s: r.status, b: await r.json().catch(() => ({})) }
}

console.log(`\n--- GET ${phoneId} (fields) ---`)
const pn = await g(`${phoneId}?fields=id,display_phone_number,verified_name,platform_type,code_verification_status`)
console.log(pn.s === 200 ? JSON.stringify(pn.b, null, 2) : `HTTP ${pn.s}: ${pn.b?.error?.message ?? JSON.stringify(pn.b)}`)

console.log(`\n--- GET ${phoneId} (bare) ---`)
const bare = await g(phoneId)
console.log(bare.s === 200 ? JSON.stringify(bare.b) : `HTTP ${bare.s}: ${bare.b?.error?.message ?? ''}`)

console.log(`\n--- GET WABA ${wabaId}/phone_numbers (is the number still in the WABA?) ---`)
const list = await g(`${wabaId}/phone_numbers?fields=id,display_phone_number,platform_type,code_verification_status`)
console.log(list.s === 200 ? JSON.stringify(list.b, null, 2) : `HTTP ${list.s}: ${list.b?.error?.message ?? ''}`)
