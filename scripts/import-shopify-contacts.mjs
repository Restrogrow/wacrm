// Import a Shopify customers export into Repeat Grow `contacts`.
//
// Usage:
//   node scripts/import-shopify-contacts.mjs --account <uuid> <file.csv> [more.csv ...]
//   node scripts/import-shopify-contacts.mjs --account <uuid> --apply <file.csv> ...
//
// Dry-run unless --apply is passed. Mirrors the in-app import modal
// (src/components/contacts/import-modal.tsx) so every write path agrees
// on what "same number" means:
//   * de-dupe within the file set by digits-only phone (normalizePhone),
//   * skip numbers already present in the account (phone_normalized),
//   * the UNIQUE (account_id, phone_normalized) index is the backstop —
//     a 23505 counts as skipped, not failed.
//
// Differences from the modal, on purpose:
//   * Phones are promoted to E.164 first. Shopify stores Indian numbers
//     as "09460940330" / "9460940330" / "+919460940330" interchangeably;
//     stored raw they'd be three contacts and WhatsApp sends would fail.
//   * `Phone` falls back to `Default Address Phone` (in these exports the
//     address column is the populated one for most rows).
//   * Shopify's own tags are dropped in favour of provenance tags — see
//     TAGS below. Shopify's are platform noise ("Login with Shop").
import fs from 'node:fs';
import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';
import { parseCsv, toE164India } from './analyze-shopify-csv.mjs';

const ROOT = fileURLToPath(new URL('..', import.meta.url)).replace(/[\\/]$/, '');
const require = createRequire(ROOT + '/package.json');
const { createClient } = require('@supabase/supabase-js');

// ---------- args ----------
const argv = process.argv.slice(2);
const APPLY = argv.includes('--apply');
const accIdx = argv.indexOf('--account');
if (accIdx === -1 || !argv[accIdx + 1]) {
  console.error('error: --account <uuid> is required');
  process.exit(1);
}
const ACCOUNT_ID = argv[accIdx + 1];
const FILES = argv.filter(
  (a, i) => !a.startsWith('--') && i !== accIdx + 1,
);
if (FILES.length === 0) {
  console.error('error: pass at least one CSV path');
  process.exit(1);
}

const TAGS = {
  all: { name: 'shopify-import', color: '#6366f1' },
  buyer: { name: 'buyer', color: '#22c55e' },
  subscriber: { name: 'subscriber', color: '#64748b' },
  newsletter: { name: 'newsletter', color: '#f59e0b' },
};

// ---------- db ----------
const env = Object.fromEntries(
  fs.readFileSync(ROOT + '/.env.local', 'utf8')
    .split(/\r?\n/).filter((l) => l && !l.startsWith('#') && l.includes('='))
    .map((l) => [l.slice(0, l.indexOf('=')), l.slice(l.indexOf('=') + 1).trim()]),
);
const db = createClient(env.NEXT_PUBLIC_SUPABASE_URL, env.SUPABASE_SERVICE_ROLE_KEY, {
  auth: { autoRefreshToken: false, persistSession: false },
});

