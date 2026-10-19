// Broadcasts from the app.
//
// The website sends "now" broadcasts from the browser in batches; a phone
// can be backgrounded mid-send, so the app instead saves the broadcast as
// a scheduled one (web migration 043) and the server's every-minute cron
// sends it — "Send now" is simply scheduled a minute ahead. It is saved
// as a draft first and switched to 'scheduled' only after all recipients
// are in, so the cron never picks up a half-built list. Same tables,
// same counts, same opt-out and plan rules as the web wizard.
import { supabase } from '@/lib/supabase';
import type { MessageTemplate } from '@/features/inbox/types';
import { extractVariableIndices } from '@/features/inbox/format';

export type BroadcastStatus = 'draft' | 'scheduled' | 'sending' | 'sent' | 'failed';

export interface Broadcast {
  id: string;
  name: string;
  template_name: string;
  status: BroadcastStatus;
  scheduled_at: string | null;
  created_at: string;
  total_recipients: number;
  sent_count: number;
  delivered_count: number;
  read_count: number;
  replied_count: number;
  failed_count: number;
}

export interface RecipientRow {
  id: string;
  status: 'pending' | 'sent' | 'delivered' | 'read' | 'replied' | 'failed';
  error_message: string | null;
  contact: { id: string; name: string | null; phone: string } | null;
}

const COLUMNS =
  'id, name, template_name, status, scheduled_at, created_at, total_recipients, sent_count, delivered_count, read_count, replied_count, failed_count';

export async function listBroadcasts(): Promise<Broadcast[]> {
  const { data, error } = await supabase.from('broadcasts').select(COLUMNS).order('created_at', { ascending: false }).limit(100);
  if (error) throw new Error(error.message);
  return (data ?? []) as Broadcast[];
}

export async function getBroadcast(id: string): Promise<Broadcast | null> {
  const { data, error } = await supabase.from('broadcasts').select(COLUMNS).eq('id', id).maybeSingle();
  if (error) throw new Error(error.message);
  return (data as Broadcast | null) ?? null;
}

export async function getRecipients(broadcastId: string, limit = 200): Promise<RecipientRow[]> {
  const { data, error } = await supabase
    .from('broadcast_recipients')
    .select('id, status, error_message, contact:contacts(id, name, phone)')
    .eq('broadcast_id', broadcastId)
    .order('created_at', { ascending: true })
    .limit(limit);
  if (error) throw new Error(error.message);
  return ((data ?? []) as unknown as (RecipientRow & { contact: RecipientRow['contact'] | RecipientRow['contact'][] })[]).map((r) => ({
    ...r,
    contact: Array.isArray(r.contact) ? (r.contact[0] ?? null) : r.contact,
  }));
}

/** Cancel a broadcast the server hasn't started yet. */
export async function cancelScheduled(id: string) {
  const { error } = await supabase.from('broadcasts').delete().eq('id', id).eq('status', 'scheduled');
  if (error) throw new Error(error.message);
}

// ---------- Audience ----------

export type Audience = { type: 'all' } | { type: 'tags'; tagIds: string[] };

interface AudienceContact {
  id: string;
  name: string | null;
  phone: string;
}

const PAGE = 1000;
const MAX_RECIPIENTS = 10000;

async function pagedContacts(ids?: string[]): Promise<AudienceContact[]> {
  const out: AudienceContact[] = [];
  if (ids) {
    for (let i = 0; i < ids.length; i += 300) {
      const { data, error } = await supabase.from('contacts').select('id, name, phone, opted_out_at').in('id', ids.slice(i, i + 300));
      if (error) throw new Error(error.message);
      out.push(...((data ?? []) as (AudienceContact & { opted_out_at: string | null })[]).filter((c) => !c.opted_out_at));
    }
    return out;
  }
  for (let from = 0; from < MAX_RECIPIENTS; from += PAGE) {
    const { data, error } = await supabase
      .from('contacts')
      .select('id, name, phone, opted_out_at')
      .order('created_at', { ascending: true })
      .range(from, from + PAGE - 1);
    if (error) throw new Error(error.message);
    const rows = (data ?? []) as (AudienceContact & { opted_out_at: string | null })[];
    out.push(...rows.filter((c) => !c.opted_out_at));
    if (rows.length < PAGE) break;
  }
  return out;
}

