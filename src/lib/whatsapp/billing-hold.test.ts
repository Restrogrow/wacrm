import { describe, expect, it, vi } from 'vitest';

vi.mock('@/lib/flows/admin-client', () => ({ supabaseAdmin: () => ({}) }));

import { heldParams, isBillingError, PAYMENT_ERROR_CODE } from './billing-hold';

describe('isBillingError', () => {
  it('matches the 131042 code', () => {
    expect(isBillingError(PAYMENT_ERROR_CODE)).toBe(true);
  });
  it("matches Meta's payment error messages", () => {
    expect(isBillingError(new Error('(#131042) Business eligibility payment issue'))).toBe(true);
    expect(isBillingError('Message failed to send because there were one or more errors related to your payment issue')).toBe(true);
  });
  it('ignores other errors', () => {
    expect(isBillingError(131026)).toBe(false);
    expect(isBillingError(new Error('(#130429) Rate limit hit'))).toBe(false);
    expect(isBillingError(new Error('Template name does not exist in the translation'))).toBe(false);
    expect(isBillingError(null)).toBe(false);
  });
});

describe('heldParams', () => {
  it('keeps what is needed to send again, as plain JSON', () => {
    const p = heldParams({
      conversationId: 'conv-1',
      messageType: 'template',
      templateName: 'order_update',
      templateLanguage: 'en',
      templateMessageParams: { body: ['Asha', '#1001'] },
      planExempt: true,
    });
    expect(p).toEqual({
      conversationId: 'conv-1',
      messageType: 'template',
      contentText: null,
      mediaUrl: null,
      filename: null,
      templateName: 'order_update',
      templateLanguage: 'en',
      templateParams: [],
      templateMessageParams: { body: ['Asha', '#1001'] },
      interactive: null,
      planExempt: true,
      replyToMessageId: null,
      senderId: null,
      senderType: 'agent',
    });
  });

  it('drops internal and unknown fields', () => {
    const p = heldParams({
      conversationId: 'c',
      messageType: 'template',
      releasingHeld: { messageRowId: 'x' },
      allowedTypes: ['text'],
    } as never);
    expect(p).not.toHaveProperty('releasingHeld');
    expect(p).not.toHaveProperty('allowedTypes');
  });
});
