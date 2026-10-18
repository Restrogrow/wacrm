// Data access for the inbox. Reads go straight to Supabase (row-level security scopes everything to
// the signed-in user's account); writes that need the server go through api().
import { supabase } from '@/lib/supabase';

import { sanitizeSearch } from './format';
import type {
  InboxConversation,
  InboxFilter,
  InboxMessage,
  InboxNote,
  InboxReaction,
  Member,
  MessageTemplate,
  SavedReply,
} from './types';

export const CONVERSATIONS_PAGE = 30;
export const MESSAGES_PAGE = 40;

export const CONVERSATION_SELECT =
  'id, contact_id, status, assigned_agent_id, last_message_text, last_message_at, unread_count, created_at, ' +
  'contact:contacts(id, name, phone, email, company, avatar_url, opted_out_at, ad_source_type, ad_headline)';

interface ListOptions {
  filter: InboxFilter;
  userId: string | null;
  offset: number;
}

type Row = Record<string, unknown>;

export function normalizeConversation(row: Row): InboxConversation {
  const contact = Array.isArray(row.contact) ? (row.contact[0] ?? null) : (row.contact ?? null);
  return { ...(row as object), contact, unread_count: Number(row.unread_count ?? 0) } as InboxConversation;
}

/** One page of conversations (newest activity first) for the active filter. Returns one extra row to detect "more". */
export async function fetchConversations({ filter, userId, offset }: ListOptions) {
  let q = supabase
    .from('conversations')
    .select(CONVERSATION_SELECT)
    .order('last_message_at', { ascending: false, nullsFirst: false })
    .order('id', { ascending: false })
    .range(offset, offset + CONVERSATIONS_PAGE);

  if (filter === 'mine') q = userId ? q.eq('assigned_agent_id', userId) : q.limit(0);
  else if (filter === 'unassigned') q = q.is('assigned_agent_id', null);
  else if (filter === 'unread') q = q.gt('unread_count', 0);
  else if (filter === 'open' || filter === 'pending' || filter === 'closed') q = q.eq('status', filter);

  const { data, error } = await q;
  if (error) throw new Error(error.message);
  const rows = ((data ?? []) as unknown as Row[]).map(normalizeConversation);
  return { rows: rows.slice(0, CONVERSATIONS_PAGE), hasMore: rows.length > CONVERSATIONS_PAGE };
}

/** Search by contact name/phone or by last message text. Two small queries merged (PostgREST cannot OR across tables). */
export async function searchConversations(raw: string, filter: InboxFilter, userId: string | null) {
  const term = sanitizeSearch(raw);
  if (!term) return [] as InboxConversation[];
  const like = `%${term}%`;

  const base = () => {
    let q = supabase.from('conversations').select(CONVERSATION_SELECT).order('last_message_at', { ascending: false, nullsFirst: false }).limit(40);
    if (filter === 'mine') q = userId ? q.eq('assigned_agent_id', userId) : q.limit(0);
    else if (filter === 'unassigned') q = q.is('assigned_agent_id', null);
    else if (filter === 'unread') q = q.gt('unread_count', 0);
    else if (filter === 'open' || filter === 'pending' || filter === 'closed') q = q.eq('status', filter);
    return q;
  };

  const [byContact, byText] = await Promise.all([
    supabase
      .from('conversations')
      .select(CONVERSATION_SELECT.replace('contact:contacts(', 'contact:contacts!inner('))
      .or(`name.ilike.${like},phone.ilike.${like}`, { referencedTable: 'contacts' })
      .order('last_message_at', { ascending: false, nullsFirst: false })
      .limit(40),
    base().ilike('last_message_text', like),
  ]);
  if (byContact.error && byText.error) throw new Error(byContact.error.message);

  const merged = new Map<string, InboxConversation>();
  for (const r of [...((byContact.data ?? []) as unknown as Row[]), ...((byText.data ?? []) as unknown as Row[])]) {
    const c = normalizeConversation(r);
    // The contact query ignores the filter, so apply it here for those rows.
    if (filter === 'mine' && c.assigned_agent_id !== userId) continue;
    if (filter === 'unassigned' && c.assigned_agent_id) continue;
    if (filter === 'unread' && c.unread_count <= 0) continue;
    if ((filter === 'open' || filter === 'pending' || filter === 'closed') && c.status !== filter) continue;
    merged.set(c.id, c);
  }
  return [...merged.values()].sort((a, b) => (b.last_message_at ?? '').localeCompare(a.last_message_at ?? ''));
}

