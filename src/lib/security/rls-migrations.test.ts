// ============================================================
// Account isolation guard: replays every migration in order and checks
// the FINAL state of row-level security:
//
//   1. every table created in `public` has RLS enabled;
//   2. every remaining policy is scoped — it mentions
//      is_account_member(...), auth.uid() or a join through a table
//      that does — unless it's on the explicit allowlist below.
//
// A new table without RLS, or a policy like `USING (true)`, fails CI
// before it can leak one business's data to another.
// ============================================================

import fs from 'node:fs'
import path from 'node:path'
import { describe, expect, it } from 'vitest'

const MIGRATIONS_DIR = path.join(process.cwd(), 'supabase', 'migrations')

/** Policies that are intentionally not account-scoped, with the reason. */
const ALLOWED_UNSCOPED: Record<string, string> = {
  // Public media buckets: Meta must download media from a public URL
  // to deliver it, and object paths are random per account. Uploads and
  // deletes stay account-scoped.
  'storage.objects.Avatars are publicly readable': 'profile pictures shown in the app',
  'storage.objects.Chat media is publicly readable': 'WhatsApp fetches outgoing media by URL',
  'storage.objects.Flow media is publicly readable': 'WhatsApp fetches flow media by URL',
  'storage.objects.Blog media is publicly readable': 'images in published blog posts; uploads are service-role only',
  'storage.objects.Catalog media is publicly readable': 'product photos Meta fetches into the WhatsApp catalog; uploads are service-role only',
}

/** Tables that intentionally have no RLS (none today). */
const RLS_EXEMPT = new Set<string>()

function stripComments(sql: string): string {
  return sql.replace(/--[^\n]*/g, '').replace(/\/\*[\s\S]*?\*\//g, '')
}

/** Split into statements, keeping $$-quoted bodies intact. */
function statements(sql: string): string[] {
  const out: string[] = []
  let cur = ''
  let inDollar = false
  for (let i = 0; i < sql.length; i++) {
    if (sql.startsWith('$$', i)) {
      inDollar = !inDollar
      cur += '$$'
      i++
      continue
    }
    const ch = sql[i]
    if (ch === ';' && !inDollar) {
      if (cur.trim()) out.push(cur.trim())
      cur = ''
    } else {
      cur += ch
    }
  }
  if (cur.trim()) out.push(cur.trim())
  return out
}

const ident = (s: string) => s.replace(/"/g, '').replace(/^public\./i, '').toLowerCase()

interface State {
  tables: Set<string>
  rls: Set<string>
  /** table → policy name → policy SQL */
  policies: Map<string, Map<string, string>>
}

function replay(): State {
  const state: State = { tables: new Set(), rls: new Set(), policies: new Map() }
  const files = fs
    .readdirSync(MIGRATIONS_DIR)
    .filter((f) => f.endsWith('.sql'))
    .sort()

  for (const file of files) {
    const sql = stripComments(fs.readFileSync(path.join(MIGRATIONS_DIR, file), 'utf8'))
    for (const stmt of statements(sql)) {
      const s = stmt.replace(/\s+/g, ' ')
      let m: RegExpMatchArray | null

      if ((m = s.match(/^CREATE TABLE (?:IF NOT EXISTS )?([\w."]+)/i))) {
        state.tables.add(ident(m[1]))
      } else if ((m = s.match(/^DROP TABLE (?:IF EXISTS )?([\w."]+)/i))) {
        const t = ident(m[1])
        state.tables.delete(t)
        state.rls.delete(t)
        state.policies.delete(t)
      } else if ((m = s.match(/^ALTER TABLE (?:IF EXISTS )?(?:ONLY )?([\w."]+) ENABLE ROW LEVEL SECURITY/i))) {
        state.rls.add(ident(m[1]))
      } else if ((m = s.match(/^ALTER TABLE (?:IF EXISTS )?(?:ONLY )?([\w."]+) DISABLE ROW LEVEL SECURITY/i))) {
        state.rls.delete(ident(m[1]))
      } else if ((m = s.match(/^CREATE POLICY ("[^"]+"|\w+) ON ([\w."]+)/i))) {
        const table = ident(m[2])
        if (!state.policies.has(table)) state.policies.set(table, new Map())
        state.policies.get(table)!.set(m[1].replace(/"/g, ''), s)
      } else if ((m = s.match(/^DROP POLICY (?:IF EXISTS )?("[^"]+"|\w+) ON ([\w."]+)/i))) {
        state.policies.get(ident(m[2]))?.delete(m[1].replace(/"/g, ''))
      }
    }

    // Policies created inside DO $$ … $$ loops (migration 017 builds
    // policies for many tables dynamically) are scoped by construction;
    // RLS enabled the same way is picked up from the table list.
    const loop = sql.match(/FOREACH\s+\w+\s+IN\s+ARRAY\s+ARRAY\[([\s\S]*?)\][\s\S]*?ENABLE ROW LEVEL SECURITY/i)
    if (loop) {
      for (const t of loop[1].matchAll(/'([\w.]+)'/g)) state.rls.add(ident(t[1]))
    }
  }
  return state
}

const SCOPED = /is_account_member\s*\(|auth\.uid\s*\(\)|is_platform_admin\s*\(/i

describe('row-level security (final migration state)', () => {
  const state = replay()

  it('finds the schema', () => {
    expect(state.tables.size).toBeGreaterThan(40)
    expect(state.tables.has('contacts')).toBe(true)
  })

  it('every table has RLS enabled', () => {
    const missing = [...state.tables].filter((t) => !state.rls.has(t) && !RLS_EXEMPT.has(t)).sort()
    expect(missing).toEqual([])
  })

  it('every policy is scoped to the account or the user', () => {
    const unscoped: string[] = []
    for (const [table, policies] of state.policies) {
      for (const [name, sql] of policies) {
        const key = `${table}.${name}`
        if (ALLOWED_UNSCOPED[key]) continue
        // A RESTRICTIVE policy only narrows what the scoped permissive
        // policies already allow (e.g. migration 083's current-number filter).
        if (/\bAS RESTRICTIVE\b/i.test(sql)) continue
        // A policy body references another policy-protected table via
        // EXISTS (SELECT … FROM other WHERE … is_account_member …) —
        // fine; a bare `true` or no condition at all is not.
        if (!SCOPED.test(sql)) unscoped.push(`${key}: ${sql.slice(0, 160)}`)
      }
    }
    expect(unscoped).toEqual([])
  })

  it('no policy grants everyone access with a bare true', () => {
    const open: string[] = []
    for (const [table, policies] of state.policies) {
      for (const [name, sql] of policies) {
        if (/USING \(\s*true\s*\)|WITH CHECK \(\s*true\s*\)/i.test(sql) && !ALLOWED_UNSCOPED[`${table}.${name}`]) {
          open.push(`${table}.${name}`)
        }
      }
    }
    expect(open).toEqual([])
  })
})
