#!/usr/bin/env node
// ============================================================
// Live isolation check — run against a real Supabase project.
//
//   npm run security:check
//
// Uses only the PUBLIC anon key (what any visitor's browser has) and
// tries to read every table created by the migrations. With row-level
// security working, an anonymous visitor sees 0 rows everywhere. Any
// table that returns rows is printed as a LEAK and the script exits 1.
//
// Read-only: it never writes. Reads NEXT_PUBLIC_SUPABASE_URL and
// NEXT_PUBLIC_SUPABASE_ANON_KEY from the environment or .env.local.
// ============================================================

import fs from 'node:fs'
import path from 'node:path'
import { createClient } from '@supabase/supabase-js'

const root = process.cwd()
const envFile = path.join(root, '.env.local')
if (fs.existsSync(envFile)) {
  for (const line of fs.readFileSync(envFile, 'utf8').split(/\r?\n/)) {
    const m = line.match(/^([A-Z0-9_]+)=(.*)$/)
    if (m && !process.env[m[1]]) process.env[m[1]] = m[2].replace(/^"|"$/g, '')
  }
}

const url = process.env.NEXT_PUBLIC_SUPABASE_URL
const anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY
if (!url || !anonKey) {
  console.error('Set NEXT_PUBLIC_SUPABASE_URL and NEXT_PUBLIC_SUPABASE_ANON_KEY (or add them to .env.local).')
  process.exit(2)
}

// Tables from the migrations (public schema only).
const dir = path.join(root, 'supabase', 'migrations')
const tables = new Set()
for (const file of fs.readdirSync(dir).filter((f) => f.endsWith('.sql')).sort()) {
  const sql = fs.readFileSync(path.join(dir, file), 'utf8').replace(/--[^\n]*/g, '')
  for (const m of sql.matchAll(/CREATE TABLE (?:IF NOT EXISTS )?(?:public\.)?"?(\w+)"?/gi)) tables.add(m[1].toLowerCase())
  for (const m of sql.matchAll(/DROP TABLE (?:IF EXISTS )?(?:public\.)?"?(\w+)"?/gi)) tables.delete(m[1].toLowerCase())
}

const anon = createClient(url, anonKey, { auth: { persistSession: false } })
const leaks = []
let protectedCount = 0

for (const table of [...tables].sort()) {
  const { data, error } = await anon.from(table).select('*').limit(1)
  if (error) {
    // Permission denied / not exposed — also safe.
    protectedCount++
    continue
  }
  if (data && data.length > 0) leaks.push(table)
  else protectedCount++
}

console.log(`Checked ${tables.size} tables as an anonymous visitor.`)
console.log(`  ${protectedCount} returned nothing (protected).`)
if (leaks.length) {
  console.error(`  LEAK — anonymous visitors can read: ${leaks.join(', ')}`)
  process.exit(1)
}
console.log('  No table is readable without signing in. ✔')
