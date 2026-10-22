// ============================================================
// Conversations belong to the WhatsApp number they ran on
// (migration 083). After an account swaps number 1 for number 2, a
// contact can have one conversation per number; the dashboard only sees
// the current number's (RLS), but service-role code must pick it itself.
// ============================================================

import type { SupabaseClient } from '@supabase/supabase-js';

/** The phone_number_id connected to the account right now, or null. */
export async function currentPhoneNumberId(db: SupabaseClient, accountId: string): Promise<string | null> {
  const { data } = await db
    .from('whatsapp_config')
    .select('phone_number_id')
    .eq('account_id', accountId)
    .maybeSingle();
  return (data as { phone_number_id: string | null } | null)?.phone_number_id ?? null;
}

/**
 * PostgREST `or` filter for rows of the current number (untagged rows
 * count too). Null when no number is connected: then nothing is filtered.
 */
export function currentNumberFilter(phoneNumberId: string | null): string | null {
  if (!phoneNumberId) return null;
  return `phone_number_id.is.null,phone_number_id.eq.${phoneNumberId.replace(/[^0-9A-Za-z_-]/g, '')}`;
}

/** Narrow a conversations query (select or update) to the current number's chats. */
export function onCurrentNumber<Q extends { or: (filter: string) => Q }>(query: Q, filter: string | null): Q {
  return filter ? query.or(filter) : query;
}

/** The filter for an account, in one call. */
export async function currentNumberScope(db: SupabaseClient, accountId: string): Promise<string | null> {
  return currentNumberFilter(await currentPhoneNumberId(db, accountId));
}

/**
 * The contact's conversation on the current number, or null. Should an
 * untagged chat sit next to a tagged one, the most recently active wins.
 * Pass `scope` when the caller already has it (saves a lookup). Throws on
 * a query error, so a failed read is never mistaken for "no chat yet".
 */
export async function findCurrentConversation<T = { id: string }>(
  db: SupabaseClient,
  accountId: string,
  contactId: string,
  opts: { columns?: string; scope?: string | null } = {},
): Promise<T | null> {
  const scope = opts.scope !== undefined ? opts.scope : await currentNumberScope(db, accountId);
  const { data, error } = await onCurrentNumber(
    db
      .from('conversations')
      .select(opts.columns ?? 'id')
      .eq('account_id', accountId)
      .eq('contact_id', contactId),
    scope,
  )
    .order('updated_at', { ascending: false })
    .limit(1)
    .maybeSingle();
  if (error) throw new Error(`conversation lookup failed: ${error.message}`);
  return (data as T | null) ?? null;
}

/**
 * Refuse to continue a chat of a number the account has since swapped out:
 * the message would go out from the new number but land in the old, hidden
 * chat. Same rule as the dashboard send (send-message.ts).
 */
export async function assertChatOnNumber(
  db: SupabaseClient,
  conversationId: string,
  phoneNumberId: string | null,
): Promise<void> {
  if (!phoneNumberId) return;
  const { data } = await db
    .from('conversations')
    .select('phone_number_id')
    .eq('id', conversationId)
    .maybeSingle();
  const chatNumber = (data as { phone_number_id: string | null } | null)?.phone_number_id;
  if (chatNumber && chatNumber !== phoneNumberId) {
    throw new Error('this chat belongs to a WhatsApp number that is no longer connected');
  }
}
