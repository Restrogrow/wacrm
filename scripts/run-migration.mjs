// Runs one or more migration files from supabase/migrations against the
// database in SUPABASE_DB_URL (read from .env.local). Each file runs in its
// own transaction, so a failing file changes nothing.
//
//   node scripts/run-migration.mjs 062_ad_attribution.sql 065_reports.sql
//
// SUPABASE_DB_URL is the Postgres connection string from
// Supabase > Project Settings > Database > Connection string (URI).
// Put it in wacrm/.env.local yourself; never paste it into chat.

import fs from 'node:fs'
import path from 'node:path'
import pg from 'pg'

const root = path.resolve(import.meta.dirname, '..')
const dir = path.join(root, 'supabase', 'migrations')

function loadEnv() {
  const file = path.join(root, '.env.local')
  if (!fs.existsSync(file)) return
  for (const line of fs.readFileSync(file, 'utf8').split(/\r?\n/)) {
    const m = /^([A-Z0-9_]+)=(.*)$/.exec(line)
    if (m && !(m[1] in process.env)) process.env[m[1]] = m[2].replace(/^["']|["']$/g, '')
  }
}

loadEnv()

const files = process.argv.slice(2)
if (files.length === 0) {
  console.error('Usage: node scripts/run-migration.mjs <NNN_name.sql> [...]')
  process.exit(2)
}
for (const f of files) {
  if (!/^\d{3}_[a-z0-9_]+\.sql$/.test(f) || !fs.existsSync(path.join(dir, f))) {
    console.error(`Not a migration file in supabase/migrations: ${f}`)
    process.exit(2)
  }
}

const url = process.env.SUPABASE_DB_URL
if (!url) {
  console.error('SUPABASE_DB_URL is not set in wacrm/.env.local. Add the Postgres connection string there first.')
  process.exit(2)
}

const client = new pg.Client({ connectionString: url, ssl: { rejectUnauthorized: false } })
await client.connect()

let failed = false
for (const f of files) {
  const sql = fs.readFileSync(path.join(dir, f), 'utf8')
  try {
    await client.query('BEGIN')
    await client.query(sql)
    await client.query('COMMIT')
    console.log(`OK   ${f}`)
  } catch (err) {
    await client.query('ROLLBACK').catch(() => {})
    console.error(`FAIL ${f}: ${err.message}${err.position ? ` (at character ${err.position})` : ''}`)
    failed = true
    break
  }
}
await client.end()
process.exit(failed ? 1 : 0)
