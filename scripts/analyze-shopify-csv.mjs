// Usage: node scripts/analyze-shopify-csv.mjs <file.csv> [<file2.csv> ...]
// Read-only analysis of a Shopify customers export before importing it
// as Repeat Grow contacts. Reports phone coverage, dupes, consent, tags.
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

/** RFC4180-ish parser: handles quoted fields, escaped quotes, embedded newlines. */
export function parseCsv(text) {
  const rows = [];
  let row = [];
  let field = '';
  let inQuotes = false;
  // Strip BOM.
  if (text.charCodeAt(0) === 0xfeff) text = text.slice(1);

  for (let i = 0; i < text.length; i++) {
    const c = text[i];
    if (inQuotes) {
      if (c === '"') {
        if (text[i + 1] === '"') { field += '"'; i++; }
        else inQuotes = false;
      } else field += c;
      continue;
    }
    if (c === '"') { inQuotes = true; continue; }
    if (c === ',') { row.push(field); field = ''; continue; }
    if (c === '\r') continue;
    if (c === '\n') { row.push(field); rows.push(row); row = []; field = ''; continue; }
    field += c;
  }
  if (field !== '' || row.length) { row.push(field); rows.push(row); }
  return rows;
}

/** Shopify prefixes phone/id cells with ' to stop Excel mangling them. */
const cell = (v) => (v ?? '').replace(/^'/, '').trim();

const normalizePhone = (p) => (p ? p.replace(/\D/g, '') : '');

/**
 * Indian-centric phone cleanup. Shopify stores a mix of
 * "+919460940330", "09460940330", "9460940330", landlines, junk.
 * Returns E.164 digits or '' when unusable.
 */
export function toE164India(raw) {
  let d = normalizePhone(raw);
  if (!d) return '';
  // Strip international prefix 00.
  if (d.startsWith('00')) d = d.slice(2);
  // Already +91XXXXXXXXXX
  if (d.length === 12 && d.startsWith('91')) {
    return /^[6-9]/.test(d.slice(2)) ? d : '';
  }
  // 91 + trunk 0 + 10 digits
  if (d.length === 13 && d.startsWith('910')) {
    const rest = d.slice(3);
    return /^[6-9]/.test(rest) ? '91' + rest : '';
  }
  // trunk 0 + 10 digits
  if (d.length === 11 && d.startsWith('0')) {
    const rest = d.slice(1);
    return /^[6-9]/.test(rest) ? '91' + rest : '';
  }
  // bare 10-digit mobile
  if (d.length === 10) {
    return /^[6-9]/.test(d) ? '91' + d : '';
  }
  // Plausible non-India international (keep as-is, 11-15 digits).
  if (d.length >= 11 && d.length <= 15) return d;
  return '';
}

function analyze(file) {
  const rows = parseCsv(fs.readFileSync(file, 'utf8'));
  const headers = rows[0].map((h) => h.trim());
  const idx = (name) => headers.indexOf(name);

  const H = {
    id: idx('Customer ID'),
    first: idx('First Name'),
    last: idx('Last Name'),
    email: idx('Email'),
    company: idx('Default Address Company'),
    city: idx('Default Address City'),
    province: idx('Default Address Province Code'),
    country: idx('Default Address Country Code'),
    addrPhone: idx('Default Address Phone'),
    phone: idx('Phone'),
    sms: idx('Accepts SMS Marketing'),
    emailMk: idx('Accepts Email Marketing'),
    wa: idx('Accepts WhatsApp Marketing'),
    spent: idx('Total Spent'),
    orders: idx('Total Orders'),
    tags: idx('Tags'),
  };

  const stats = {
    file,
    dataRows: 0,
    hasPhoneCol: 0,
    hasAddrPhoneCol: 0,
    usablePhone: 0,
    noPhoneAtAll: 0,
    unparseablePhone: 0,
    phoneFromAddrFallback: 0,
    india: 0,
    nonIndia: 0,
    withName: 0,
    withEmail: 0,
    withCompany: 0,
    waYes: 0,
    smsYes: 0,
    emailYes: 0,
    buyers: 0,
    tagCounts: new Map(),
    countryCounts: new Map(),
  };
  const byPhone = new Map(); // e164 -> count
  const ids = new Set();

  for (let r = 1; r < rows.length; r++) {
    const row = rows[r];
    if (!row || row.length < 5) continue;
    if (row.every((v) => !cell(v))) continue;
    stats.dataRows++;

    const id = cell(row[H.id]);
    if (id) ids.add(id);

    const pRaw = cell(row[H.phone]);
    const aRaw = H.addrPhone >= 0 ? cell(row[H.addrPhone]) : '';
    if (pRaw) stats.hasPhoneCol++;
    if (aRaw) stats.hasAddrPhoneCol++;

    let e164 = toE164India(pRaw);
    if (!e164 && aRaw) {
      e164 = toE164India(aRaw);
      if (e164) stats.phoneFromAddrFallback++;
    }
    if (!pRaw && !aRaw) stats.noPhoneAtAll++;
    else if (!e164) stats.unparseablePhone++;

    if (e164) {
      stats.usablePhone++;
      byPhone.set(e164, (byPhone.get(e164) ?? 0) + 1);
      if (e164.startsWith('91') && e164.length === 12) stats.india++;
      else stats.nonIndia++;
    }

    const name = [cell(row[H.first]), cell(row[H.last])].filter(Boolean).join(' ');
    if (name) stats.withName++;
    if (cell(row[H.email])) stats.withEmail++;
    if (H.company >= 0 && cell(row[H.company])) stats.withCompany++;
    if (H.wa >= 0 && cell(row[H.wa]).toLowerCase() === 'yes') stats.waYes++;
    if (H.sms >= 0 && cell(row[H.sms]).toLowerCase() === 'yes') stats.smsYes++;
    if (H.emailMk >= 0 && cell(row[H.emailMk]).toLowerCase() === 'yes') stats.emailYes++;
    if (Number(cell(row[H.orders]) || 0) > 0) stats.buyers++;

    const cc = cell(row[H.country]) || '(blank)';
    stats.countryCounts.set(cc, (stats.countryCounts.get(cc) ?? 0) + 1);

    for (const t of cell(row[H.tags]).split(',').map((s) => s.trim()).filter(Boolean)) {
      stats.tagCounts.set(t, (stats.tagCounts.get(t) ?? 0) + 1);
    }
  }

  let dupeRows = 0;
  for (const n of byPhone.values()) if (n > 1) dupeRows += n - 1;

  return { stats, uniquePhones: byPhone, ids, dupeRows, headers };
}

// Only analyse when run directly — import-shopify-contacts.mjs imports
// parseCsv/toE164India from here and must not trigger a report.
const isEntry = process.argv[1] && fileURLToPath(import.meta.url) === path.resolve(process.argv[1]);
if (!isEntry) {
  // Imported as a library.
} else {

const results = process.argv.slice(2).map(analyze);

for (const { stats, uniquePhones, ids, dupeRows } of results) {
  const s = stats;
  console.log(`\n===== ${s.file} =====`);
  console.log(`data rows             ${s.dataRows}`);
  console.log(`unique Customer IDs   ${ids.size}`);
  console.log(`-- phones --`);
  console.log(`  "Phone" filled      ${s.hasPhoneCol}`);
  console.log(`  "Addr Phone" filled ${s.hasAddrPhoneCol}`);
  console.log(`  usable (E.164)      ${s.usablePhone}`);
  console.log(`    via addr fallback ${s.phoneFromAddrFallback}`);
  console.log(`    unique numbers    ${uniquePhones.size}  (in-file dupes: ${dupeRows})`);
  console.log(`    India / other     ${s.india} / ${s.nonIndia}`);
  console.log(`  no phone at all     ${s.noPhoneAtAll}`);
  console.log(`  phone unparseable   ${s.unparseablePhone}`);
  console.log(`-- fields --`);
  console.log(`  with name           ${s.withName}`);
  console.log(`  with email          ${s.withEmail}`);
  console.log(`  with company        ${s.withCompany}`);
  console.log(`  placed >=1 order    ${s.buyers}`);
  console.log(`-- consent --`);
  console.log(`  Accepts WhatsApp    ${s.waYes}`);
  console.log(`  Accepts SMS         ${s.smsYes}`);
  console.log(`  Accepts Email       ${s.emailYes}`);
  console.log(`-- top tags --`);
  const tags = [...s.tagCounts.entries()].sort((a, b) => b[1] - a[1]).slice(0, 12);
  for (const [t, n] of tags) console.log(`  ${String(n).padStart(6)}  ${t}`);
  console.log(`  (distinct tags: ${s.tagCounts.size})`);
  console.log(`-- countries --`);
  const cs = [...s.countryCounts.entries()].sort((a, b) => b[1] - a[1]).slice(0, 8);
  for (const [c, n] of cs) console.log(`  ${String(n).padStart(6)}  ${c}`);
}

if (results.length === 2) {
  const [a, b] = results;
  const idOverlap = [...a.ids].filter((id) => b.ids.has(id)).length;
  const phoneOverlap = [...a.uniquePhones.keys()].filter((p) => b.uniquePhones.has(p)).length;
  const union = new Set([...a.uniquePhones.keys(), ...b.uniquePhones.keys()]);
  console.log(`\n===== overlap between the two files =====`);
  console.log(`Customer IDs in both   ${idOverlap}`);
  console.log(`  only in file 1       ${a.ids.size - idOverlap}`);
  console.log(`  only in file 2       ${b.ids.size - idOverlap}`);
  console.log(`phones in both         ${phoneOverlap}`);
  console.log(`union of unique phones ${union.size}`);
}

}