const normalizeKey = (p) => (p ? p.replace(/\D/g, '') : '');
const cell = (v) => (v ?? '').replace(/^'/, '').trim();
const isUniqueViolation = (e) => e?.code === '23505';

// ---------- 1. read the account ----------
const { data: account, error: accErr } = await db
  .from('accounts')
  .select('id, name, owner_user_id, plan, trial_ends_at, plan_expires_at')
  .eq('id', ACCOUNT_ID)
  .single();
if (accErr) throw new Error('account lookup: ' + accErr.message);

console.log(`account   ${account.name}  (${account.id})`);
console.log(`owner     ${account.owner_user_id}`);
console.log(`plan      ${account.plan}${account.trial_ends_at ? `  trial_ends_at=${account.trial_ends_at}` : ''}`);
console.log(`mode      ${APPLY ? 'APPLY (writes to the database)' : 'DRY RUN (no writes)'}`);

// ---------- 2. parse every file ----------
/** phoneNormalized -> candidate row */
const candidates = new Map();
let totalDataRows = 0;
let noUsablePhone = 0;
let inFileDupes = 0;

/** Field-completeness score — decides which duplicate row survives. */
const score = (c) =>
  (c.isBuyer ? 8 : 0) + (c.email ? 4 : 0) + (c.name ? 2 : 0) + (c.company ? 1 : 0);

for (const file of FILES) {
  const rows = parseCsv(fs.readFileSync(file, 'utf8'));
  const headers = rows[0].map((h) => h.trim());
  const H = Object.fromEntries(
    ['Customer ID', 'First Name', 'Last Name', 'Email', 'Default Address Company',
     'Default Address Phone', 'Phone', 'Accepts Email Marketing', 'Total Orders', 'Tags',
    ].map((h) => [h, headers.indexOf(h)]),
  );
  let fileRows = 0;

  for (let r = 1; r < rows.length; r++) {
    const row = rows[r];
    if (!row || row.length < 5) continue;
    if (row.every((v) => !cell(v))) continue;
    fileRows++;

    const e164 =
      toE164India(cell(row[H['Phone']])) ||
      toE164India(cell(row[H['Default Address Phone']]));
    if (!e164) { noUsablePhone++; continue; }

    const key = normalizeKey(e164);
    const shopifyTags = cell(row[H['Tags']])
      .split(',').map((s) => s.trim().toLowerCase()).filter(Boolean);

    const candidate = {
      phone: e164,
      name: [cell(row[H['First Name']]), cell(row[H['Last Name']])]
        .filter(Boolean).join(' ') || null,
      email: cell(row[H['Email']]) || null,
      company: cell(row[H['Default Address Company']]) || null,
      isBuyer: Number(cell(row[H['Total Orders']]) || 0) > 0,
      isNewsletter:
        cell(row[H['Accepts Email Marketing']]).toLowerCase() === 'yes' ||
        shopifyTags.includes('newsletter'),
    };

    const prev = candidates.get(key);
    if (!prev) { candidates.set(key, candidate); continue; }

    // Same number twice: keep the better-populated row, but never lose a
    // buyer/newsletter signal that only the weaker row carried.
    inFileDupes++;
    const winner = score(candidate) > score(prev) ? candidate : prev;
    winner.isBuyer = prev.isBuyer || candidate.isBuyer;
    winner.isNewsletter = prev.isNewsletter || candidate.isNewsletter;
    winner.email ??= prev.email ?? candidate.email;
    winner.name ??= prev.name ?? candidate.name;
    winner.company ??= prev.company ?? candidate.company;
    candidates.set(key, winner);
  }

  totalDataRows += fileRows;
  console.log(`\nparsed    ${file}  → ${fileRows} data rows`);
}

// ---------- 3. drop numbers already in the account ----------
// Paged read: Supabase caps a single select at 1000 rows, so an
// unpaged read would silently "find" no existing contacts past the
// first page and then rely on the unique index to reject them.
const existing = new Set();
for (let from = 0; ; from += 1000) {
  const { data, error } = await db
    .from('contacts')
    .select('phone_normalized')
    .eq('account_id', ACCOUNT_ID)
    .range(from, from + 999);
  if (error) throw new Error('existing contacts: ' + error.message);
  for (const r of data) if (r.phone_normalized) existing.add(r.phone_normalized);
  if (data.length < 1000) break;
}

let alreadyPresent = 0;
const toInsert = [];
for (const [key, c] of candidates) {
  if (existing.has(key)) { alreadyPresent++; continue; }
  toInsert.push(c);
}

const buyers = toInsert.filter((c) => c.isBuyer).length;
const newsletter = toInsert.filter((c) => c.isNewsletter).length;

console.log(`\n--- plan ---`);
console.log(`data rows read        ${totalDataRows}`);
console.log(`no usable phone       ${noUsablePhone}  (skipped)`);
console.log(`duplicate numbers     ${inFileDupes}  (merged)`);
console.log(`already in account    ${alreadyPresent}  (skipped)`);
console.log(`contacts in account   ${existing.size} → ${existing.size + toInsert.length}`);
console.log(`TO INSERT             ${toInsert.length}`);
console.log(`  tagged buyer        ${buyers}`);
console.log(`  tagged subscriber   ${toInsert.length - buyers}`);
console.log(`  tagged newsletter   ${newsletter}`);
console.log(`  with name           ${toInsert.filter((c) => c.name).length}`);
console.log(`  with email          ${toInsert.filter((c) => c.email).length}`);

console.log(`\nsample of 5 rows to be inserted:`);
for (const c of toInsert.slice(0, 5)) {
  console.log(`  ${c.phone}  ${JSON.stringify(c.name)}  ${c.email ?? '-'}  ` +
    `[${[c.isBuyer ? 'buyer' : 'subscriber', c.isNewsletter && 'newsletter'].filter(Boolean).join(',')}]`);
}

if (!APPLY) {
  console.log(`\nDRY RUN — nothing written. Re-run with --apply to import.`);
  process.exit(0);
}

// ---------- 4. tags ----------
const tagIdByName = new Map();
for (const t of Object.values(TAGS)) {
  const { data: found } = await db
    .from('tags').select('id').eq('account_id', ACCOUNT_ID).ilike('name', t.name).limit(1);
  if (found?.length) { tagIdByName.set(t.name, found[0].id); continue; }
  const { data: made, error } = await db
    .from('tags')
    .insert({ account_id: ACCOUNT_ID, user_id: account.owner_user_id, name: t.name, color: t.color })
    .select('id').single();
  if (error) throw new Error(`tag "${t.name}": ${error.message}`);
  tagIdByName.set(t.name, made.id);
}
console.log(`\ntags ready: ${[...tagIdByName.keys()].join(', ')}`);

// ---------- 5. insert ----------
let imported = 0, skipped = 0, failed = 0;
const firstErrors = [];
const tagLinks = [];
const CHUNK = 500;

for (let i = 0; i < toInsert.length; i += CHUNK) {
  const chunk = toInsert.slice(i, i + CHUNK);
  const payload = chunk.map((c) => ({
    user_id: account.owner_user_id,
    account_id: ACCOUNT_ID,
    phone: c.phone,
    name: c.name,
    email: c.email,
    company: c.company,
  }));

  const { data, error } = await db.from('contacts').insert(payload).select('id, phone_normalized');

  if (error) {
    // Retry row by row so one bad row doesn't sink 500 good ones.
    for (let j = 0; j < payload.length; j++) {
      const { data: one, error: oneErr } = await db
        .from('contacts').insert(payload[j]).select('id').single();
      if (!oneErr && one) {
        imported++;
        queueTags(one.id, chunk[j]);
      } else if (isUniqueViolation(oneErr)) {
        skipped++;
      } else {
        failed++;
        if (firstErrors.length < 5) firstErrors.push(`${payload[j].phone}: ${oneErr?.message}`);
      }
    }
  } else {
    imported += data.length;
    // Zip by phone_normalized, not by position: a chunked INSERT's
    // RETURNING order is not worth trusting at this size.
    const byPhone = new Map(chunk.map((c) => [normalizeKey(c.phone), c]));
    for (const row of data) {
      const source = byPhone.get(row.phone_normalized);
      if (source) queueTags(row.id, source);
    }
  }

  const done = Math.min(i + CHUNK, toInsert.length);
  process.stdout.write(`\r  inserted ${imported} / ${toInsert.length}  (${done} processed)`);
}
process.stdout.write('\n');

function queueTags(contactId, c) {
  tagLinks.push({ contact_id: contactId, tag_id: tagIdByName.get(TAGS.all.name) });
  tagLinks.push({
    contact_id: contactId,
    tag_id: tagIdByName.get(c.isBuyer ? TAGS.buyer.name : TAGS.subscriber.name),
  });
  if (c.isNewsletter) {
    tagLinks.push({ contact_id: contactId, tag_id: tagIdByName.get(TAGS.newsletter.name) });
  }
}

// ---------- 6. tag assignments ----------
let tagsAssigned = 0, tagsFailed = 0;
for (let i = 0; i < tagLinks.length; i += 1000) {
  const batch = tagLinks.slice(i, i + 1000);
  // UNIQUE(contact_id, tag_id) — ignoreDuplicates keeps a re-run idempotent.
  const { error } = await db
    .from('contact_tags')
    .upsert(batch, { onConflict: 'contact_id,tag_id', ignoreDuplicates: true });
  if (error) { tagsFailed += batch.length; if (firstErrors.length < 8) firstErrors.push('tags: ' + error.message); }
  else tagsAssigned += batch.length;
  process.stdout.write(`\r  tag links ${tagsAssigned} / ${tagLinks.length}`);
}
process.stdout.write('\n');

// ---------- 7. verify ----------
const { count: finalCount } = await db
  .from('contacts').select('id', { count: 'exact', head: true }).eq('account_id', ACCOUNT_ID);

console.log(`\n--- result ---`);
console.log(`imported        ${imported}`);
console.log(`skipped (dupe)  ${skipped}`);
console.log(`failed          ${failed}`);
console.log(`tag links       ${tagsAssigned}${tagsFailed ? ` (${tagsFailed} failed)` : ''}`);
console.log(`contacts now    ${finalCount}`);
if (firstErrors.length) {
  console.log(`\nfirst errors:`);
  for (const e of firstErrors) console.log('  ' + e);
}
