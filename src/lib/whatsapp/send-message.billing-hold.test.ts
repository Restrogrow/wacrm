import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { SupabaseClient } from '@supabase/supabase-js';

vi.mock('@/lib/billing/server', () => ({ accountCanSend: async () => true }));
vi.mock('@/lib/whatsapp/encryption', () => ({
  decrypt: () => 'token',
  encrypt: (s: string) => s,
  isLegacyFormat: () => false,
}));

const meta = vi.hoisted(() => ({
  sendTemplateMessage: vi.fn(),
  sendTextMessage: vi.fn(),
}));
vi.mock('@/lib/whatsapp/meta-api', async (orig) => ({
  ...(await orig<typeof import('@/lib/whatsapp/meta-api')>()),
  sendTemplateMessage: meta.sendTemplateMessage,
  sendTextMessage: meta.sendTextMessage,
}));

const hold = vi.hoisted(() => ({
  queueHeldMessage: vi.fn(async () => 'held-row-1'),
  startBillingHold: vi.fn(async () => {}),
}));
vi.mock('@/lib/whatsapp/billing-hold', async (orig) => ({
  ...(await orig<typeof import('@/lib/whatsapp/billing-hold')>()),
  queueHeldMessage: hold.queueHeldMessage,
  startBillingHold: hold.startBillingHold,
}));

import { sendMessageToConversation, SendMessageError } from './send-message';

const PAYMENT_ERROR = new Error('(#131042) Business eligibility payment issue');

/** conversations / whatsapp_config / message_templates reads; writes succeed. */
function db(billingHoldAt: string | null): SupabaseClient {
  return {
    from(table: string) {
      const builder: Record<string, unknown> = {
        select: () => builder,
        eq: () => builder,
        insert: () => builder,
        update: () => builder,
        single: async () => {
          if (table === 'conversations') {
            return { data: { id: 'cv-1', phone_number_id: 'pn-1', contact: { id: 'ct-1', phone: '+919876543210' } }, error: null };
          }
          if (table === 'whatsapp_config') {
            return { data: { id: 'cfg', phone_number_id: 'pn-1', access_token: 'x', billing_hold_at: billingHoldAt }, error: null };
          }
          return { data: { id: 'msg-1' }, error: null };
        },
        maybeSingle: async () => ({ data: null, error: null }),
        then: (ok: (v: unknown) => unknown) => Promise.resolve({ data: null, error: null }).then(ok),
      };
      return builder;
    },
  } as unknown as SupabaseClient;
}

const template = { conversationId: 'cv-1', messageType: 'template', templateName: 'order_update' };

describe('sendMessageToConversation — billing hold (migration 091)', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    meta.sendTemplateMessage.mockResolvedValue({ messageId: 'wamid.OK' });
    meta.sendTextMessage.mockResolvedValue({ messageId: 'wamid.TXT' });
  });

  it('holds a template without calling Meta while the account is on hold', async () => {
    const result = await sendMessageToConversation(db('2026-10-29T10:00:00Z'), 'acct-1', template);
    expect(result).toEqual({ messageId: 'held-row-1', whatsappMessageId: '', held: true });
    expect(meta.sendTemplateMessage).not.toHaveBeenCalled();
    expect(hold.queueHeldMessage).toHaveBeenCalledWith('acct-1', expect.objectContaining({ templateName: 'order_update' }));
  });

  it('still sends free replies (text) during a hold', async () => {
    const result = await sendMessageToConversation(db('2026-10-29T10:00:00Z'), 'acct-1', {
      conversationId: 'cv-1',
      messageType: 'text',
      contentText: 'hi',
    });
    expect(result.held).toBeUndefined();
    expect(meta.sendTextMessage).toHaveBeenCalled();
  });

  it('turns a 131042 from Meta into a hold instead of an error', async () => {
    meta.sendTemplateMessage.mockRejectedValue(PAYMENT_ERROR);
    const result = await sendMessageToConversation(db(null), 'acct-1', template);
    expect(result.held).toBe(true);
    expect(hold.startBillingHold).toHaveBeenCalledWith('acct-1', PAYMENT_ERROR.message);
    expect(hold.queueHeldMessage).toHaveBeenCalledTimes(1);
  });

  it('reports billing_hold to the release job instead of holding twice', async () => {
    meta.sendTemplateMessage.mockRejectedValue(PAYMENT_ERROR);
    const err = await sendMessageToConversation(db(null), 'acct-1', {
      ...template,
      releasingHeld: { messageRowId: 'held-row-1' },
    }).catch((e) => e);
    expect(err).toBeInstanceOf(SendMessageError);
    expect((err as SendMessageError).code).toBe('billing_hold');
    expect(hold.queueHeldMessage).not.toHaveBeenCalled();
  });

  it('sends past the hold when releasing, and other Meta errors still fail', async () => {
    const released = await sendMessageToConversation(db('2026-10-29T10:00:00Z'), 'acct-1', {
      ...template,
      releasingHeld: { messageRowId: 'held-row-1' },
    });
    expect(released.whatsappMessageId).toBe('wamid.OK');

    meta.sendTemplateMessage.mockRejectedValue(new Error('Template name does not exist'));
    const err = await sendMessageToConversation(db(null), 'acct-1', template).catch((e) => e);
    expect((err as SendMessageError).code).toBe('meta_error');
    expect(hold.queueHeldMessage).not.toHaveBeenCalled();
  });
});
