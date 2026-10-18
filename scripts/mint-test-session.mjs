// Dev helper: prints a short-lived Supabase access token for the demo ADMIN account so the
// mobile app / API can be tested without solving the login captcha.
//   node scripts/mint-test-session.mjs            -> prints the access token only
// Uses the service-role key from .env.local; never run it against data you care about.
import fs from 'node:fs'
import path from 'node:path'
import { createClient } from '@supabase/supabase-js'

const root = path.resolve(import.meta.dirname, '..')
const env = Object.fromEntries(
  fs.readFileSync(path.join(root, '.env.local'), 'utf8').split(/\r?\n/)
    .filter((l) => /^[A-Z_0-9]+=/.test(l))
    .map((l) => [l.split('=')[0], l.slice(l.indexOf('=') + 1).replace(/^["']|["']$/g, '')]),
)
const email = process.env.TEST_EMAIL || 'support.repeatgrow+anjali@gmail.com'
const admin = createClient(env.NEXT_PUBLIC_SUPABASE_URL, env.SUPABASE_SERVICE_ROLE_KEY)
const { data: link, error } = await admin.auth.admin.generateLink({ type: 'magiclink', email })
if (error) { console.error(error.message); process.exit(1) }
const anon = createClient(env.NEXT_PUBLIC_SUPABASE_URL, env.NEXT_PUBLIC_SUPABASE_ANON_KEY)
const { data, error: e2 } = await anon.auth.verifyOtp({ type: 'magiclink', token_hash: link.properties.hashed_token })
if (e2) { console.error(e2.message); process.exit(1) }
process.stdout.write(data.session.access_token)
