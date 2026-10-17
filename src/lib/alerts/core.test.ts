import { describe, expect, it } from 'vitest';

import {
  buildAlertRequest,
  formatAlertText,
  isAllowedAlertUrl,
  parseAlertEvents,
  plain,
  slackEscape,
  validateAlertTarget,
} from './core';

const TG_TOKEN = '123456789:AAEhBP0av28EJxmnY3EIjv0TaIbBnLr-abc';

describe('validateAlertTarget', () => {
  it('accepts official Slack and Discord webhook URLs', () => {
    expect(validateAlertTarget('slack', 'https://hooks.slack.com/services/T000/B000/XXXX').ok).toBe(true);
    expect(validateAlertTarget('discord', 'https://discord.com/api/webhooks/123/abc').ok).toBe(true);
    expect(validateAlertTarget('discord', 'https://canary.discord.com/api/webhooks/123/abc').ok).toBe(true);
  });

  it('rejects any other host, scheme or path', () => {
    for (const bad of [
      'http://hooks.slack.com/services/T/B/X',
      'https://evil.example.com/services/T/B/X',
      'https://hooks.slack.com.evil.com/services/T/B/X',
      'https://hooks.slack.com@evil.com/services/T/B/X',
      'https://hooks.slack.com:8443/services/T/B/X',
      'https://hooks.slack.com/other/T/B/X',
      'https://169.254.169.254/latest/meta-data',
      'https://localhost/services/x',
      'javascript:alert(1)',
      'not a url',
      '',
    ]) {
      expect(validateAlertTarget('slack', bad).ok, bad).toBe(false);
    }
    expect(validateAlertTarget('discord', 'https://hooks.slack.com/services/T/B/X').ok).toBe(false);
    expect(validateAlertTarget('discord', 'https://discord.com/other/123').ok).toBe(false);
    expect(validateAlertTarget('slack', 'https://discord.com/api/webhooks/1/a').ok).toBe(false);
  });

  it('normalises away query strings and fragments', () => {
    const r = validateAlertTarget('slack', 'https://hooks.slack.com/services/T/B/X?x=1#y');
    expect(r.ok && r.target).toBe('https://hooks.slack.com/services/T/B/X');
  });

  it('validates Telegram token and chat id', () => {
    expect(validateAlertTarget('telegram', TG_TOKEN, '-1001234567890').ok).toBe(true);
    expect(validateAlertTarget('telegram', TG_TOKEN, '@my_channel').ok).toBe(true);
    expect(validateAlertTarget('telegram', 'bad-token', '-100123').ok).toBe(false);
    expect(validateAlertTarget('telegram', TG_TOKEN, '').ok).toBe(false);
    expect(validateAlertTarget('telegram', TG_TOKEN, 'not a chat').ok).toBe(false);
  });
});

describe('isAllowedAlertUrl (final guard before sending)', () => {
  it('only allows the official hosts per kind', () => {
    expect(isAllowedAlertUrl('slack', 'https://hooks.slack.com/services/T/B/X')).toBe(true);
    expect(isAllowedAlertUrl('slack', 'https://evil.com/services/T/B/X')).toBe(false);
    expect(isAllowedAlertUrl('discord', 'https://discord.com/api/webhooks/1/a')).toBe(true);
    expect(isAllowedAlertUrl('discord', 'http://discord.com/api/webhooks/1/a')).toBe(false);
    expect(isAllowedAlertUrl('telegram', `https://api.telegram.org/bot${TG_TOKEN}/sendMessage`)).toBe(true);
    expect(isAllowedAlertUrl('telegram', `https://api.telegram.org/bot${TG_TOKEN}/getUpdates`)).toBe(false);
    expect(isAllowedAlertUrl('telegram', `https://evil.com/bot${TG_TOKEN}/sendMessage`)).toBe(false);
  });
});

describe('message text', () => {
  it('formats each event', () => {
    expect(formatAlertText('new_conversation', { contactName: 'Asha', phone: '919876543210' })).toContain('Asha');
    expect(formatAlertText('sla_breach', { contactName: 'Asha', minutes: 12 })).toContain('12 min');
    expect(formatAlertText('ad_lead', { phone: '9198', source: 'Diwali offer' })).toContain('Diwali offer');
    expect(formatAlertText('payment_received', { amountRupees: '₹1,200.00' })).toContain('₹1,200.00');
    expect(formatAlertText('order_placed', { orderNumber: '#1001', amountRupees: '₹499' })).toContain('#1001');
  });

  it('flattens newlines, strips control characters and caps length', () => {
    expect(plain('a\nb\u0000c')).toBe('a b c');
    expect(plain('x'.repeat(200)).length).toBeLessThanOrEqual(80);
    const t = formatAlertText('new_conversation', { contactName: 'Evil\n@everyone <!channel>' });
    expect(t).not.toContain('\n');
  });

  it('escapes Slack control characters', () => {
    expect(slackEscape('<!channel> & <http://x|y>')).toBe('&lt;!channel&gt; &amp; &lt;http://x|y&gt;');
  });
});

describe('buildAlertRequest', () => {
  it('Slack sends escaped text', () => {
    const r = buildAlertRequest('slack', 'https://hooks.slack.com/services/T/B/X', null, 'hi <!channel>')!;
    expect(JSON.parse(String(r.init.body))).toEqual({ text: 'hi &lt;!channel&gt;' });
  });

  it('Discord disables all mentions', () => {
    const r = buildAlertRequest('discord', 'https://discord.com/api/webhooks/1/a', null, '@everyone')!;
    expect(JSON.parse(String(r.init.body)).allowed_mentions).toEqual({ parse: [] });
  });

  it('Telegram posts to sendMessage with the chat id and needs one', () => {
    const r = buildAlertRequest('telegram', TG_TOKEN, '-100123', 'hello')!;
    expect(r.url).toBe(`https://api.telegram.org/bot${TG_TOKEN}/sendMessage`);
    expect(JSON.parse(String(r.init.body)).chat_id).toBe('-100123');
    expect(buildAlertRequest('telegram', TG_TOKEN, null, 'hello')).toBeNull();
  });
});

describe('parseAlertEvents', () => {
  it('keeps only known events, de-duplicated', () => {
    expect(parseAlertEvents(['order_placed', 'bogus', 'order_placed', 'ad_lead'])).toEqual(['order_placed', 'ad_lead']);
    expect(parseAlertEvents('nope')).toEqual([]);
  });
});