export async function fetchConversation(id: string): Promise<InboxConversation | null> {
  const { data, error } = await supabase.from('conversations').select(CONVERSATION_SELECT).eq('id', id).maybeSingle();
  if (error) throw new Error(error.message);
  return data ? normalizeConversation(data as unknown as Row) : null;
}

/** Newest-first page of messages. */
export async function fetchMessages(conversationId: string, offset: number) {
  const { data, error } = await supabase
    .from('messages')
    .select('*')
    .eq('conversation_id', conversationId)
    .order('created_at', { ascending: false })
    .range(offset, offset + MESSAGES_PAGE);
  if (error) throw new Error(error.message);
  const rows = (data ?? []) as unknown as InboxMessage[];
  return { rows: rows.slice(0, MESSAGES_PAGE), hasMore: rows.length > MESSAGES_PAGE };
}

export async function fetchMessage(id: string): Promise<InboxMessage | null> {
  const { data } = await supabase.from('messages').select('*').eq('id', id).maybeSingle();
  return (data as unknown as InboxMessage | null) ?? null;
}

export async function fetchNotes(conversationId: string): Promise<InboxNote[]> {
  const { data, error } = await supabase
    .from('conversation_notes')
    .select('id, conversation_id, author_id, body, mentions, created_at')
    .eq('conversation_id', conversationId)
    .order('created_at', { ascending: false })
    .limit(200);
  if (error) return []; // notes are optional (migration 067); never block the thread
  return (data ?? []) as unknown as InboxNote[];
}

export async function fetchReactions(conversationId: string): Promise<InboxReaction[]> {
  const { data } = await supabase
    .from('message_reactions')
    .select('id, message_id, conversation_id, actor_type, emoji')
    .eq('conversation_id', conversationId)
    .limit(500);
  return (data ?? []) as unknown as InboxReaction[];
}

export async function fetchMembers(): Promise<Member[]> {
  const { data } = await supabase.from('profiles').select('user_id, full_name, email, account_role').order('full_name');
  return (data ?? []) as unknown as Member[];
}

export async function fetchSavedReplies(): Promise<SavedReply[]> {
  const { data } = await supabase.from('saved_replies').select('id, shortcut, title, body').order('title').limit(200);
  return (data ?? []) as unknown as SavedReply[];
}

export async function fetchApprovedTemplates(): Promise<MessageTemplate[]> {
  const { data, error } = await supabase
    .from('message_templates')
    .select('id, name, language, category, header_type, header_content, body_text, footer_text, buttons, status')
    .eq('status', 'APPROVED')
    .order('created_at', { ascending: false });
  if (error) throw new Error(error.message);
  return (data ?? []) as unknown as MessageTemplate[];
}

export async function markRead(conversationId: string) {
  await supabase.from('conversations').update({ unread_count: 0 }).eq('id', conversationId);
}

export async function markUnread(conversationId: string) {
  await supabase.from('conversations').update({ unread_count: 1 }).eq('id', conversationId);
}

export async function setStatus(conversationId: string, status: 'open' | 'pending' | 'closed') {
  const { error } = await supabase.from('conversations').update({ status }).eq('id', conversationId);
  if (error) throw new Error(error.message);
}

export async function setAssignee(conversationId: string, agentId: string | null) {
  const { error } = await supabase.from('conversations').update({ assigned_agent_id: agentId }).eq('id', conversationId);
  if (error) throw new Error(error.message);
}
