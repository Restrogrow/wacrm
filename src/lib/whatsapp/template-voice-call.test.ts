import { describe, expect, it } from 'vitest';

import { buildMetaTemplatePayload, VOICE_CALL_TTL_MINUTES } from './template-components';
import { buildSendComponents } from './template-send-builder';
import { validateButtons } from './template-validators';
import type { MessageTemplate } from '@/types';

// "Call on WhatsApp" (VOICE_CALL) template buttons.

describe('VOICE_CALL button — creation payload', () => {
  it('is sent to Meta as voice_call with a 7-day default TTL', () => {
    const payload = buildMetaTemplatePayload({
      name: 'book_demo_call',
      category: 'Marketing',
      language: 'en',
      body_text: 'Tap below to talk to us.',
      buttons: [{ type: 'VOICE_CALL', text: 'Call Now' }],
    });
    const buttons = payload.components.find((c) => c.type === 'BUTTONS');
    expect(buttons?.buttons).toEqual([{ type: 'voice_call', text: 'Call Now', ttl_minutes: VOICE_CALL_TTL_MINUTES }]);
  });

  it('keeps a custom TTL', () => {
    const payload = buildMetaTemplatePayload({
      name: 'x',
      category: 'Marketing',
      language: 'en',
      body_text: 'Hi',
      buttons: [{ type: 'VOICE_CALL', text: 'Call us', ttl_minutes: 43200 }],
    });
    expect(payload.components.find((c) => c.type === 'BUTTONS')?.buttons?.[0]).toMatchObject({ ttl_minutes: 43200 });
  });
});

describe('VOICE_CALL button — validation', () => {
  it('accepts one call button next to a URL button', () => {
    expect(() =>
      validateButtons([
        { type: 'VOICE_CALL', text: 'Call Now' },
        { type: 'URL', text: 'Website', url: 'https://restrogrow.com' },
      ]),
    ).not.toThrow();
  });

  it('rejects two call buttons', () => {
    expect(() =>
      validateButtons([
        { type: 'VOICE_CALL', text: 'Call' },
        { type: 'VOICE_CALL', text: 'Call again' },
      ]),
    ).toThrow(/At most 1 WhatsApp call button/);
  });

  it('rejects labels over 20 characters and bad TTLs', () => {
    expect(() => validateButtons([{ type: 'VOICE_CALL', text: 'Call our team right now' }])).toThrow(/at most 20/);
    expect(() => validateButtons([{ type: 'VOICE_CALL', text: 'Call', ttl_minutes: 60 }])).toThrow(/1 and 30 days/);
  });
});

describe('VOICE_CALL button — sending', () => {
  it('needs no send-time component', () => {
    const template = {
      id: 't',
      name: 'book_demo_call',
      language: 'en',
      category: 'Marketing',
      status: 'APPROVED',
      body_text: 'Tap below to talk to us.',
      buttons: [{ type: 'VOICE_CALL', text: 'Call Now' }],
    } as unknown as MessageTemplate;
    expect(buildSendComponents(template)).toEqual([]);
  });
});
