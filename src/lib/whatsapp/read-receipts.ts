// ============================================================
// Read receipts and "typing…" for customers. Server-only.
//
// Meta only shows blue ticks when the business marks a message read;
// marking the newest customer message read also marks every earlier
// one. Used when an agent opens a chat (/api/whatsapp/read), while an
// agent types (typing: true, throttled by the client) and before the AI
// chatbot answers. Best-effort: never throws, returns whether Meta
// accepted it.
// ============================================================

import type { SupabaseClient } from '@supabase/supabase-js';

import { decrypt } from '@/lib/whatsapp/encryption';
import { markMessageRead } from '@/lib/whatsapp/meta-api';

/** Meta refuses read receipts for messages older than 30 days. */
const MAX_AGE_MS = 30 * 24 * 60 * 60 * 1000;

export async function markConversationRead(
  db: SupabaseClient,
  accountId: string,
  conversationId: string,
  opts: { typing?: boolean } = {},
): Promise<boolean> {
  try {
    const [{ data: conv }, { data: config }, { data: latest }] = await Promise.all([
      db
        .from('conversations')
        .select('id, phone_number_id')
        .eq('id', conversationId)
        .eq('account_id', accountId)
        .maybeSingle(),
      db
        .from('whatsapp_config')
        .select('phone_number_id, access_token')
        .eq('account_id', accountId)
        .maybeSingle(),
      db
        .from('messages')
        .select('message_id, created_at')
        .eq('conversation_id', conversationId)
        .eq('sender_type', 'customer')
        .not('message_id', 'is', null)
        .order('created_at', { ascending: false })
        .limit(1)
        .maybeSingle(),
    ]);
    if (!conv || !config?.phone_number_id || !config.access_token || !latest?.message_id) {
      return false;
    }
    // A chat from a number the account has since swapped out (migration
    // 083) can't be marked from the new number.
    if (conv.phone_number_id && conv.phone_number_id !== config.phone_number_id) return false;
    if (Date.now() - Date.parse(latest.created_at as string) > MAX_AGE_MS) return false;

    await markMessageRead({
      phoneNumberId: config.phone_number_id as string,
      accessToken: decrypt(config.access_token as string),
      messageId: latest.message_id as string,
      typing: opts.typing,
    });
    return true;
  } catch (err) {
    console.warn(
      '[read-receipts] mark read failed:',
      err instanceof Error ? err.message : err,
    );
    return false;
  }
}
