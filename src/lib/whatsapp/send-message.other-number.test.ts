import { describe, expect, it, vi } from 'vitest';
import type { SupabaseClient } from '@supabase/supabase-js';

vi.mock('@/lib/billing/server', () => ({ accountCanSend: async () => true }));

import { sendMessageToConversation, SendMessageError } from './send-message';

// conversations.single → the chat; whatsapp_config.single → the connected number.
function db(chatNumber: string | null, connectedNumber: string): SupabaseClient {
  return {
    from(table: string) {
      const builder = {
        select: () => builder,
        eq: () => builder,
        single: async () =>
          table === 'conversations'
            ? { data: { id: 'cv-1', phone_number_id: chatNumber, contact: { phone: '+919876543210' } }, error: null }
            : { data: { id: 'cfg', phone_number_id: connectedNumber, access_token: 'x' }, error: null },
      };
      return builder;
    },
  } as unknown as SupabaseClient;
}

describe('sendMessageToConversation — chats of a swapped-out number (migration 083)', () => {
  it('refuses to continue a chat of a number that is no longer connected', async () => {
    const err = await sendMessageToConversation(db('pn-1', 'pn-2'), 'acct-1', {
      conversationId: 'cv-1',
      messageType: 'text',
      contentText: 'hi',
    }).catch((e) => e);
    expect(err).toBeInstanceOf(SendMessageError);
    expect((err as SendMessageError).code).toBe('other_number');
    expect((err as SendMessageError).status).toBe(409);
  });

  it('gets past the number check for a chat of the current number', async () => {
    const err = await sendMessageToConversation(db('pn-2', 'pn-2'), 'acct-1', {
      conversationId: 'cv-1',
      messageType: 'text',
      contentText: 'hi',
    }).catch((e) => e);
    // fails later (fake token), but not on the number check
    expect((err as SendMessageError | undefined)?.code).not.toBe('other_number');
  });
});
