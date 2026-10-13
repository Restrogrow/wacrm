// ============================================================
// Contacts → CSV export.
//
// toCsv / csvCell are pure (unit-tested). exportContacts() runs in the
// browser with the signed-in user's Supabase client, so RLS scopes it
// to their account; it pages through contacts, joins tags and custom
// field values, and returns the CSV text.
//
// Cells that start with = + - @ (or tab / CR) are prefixed with "'" so
// a spreadsheet never runs a customer-supplied value as a formula.
// ============================================================

import type { SupabaseClient } from '@supabase/supabase-js';

const FORMULA_START = /^[=+\-@\t\r]/;

export function csvCell(value: unknown): string {
  if (value === null || value === undefined) return '';
  let s = String(value);
  if (FORMULA_START.test(s)) s = `'${s}`;
  return /[",\r\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
}

export function toCsv(header: string[], rows: unknown[][]): string {
  // Leading BOM so Excel opens UTF-8 (₹, Hindi names) correctly.
  return (
    '﻿' +
    [header, ...rows].map((row) => row.map(csvCell).join(',')).join('\r\n') +
    '\r\n'
  );
}

const PAGE = 1000;

interface ContactRow {
  id: string;
  name: string | null;
  phone: string | null;
  email: string | null;
  company: string | null;
  opted_out_at?: string | null;
  created_at: string;
  contact_tags?: { tags: { name: string } | null }[] | null;
}

/** All of the account's contacts as CSV text, plus the row count. */
export async function exportContacts(
  supabase: SupabaseClient
): Promise<{ csv: string; count: number }> {
  const contacts: ContactRow[] = [];
  for (let from = 0; ; from += PAGE) {
    const { data, error } = await supabase
      .from('contacts')
      .select(
        'id, name, phone, email, company, opted_out_at, created_at, contact_tags(tags(name))'
      )
      .order('created_at', { ascending: true })
      .range(from, from + PAGE - 1);
    if (error) throw new Error(error.message);
    contacts.push(...((data ?? []) as unknown as ContactRow[]));
    if (!data || data.length < PAGE) break;
  }

  const { data: fields } = await supabase
    .from('custom_fields')
    .select('id, field_name')
    .order('created_at', { ascending: true });
  const fieldList = (fields ?? []) as { id: string; field_name: string }[];

  // Custom values, fetched per chunk of contact ids (URL length limit).
  const values = new Map<string, Map<string, string>>();
  if (fieldList.length > 0) {
    for (let i = 0; i < contacts.length; i += 200) {
      const ids = contacts.slice(i, i + 200).map((c) => c.id);
      const { data } = await supabase
        .from('contact_custom_values')
        .select('contact_id, custom_field_id, value')
        .in('contact_id', ids);
      for (const v of (data ?? []) as {
        contact_id: string;
        custom_field_id: string;
        value: string | null;
      }[]) {
        if (!values.has(v.contact_id)) values.set(v.contact_id, new Map());
        values.get(v.contact_id)!.set(v.custom_field_id, v.value ?? '');
      }
    }
  }

  const header = [
    'Name',
    'Phone',
    'Email',
    'Company',
    'Tags',
    ...fieldList.map((f) => f.field_name),
    'Opted out',
    'Created',
  ];
  const rows = contacts.map((c) => [
    c.name,
    c.phone ? (c.phone.startsWith('+') ? c.phone : `+${c.phone}`) : '',
    c.email,
    c.company,
    (c.contact_tags ?? [])
      .map((t) => t.tags?.name)
      .filter(Boolean)
      .join('; '),
    ...fieldList.map((f) => values.get(c.id)?.get(f.id) ?? ''),
    c.opted_out_at ? 'Yes' : 'No',
    c.created_at ? new Date(c.created_at).toISOString().slice(0, 10) : '',
  ]);

  return { csv: toCsv(header, rows), count: contacts.length };
}
