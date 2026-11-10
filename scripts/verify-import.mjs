// Usage: node scripts/verify-import.mjs <account_id>
// Read-only post-import check: totals, per-tag counts, phone sanity,
// duplicate check, and a few sample rows straight from the database.
import fs from 'node:fs';
import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';

const ROOT = fileURLToPath(new URL('..', import.meta.url)).replace(/[\\/]$/, '');
const require = createRequire(ROOT + '/package.json');
const { createClient } = require('@supabase/supabase-js');

const env = Object.fromEntries(
  fs.readFileSync(ROOT + '/.env.local', 'utf8')
    .split(/\r?\n/).filter((l) => l && !l.startsWith('#') && l.includes('='))
    .map((l) => [l.slice(0, l.indexOf('=')), l.slice(l.indexOf('=') + 1).trim()]),
);
const db = createClient(env.NEXT_PUBLIC_SUPABASE_URL, env.SUPABASE_SERVICE_ROLE_KEY, {
  auth: { autoRefreshToken: false, persistSession: false },
});

const ACCOUNT_ID = process.argv[2];

const { count: total } = await db
  .from('contacts').select('id', { count: 'exact', head: true }).eq('account_id', ACCOUNT_ID);
console.log(`contacts total        ${total}`);

const { data: tags } = await db
  .from('tags').select('id, name').eq('account_id', ACCOUNT_ID);
console.log(`\nper-tag counts:`);
for (const t of tags ?? []) {
  const { count } = await db
    .from('contact_tags').select('contact_id', { count: 'exact', head: true }).eq('tag_id', t.id);
  console.log(`  ${t.name.padEnd(16)} ${count}`);
}

// Paged full read so the checks below cover every row, not just page 1.
const all = [];
for (let from = 0; ; from += 1000) {
  const { data, error } = await db
    .from('contacts')
    .select('phone, phone_normalized, name, email, company, opted_out_at')
    .eq('account_id', ACCOUNT_ID)
    .range(from, from + 999);
  if (error) throw new Error(error.message);
  all.push(...data);
  if (data.length < 1000) break;
}
console.log(`\nrows read back        ${all.length}`);

const seen = new Map();
let dupes = 0, badPhone = 0, nonE164 = 0, withName = 0, withEmail = 0, optedOut = 0;
for (const c of all) {
  const k = c.phone_normalized;
  if (seen.has(k)) dupes++;
  else seen.set(k, c);
  if (!/^\d{10,15}$/.test(k ?? '')) badPhone++;
  if (!/^\d+$/.test(c.phone)) nonE164++;
  if (c.name) withName++;
  if (c.email) withEmail++;
  if (c.opted_out_at) optedOut++;
}
console.log(`unique numbers        ${seen.size}   (duplicates: ${dupes})`);
console.log(`phone not 10-15 digit ${badPhone}`);
console.log(`phone with non-digits ${nonE164}  (the 3 pre-existing rows are expected here)`);
console.log(`with name             ${withName}`);
console.log(`with email            ${withEmail}`);
console.log(`opted out             ${optedOut}`);

console.log(`\ncountry-code spread (first 4 digits of the 91xx space aside):`);
const cc = new Map();
for (const c of all) {
  const k = (c.phone_normalized ?? '').startsWith('91') ? '91 (India)' : (c.phone_normalized ?? '').slice(0, 3);
  cc.set(k, (cc.get(k) ?? 0) + 1);
}
for (const [k, n] of [...cc.entries()].sort((a, b) => b[1] - a[1]).slice(0, 6)) {
  console.log(`  ${String(n).padStart(6)}  ${k}`);
}

console.log(`\n5 sample rows from the database:`);
const { data: sample } = await db
  .from('contacts')
  .select('phone, name, email, contact_tags(tags(name))')
  .eq('account_id', ACCOUNT_ID)
  .limit(5);
for (const c of sample ?? []) {
  const names = (c.contact_tags ?? []).map((ct) => ct.tags?.name).filter(Boolean).join(',');
  console.log(`  ${c.phone}  ${String(c.name ?? '-').slice(0, 28).padEnd(30)} ${String(c.email ?? '-').padEnd(34)} [${names}]`);
}
