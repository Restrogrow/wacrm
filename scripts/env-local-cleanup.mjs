// One-off cleanup of .env.local (v2, deterministic):
//  - For META_APP_ID / NEXT_PUBLIC_META_APP_ID: keep the LONGEST value
//    (real IDs are ~16 chars; the garbage here is 1 char / empty).
//  - Emit one authoritative line per key at the position of its first
//    occurrence; drop all other occurrences.
//  - Drop the stray `servive` line left in the file.
// Never prints secret values.
//
// Usage: node scripts/env-local-cleanup.mjs [--dry-run]

import { readFileSync, writeFileSync, copyFileSync } from 'fs'

const DRY = process.argv.includes('--dry-run')
const KEYS = new Set(['META_APP_ID', 'NEXT_PUBLIC_META_APP_ID'])
const path = new URL('../.env.local', import.meta.url)
const lines = readFileSync(path, 'utf8').split(/\r?\n/)

const mask = (v) => (v ? `${v.slice(0, 4)}…(${v.length} chars)` : '(empty)')
const parse = (line) => {
  const m = line.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*?)\s*$/)
  if (!m) return null
  return { key: m[1], value: m[2].replace(/^["']|["']$/g, '') }
}

// 1. winner per key = longest value
const winners = new Map()
const dropLines = new Set()
lines.forEach((line, i) => {
  if (line.trim() === 'servive') { dropLines.add(i); return }
  const kv = parse(line)
  if (!kv || !KEYS.has(kv.key)) return
  const cur = winners.get(kv.key)
  if (!cur || kv.value.length > cur.value.length) winners.set(kv.key, kv)
  dropLines.add(i) // drop every occurrence; winner re-inserted at first position
})

// 2. rebuild: at the FIRST occurrence index of each key, insert winner line
const firstIdx = new Map()
lines.forEach((line, i) => {
  const kv = parse(line)
  if (kv && KEYS.has(kv.key) && !firstIdx.has(kv.key)) firstIdx.set(kv.key, i)
})

const out = []
lines.forEach((line, i) => {
  if (dropLines.has(i)) {
    for (const [key, idx] of firstIdx) {
      if (idx === i && winners.has(key)) {
        out.push(`${key}=${winners.get(key).value}`)
        console.log(`kept     ${key} → ${mask(winners.get(key).value)}`)
      }
    }
    const kv = parse(line)
    if (kv && firstIdx.get(kv.key) !== i) console.log(`dropped  ${kv.key} duplicate → ${mask(kv.value)}`)
    else if (line.trim() === 'servive') console.log('dropped  stray `servive` line')
    return
  }
  out.push(line)
})

console.log(`\n${DRY ? 'DRY RUN — nothing written' : `writing ${out.length} lines (backup: .env.local.bak)`}`)
if (!DRY) {
  copyFileSync(path, new URL('../.env.local.bak', import.meta.url))
  writeFileSync(path, out.join('\n'), 'utf8')
  console.log('done')
}
