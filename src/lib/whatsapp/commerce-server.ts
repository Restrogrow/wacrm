// Shared helpers for the commerce API routes (server only).

import type { SupabaseClient } from '@supabase/supabase-js'

/** Record something we sent in the chat, like any outgoing message. */
export async function logOutgoing(
  db: SupabaseClient,
  args: { conversationId: string; userId: string; text: string; wamid: string | null; preview?: string },
) {
  const now = new Date().toISOString()
  await db.from('messages').insert({
    conversation_id: args.conversationId,
    sender_type: 'agent',
    sender_id: args.userId,
    content_type: 'text',
    content_text: args.text,
    message_id: args.wamid,
    status: 'sent',
    created_at: now,
  })
  await db
    .from('conversations')
    .update({ last_message_text: args.preview ?? args.text.split('\n')[0], last_message_at: now })
    .eq('id', args.conversationId)
}
