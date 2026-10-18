import { supabase } from '@/lib/supabase';
import type { Contact, Tag } from './data';

export interface CustomValue {
  field_name: string;
  value: string | null;
}
export interface Note {
  id: string;
  note_text: string;
  created_at: string;
  user_id: string;
}
export interface ConversationLite {
  id: string;
  status: 'open' | 'pending' | 'closed';
  last_message_text: string | null;
  last_message_at: string | null;
  unread_count: number | null;
  created_at: string;
}
export interface DealLite {
  id: string;
  title: string;
  value: number;
  currency: string | null;
  status: string | null;
  stage_id: string;
  pipeline_id: string;
  created_at: string;
}
export interface OrderLite {
  id: string;
  reference_id: string | null;
  total: number | null;
  currency: string | null;
  status: string | null;
  payment_status: string | null;
  created_at: string;
}

export interface ContactDetail {
  contact: Contact;
  tags: Tag[];
  custom: CustomValue[];
}

const COLS =
  'id, name, phone, email, company, created_at, opted_out_at, ad_source_type, ad_headline, ad_source_url, account_id';

export async function getContactDetail(id: string): Promise<ContactDetail | null> {
  const { data, error } = await supabase.from('contacts').select(COLS).eq('id', id).maybeSingle();
  if (error) throw new Error(error.message);
  if (!data) return null;

  const [tagRes, customRes] = await Promise.all([
    supabase.from('contact_tags').select('tags(id, name, color)').eq('contact_id', id),
    supabase.from('contact_custom_values').select('value, custom_fields(field_name)').eq('contact_id', id),
  ]);
  const tags = ((tagRes.data ?? []) as unknown as { tags: Tag | Tag[] | null }[])
    .map((r) => (Array.isArray(r.tags) ? r.tags[0] : r.tags))
    .filter((t): t is Tag => !!t);
  const custom = ((customRes.data ?? []) as unknown as { value: string | null; custom_fields: { field_name: string } | { field_name: string }[] | null }[])
    .map((r) => {
      const f = Array.isArray(r.custom_fields) ? r.custom_fields[0] : r.custom_fields;
      return f ? { field_name: f.field_name, value: r.value } : null;
    })
    .filter((x): x is CustomValue => !!x && !!x.value);
  return { contact: data as Contact, tags, custom };
}

export async function getNotes(contactId: string): Promise<Note[]> {
  const { data, error } = await supabase
    .from('contact_notes')
    .select('id, note_text, created_at, user_id')
    .eq('contact_id', contactId)
    .order('created_at', { ascending: false })
    .limit(50);
  if (error) throw new Error(error.message);
  return (data ?? []) as Note[];
}

export async function getConversations(contactId: string): Promise<ConversationLite[]> {
  const { data, error } = await supabase
    .from('conversations')
    .select('id, status, last_message_text, last_message_at, unread_count, created_at')
    .eq('contact_id', contactId)
    .order('last_message_at', { ascending: false, nullsFirst: false })
    .limit(20);
  if (error) throw new Error(error.message);
  return (data ?? []) as ConversationLite[];
}

export async function getDeals(contactId: string): Promise<DealLite[]> {
  const { data, error } = await supabase
    .from('deals')
    .select('id, title, value, currency, status, stage_id, pipeline_id, created_at')
    .eq('contact_id', contactId)
    .order('created_at', { ascending: false })
    .limit(20);
  if (error) throw new Error(error.message);
  return ((data ?? []) as DealLite[]).map((d) => ({ ...d, value: Number(d.value) }));
}

export async function getOrders(contactId: string): Promise<OrderLite[]> {
  const { data, error } = await supabase
    .from('whatsapp_orders')
    .select('id, reference_id, total, currency, status, payment_status, created_at')
    .eq('contact_id', contactId)
    .order('created_at', { ascending: false })
    .limit(10);
  if (error) throw new Error(error.message);
  // whatsapp_orders.total is stored in paise (same as the web app).
  return ((data ?? []) as OrderLite[]).map((o) => ({ ...o, total: o.total === null ? null : Number(o.total) / 100 }));
}

export async function addNote(input: { accountId: string; userId: string; contactId: string; text: string }): Promise<Note> {
  const { data, error } = await supabase
    .from('contact_notes')
    .insert({ contact_id: input.contactId, user_id: input.userId, account_id: input.accountId, note_text: input.text.trim() })
    .select('id, note_text, created_at, user_id')
    .single();
  if (error) throw error;
  return data as Note;
}

export async function updateContactFields(
  id: string,
  fields: { name: string; email: string; company: string },
): Promise<void> {
  const { error } = await supabase
    .from('contacts')
    .update({
      name: fields.name.trim() || null,
      email: fields.email.trim() || null,
      company: fields.company.trim() || null,
      updated_at: new Date().toISOString(),
    })
    .eq('id', id);
  if (error) throw error;
}

export async function addTag(contactId: string, tagId: string): Promise<void> {
  const { error } = await supabase.from('contact_tags').insert({ contact_id: contactId, tag_id: tagId });
  if (error && error.code !== '23505') throw error;
}

export async function removeTag(contactId: string, tagId: string): Promise<void> {
  const { error } = await supabase.from('contact_tags').delete().eq('contact_id', contactId).eq('tag_id', tagId);
  if (error) throw error;
}

export async function deleteContact(id: string): Promise<void> {
  const { error } = await supabase.from('contacts').delete().eq('id', id);
  if (error) throw error;
}