/** The contacts a broadcast would go to (opted-out contacts are left out). */
export async function resolveAudience(audience: Audience): Promise<AudienceContact[]> {
  let contacts: AudienceContact[];
  if (audience.type === 'all') {
    contacts = await pagedContacts();
  } else {
    if (audience.tagIds.length === 0) return [];
    const { data, error } = await supabase.from('contact_tags').select('contact_id').in('tag_id', audience.tagIds);
    if (error) throw new Error(error.message);
    const ids = [...new Set((data ?? []).map((r: { contact_id: string }) => r.contact_id))];
    contacts = await pagedContacts(ids);
  }
  return contacts.filter((c) => !!c.phone?.replace(/\D/g, ''));
}

// ---------- Variables ----------

/** Each {{n}}: the contact's first name (with a fallback), or the same text for everyone. */
export type VariableChoice = { kind: 'name'; fallback: string } | { kind: 'text'; text: string };

export function variableSlots(template: MessageTemplate): number[] {
  return extractVariableIndices(template.body_text);
}

function firstName(name: string | null): string {
  const n = (name ?? '').trim();
  if (!n || /^\+?[\d\s-]+$/.test(n)) return '';
  return n.split(/\s+/)[0];
}

export function paramsFor(contact: { name: string | null }, slots: number[], choices: Record<number, VariableChoice>): string[] {
  return slots.map((n) => {
    const c = choices[n] ?? { kind: 'text', text: '' };
    return c.kind === 'name' ? firstName(contact.name) || c.fallback.trim() || 'there' : c.text.trim();
  });
}

// ---------- Create ----------

export async function createBroadcast(input: {
  accountId: string;
  userId: string;
  name: string;
  template: MessageTemplate;
  audience: Audience;
  choices: Record<number, VariableChoice>;
  /** When the server should send it; "now" = a minute ahead. */
  sendAt: Date;
}): Promise<{ id: string; recipients: number }> {
  const contacts = await resolveAudience(input.audience);
  if (contacts.length === 0) throw new Error('No contacts in this audience (contacts who opted out are skipped).');
  if (contacts.length > MAX_RECIPIENTS) throw new Error(`The app can send to up to ${MAX_RECIPIENTS} contacts at once. Use the website for bigger lists.`);

  const slots = variableSlots(input.template);
  const templateVariables = Object.fromEntries(
    slots.map((n) => {
      const c = input.choices[n];
      return [String(n), c?.kind === 'name' ? { type: 'field', value: 'name' } : { type: 'static', value: c?.kind === 'text' ? c.text : '' }];
    }),
  );

  const { data: broadcast, error } = await supabase
    .from('broadcasts')
    .insert({
      user_id: input.userId,
      account_id: input.accountId,
      name: input.name.trim(),
      template_name: input.template.name,
      template_language: input.template.language ?? 'en_US',
      template_variables: templateVariables,
      audience_filter: input.audience.type === 'all' ? { type: 'all' } : { type: 'tags', tagIds: input.audience.tagIds },
      // Draft until every recipient is saved; the server only picks up 'scheduled'.
      status: 'draft',
      scheduled_at: input.sendAt.toISOString(),
      total_recipients: contacts.length,
      sent_count: 0,
      delivered_count: 0,
      read_count: 0,
      replied_count: 0,
      failed_count: 0,
    })
    .select('id')
    .single();
  if (error || !broadcast) {
    const msg = error?.message ?? '';
    if (/limit|plan/i.test(msg)) throw new Error('Your plan’s broadcast limit is reached. Check Plan & billing on the website.');
    throw new Error(`Could not save the broadcast: ${msg || 'unknown error'}`);
  }

  const rows = contacts.map((c) => ({
    broadcast_id: broadcast.id,
    contact_id: c.id,
    status: 'pending' as const,
    params: paramsFor(c, slots, input.choices),
  }));
  for (let i = 0; i < rows.length; i += 200) {
    const { error: e } = await supabase.from('broadcast_recipients').insert(rows.slice(i, i + 200));
    if (e) {
      // Don't leave a half-built broadcast that the server would send.
      await supabase.from('broadcasts').delete().eq('id', broadcast.id);
      throw new Error(`Could not save the recipients: ${e.message}`);
    }
  }
  const { error: schedErr } = await supabase
    .from('broadcasts')
    .update({ status: 'scheduled', scheduled_at: new Date(Math.max(input.sendAt.getTime(), Date.now() + 30_000)).toISOString() })
    .eq('id', broadcast.id);
  if (schedErr) {
    await supabase.from('broadcasts').delete().eq('id', broadcast.id);
    throw new Error(`Could not schedule the broadcast: ${schedErr.message}`);
  }
  return { id: broadcast.id as string, recipients: contacts.length };
}

export const STATUS_LABEL: Record<BroadcastStatus, string> = {
  draft: 'Draft',
  scheduled: 'Scheduled',
  sending: 'Sending',
  sent: 'Sent',
  failed: 'Failed',
};
