// Data access for contacts. Everything runs as the signed-in user, so Postgres
// row-level security scopes it to their account; account_id filters are belt and braces.
import { supabase } from '@/lib/supabase';
import { safeSearch, toStoredPhone } from '@/features/dashboard/fmt';

export interface Tag {
  id: string;
  name: string;
  color: string;
}

export interface Contact {
  id: string;
  name: string | null;
  phone: string;
  email: string | null;
  company: string | null;
  created_at: string;
  opted_out_at: string | null;
  ad_source_type: string | null;
  ad_headline: string | null;
  ad_source_url: string | null;
  account_id: string;
}

export interface ContactRow extends Contact {
  tags: Tag[];
}

export interface Segment {
  id: string;
  name: string;
  rules: unknown;
  contact_count: number;
}

export type ContactFilter = {
  search: string;
  tagIds: string[];
  segment: Segment | null;
  sort: 'newest' | 'name';
};

export const PAGE_SIZE = 40;

const CONTACT_COLS =
  'id, name, phone, email, company, created_at, opted_out_at, ad_source_type, ad_headline, ad_source_url, account_id';

export async function loadTags(): Promise<Tag[]> {
  const { data, error } = await supabase.from('tags').select('id, name, color').order('name');
  if (error) throw new Error(error.message);
  return (data ?? []) as Tag[];
}

export async function loadSegments(accountId: string): Promise<Segment[]> {
  const { data, error } = await supabase.rpc('segments_with_counts', { p_account_id: accountId });
  if (error) {
    // The segments feature is optional; hide it quietly when it isn't available.
    return [];
  }
  return ((data ?? []) as Segment[]).map((s) => ({ ...s, contact_count: Number(s.contact_count) }));
}

async function attachTags(contacts: Contact[], allTags: Tag[]): Promise<ContactRow[]> {
  if (contacts.length === 0) return [];
  const byId = new Map(allTags.map((t) => [t.id, t]));
  const { data } = await supabase
    .from('contact_tags')
    .select('contact_id, tag_id')
    .in('contact_id', contacts.map((c) => c.id));
  const map = new Map<string, Tag[]>();
  for (const r of (data ?? []) as { contact_id: string; tag_id: string }[]) {
    const tag = byId.get(r.tag_id);
    if (!tag) continue;
    const list = map.get(r.contact_id) ?? [];
    list.push(tag);
    map.set(r.contact_id, list);
  }
  return contacts.map((c) => ({ ...c, tags: map.get(c.id) ?? [] }));
}

export async function listContacts(
  accountId: string,
  filter: ContactFilter,
  offset: number,
  allTags: Tag[],
): Promise<{ rows: ContactRow[]; total: number }> {
  const term = safeSearch(filter.search);
  let contacts: Contact[] = [];
  let total = 0;

  if (filter.segment) {
    const { data, error } = await supabase.rpc('segment_contacts', {
      p_account_id: accountId,
      p_rules: filter.segment.rules,
      p_search: term || null,
      p_limit: PAGE_SIZE,
      p_offset: offset,
    });
    if (error) throw new Error(error.message);
    const rows = (data ?? []) as { contact: Contact; total_count: number }[];
    contacts = rows.map((r) => r.contact);
    total = rows[0] ? Number(rows[0].total_count) : 0;
  } else if (filter.tagIds.length > 0) {
    const { data, error } = await supabase.rpc('filter_contacts_by_tags', {
      p_tag_ids: filter.tagIds,
      p_search: term || null,
      p_limit: PAGE_SIZE,
      p_offset: offset,
    });
    if (error) throw new Error(error.message);
    const rows = (data ?? []) as { contact: Contact; total_count: number }[];
    contacts = rows.map((r) => r.contact);
    total = rows[0] ? Number(rows[0].total_count) : 0;
  } else {
    let q = supabase
      .from('contacts')
      .select(CONTACT_COLS, { count: 'exact' })
      .eq('account_id', accountId)
      .range(offset, offset + PAGE_SIZE - 1);
    q = filter.sort === 'name' ? q.order('name', { ascending: true, nullsFirst: false }) : q.order('created_at', { ascending: false });
    if (term) {
      const like = `%${term}%`;
      q = q.or(`name.ilike.${like},phone.ilike.${like},email.ilike.${like}`);
    }
    const { data, count, error } = await q;
    if (error) throw new Error(error.message);
    contacts = (data ?? []) as Contact[];
    total = count ?? contacts.length;
  }
  return { rows: await attachTags(contacts, allTags), total };
}

// ---------------------------------------------------------------- create / edit

export interface DuplicateHit {
  id: string;
  name: string | null;
  phone: string;
}

/** Same rule as the web: last-8-digit prefilter, then exact digits or trunk-variant match. */
export async function findDuplicate(accountId: string, phone: string): Promise<DuplicateHit | null> {
  const digits = phone.replace(/\D/g, '');
  if (digits.length < 6) return null;
  const suffix = digits.length >= 8 ? digits.slice(-8) : digits;
  const { data } = await supabase
    .from('contacts')
    .select('id, name, phone')
    .eq('account_id', accountId)
    .like('phone', `%${suffix}`)
    .limit(5);
  for (const c of (data ?? []) as DuplicateHit[]) {
    const other = c.phone.replace(/\D/g, '');
    if (other === digits || (other.length >= 8 && digits.length >= 8 && other.slice(-8) === digits.slice(-8))) return c;
  }
  return null;
}

/** Friendly text for the errors the database can return when saving a contact. */
export function describeSaveError(err: unknown): string {
  const e = err as { code?: string; message?: string } | null;
  if (e?.code === 'PL001' && e.message) return e.message; // plan limit trigger
  if (e?.code === '23505') return 'A contact with this phone number already exists.';
  if (e?.code === '42501') return 'You do not have permission to do that.';
  if (e?.code === '23503') return 'This contact is still linked to other records, so it cannot be deleted right now.';
  return e?.message || 'Something went wrong. Please try again.';
}

export async function createContact(input: {
  accountId: string;
  userId: string;
  name: string;
  phoneRaw: string;
  email: string;
  company: string;
  tagIds: string[];
}): Promise<string> {
  const phone = toStoredPhone(input.phoneRaw);
  if (!phone) throw { message: 'Enter a valid phone number with country code, e.g. +91 98765 43210.' };
  const { data, error } = await supabase
    .from('contacts')
    .insert({
      user_id: input.userId,
      account_id: input.accountId,
      name: input.name.trim() || null,
      phone,
      email: input.email.trim() || null,
      company: input.company.trim() || null,
    })
    .select('id')
    .single();
  if (error) throw error;
  if (input.tagIds.length > 0) {
    const { error: tagErr } = await supabase
      .from('contact_tags')
      .insert(input.tagIds.map((tag_id) => ({ contact_id: data.id, tag_id })));
    if (tagErr) throw tagErr;
  }
  return data.id as string;
}
