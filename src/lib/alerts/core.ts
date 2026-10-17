// ============================================================
// Team alerts to Slack / Discord / Telegram — pure logic, no I/O.
//
// Only three destinations are allowed, and only their official webhook
// hosts: hooks.slack.com, discord.com/api/webhooks, api.telegram.org.
// The target is validated when saved AND again right before sending, so
// a bad row can never turn this into a general-purpose HTTP client.
// ============================================================

export const ALERT_KINDS = ['slack', 'discord', 'telegram'] as const;
export type AlertKind = (typeof ALERT_KINDS)[number];

export const ALERT_EVENTS = ['new_conversation', 'sla_breach', 'ad_lead', 'payment_received', 'order_placed'] as const;
export type AlertEvent = (typeof ALERT_EVENTS)[number];

export const ALERT_EVENT_LABELS: Record<AlertEvent, { label: string; description: string }> = {
  new_conversation: { label: 'New conversation', description: 'A customer messages you for the first time' },
  sla_breach: { label: 'Reply overdue', description: 'A customer waited longer than your first-response target' },
  ad_lead: { label: 'New ad lead', description: 'Someone arrives from a Click-to-WhatsApp ad' },
  payment_received: { label: 'Payment received', description: 'A Razorpay payment link was paid' },
  order_placed: { label: 'Order placed', description: 'A new Shopify or WooCommerce order' },
};

export const MAX_ALERT_CHANNELS = 5;

export function isAlertKind(v: unknown): v is AlertKind {
  return typeof v === 'string' && (ALERT_KINDS as readonly string[]).includes(v);
}

export function isAlertEvent(v: unknown): v is AlertEvent {
  return typeof v === 'string' && (ALERT_EVENTS as readonly string[]).includes(v);
}

export function parseAlertEvents(input: unknown): AlertEvent[] {
  if (!Array.isArray(input)) return [];
  return Array.from(new Set(input.filter(isAlertEvent)));
}

// ------------------------------------------------------------
// Target validation
// ------------------------------------------------------------

const DISCORD_HOSTS = new Set(['discord.com', 'discordapp.com', 'ptb.discord.com', 'canary.discord.com']);
const TELEGRAM_TOKEN_RE = /^\d{5,15}:[A-Za-z0-9_-]{30,50}$/;
const TELEGRAM_CHAT_RE = /^(-?\d{3,20}|@[A-Za-z][A-Za-z0-9_]{4,31})$/;

export type TargetCheck = { ok: true; target: string; chatId: string | null } | { ok: false; error: string };

/** Validate (and normalise) what the admin pasted for a channel. */
export function validateAlertTarget(kind: AlertKind, rawTarget: unknown, rawChatId?: unknown): TargetCheck {
  const target = typeof rawTarget === 'string' ? rawTarget.trim() : '';
  if (!target) return { ok: false, error: 'Paste the webhook URL (or bot token for Telegram)' };
  if (target.length > 300) return { ok: false, error: 'That value is too long' };

  if (kind === 'telegram') {
    if (!TELEGRAM_TOKEN_RE.test(target)) {
      return { ok: false, error: 'That does not look like a Telegram bot token (from @BotFather)' };
    }
    const chat = typeof rawChatId === 'string' ? rawChatId.trim() : '';
    if (!TELEGRAM_CHAT_RE.test(chat)) {
      return { ok: false, error: 'Enter the chat id (a number like -1001234567890) or @channelname' };
    }
    return { ok: true, target, chatId: chat };
  }

  let url: URL;
  try {
    url = new URL(target);
  } catch {
    return { ok: false, error: 'That is not a valid URL' };
  }
  if (url.protocol !== 'https:' || url.username || url.password || url.port) {
    return { ok: false, error: 'The URL must be a plain https:// link' };
  }
  const host = url.hostname.toLowerCase();

  if (kind === 'slack') {
    if (host !== 'hooks.slack.com' || !url.pathname.startsWith('/services/')) {
      return { ok: false, error: 'Use a Slack incoming-webhook URL (https://hooks.slack.com/services/…)' };
    }
  } else if (!DISCORD_HOSTS.has(host) || !url.pathname.startsWith('/api/webhooks/')) {
    return { ok: false, error: 'Use a Discord webhook URL (https://discord.com/api/webhooks/…)' };
  }
  return { ok: true, target: `${url.origin}${url.pathname}`, chatId: null };
}

/** Safe, non-secret description of a stored target for the UI. */
export function describeTarget(kind: AlertKind, chatId: string | null): string {
  if (kind === 'slack') return 'Slack incoming webhook';
  if (kind === 'discord') return 'Discord webhook';
  return chatId ? `Telegram chat ${chatId}` : 'Telegram bot';
}

// ------------------------------------------------------------
// Message text
// ------------------------------------------------------------

export interface AlertData {
  contactName?: string | null;
  phone?: string | null;
  detail?: string | null;
  amountRupees?: string | null;
  orderNumber?: string | null;
  source?: string | null;
  minutes?: number | null;
}

/** One-line, length-capped, control characters removed. */
export function plain(value: unknown, max = 80): string {
  if (value === null || value === undefined) return '';
  const s = String(value).replace(/[\u0000-\u001F\u007F]+/g, ' ').replace(/\s+/g, ' ').trim();
  return s.length > max ? `${s.slice(0, max - 1)}…` : s;
}

export function formatAlertText(event: AlertEvent, data: AlertData): string {
  const who = plain(data.contactName) || plain(data.phone) || 'A customer';
  const phone = data.phone && data.contactName ? ` (${plain(data.phone, 20)})` : '';
  switch (event) {
    case 'new_conversation':
      return `💬 New conversation: ${who}${phone}`;
    case 'sla_breach':
      return `⏰ Reply overdue: ${who}${phone} has been waiting${data.minutes ? ` ${data.minutes} min` : ''} for a reply`;
    case 'ad_lead':
      return `🎯 New ad lead: ${who}${phone}${data.source ? ` from "${plain(data.source)}"` : ''}`;
    case 'payment_received':
      return `✅ Payment received${data.amountRupees ? `: ${plain(data.amountRupees, 20)}` : ''}${data.contactName || data.phone ? ` from ${who}` : ''}`;
    case 'order_placed':
      return `🛒 New order${data.orderNumber ? ` ${plain(data.orderNumber, 30)}` : ''}${data.amountRupees ? ` (${plain(data.amountRupees, 20)})` : ''}${data.contactName || data.phone ? ` from ${who}` : ''}`;
  }
}

/** Slack renders <…> as links and &…; as entities; neutralise user text. */
export function slackEscape(text: string): string {
  return text.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
}

// ------------------------------------------------------------
// Request building
// ------------------------------------------------------------

export interface AlertRequest {
  url: string;
  init: RequestInit;
}

/** Hosts a request may go to, for the final guard before sending. */
export function isAllowedAlertUrl(kind: AlertKind, url: string): boolean {
  let u: URL;
  try {
    u = new URL(url);
  } catch {
    return false;
  }
  if (u.protocol !== 'https:' || u.username || u.password || u.port) return false;
  const host = u.hostname.toLowerCase();
  if (kind === 'slack') return host === 'hooks.slack.com' && u.pathname.startsWith('/services/');
  if (kind === 'discord') return DISCORD_HOSTS.has(host) && u.pathname.startsWith('/api/webhooks/');
  return host === 'api.telegram.org' && /^\/bot[^/]+\/sendMessage$/.test(u.pathname);
}

export function buildAlertRequest(kind: AlertKind, target: string, chatId: string | null, text: string): AlertRequest | null {
  const headers = { 'Content-Type': 'application/json' };
  if (kind === 'slack') {
    return { url: target, init: { method: 'POST', headers, body: JSON.stringify({ text: slackEscape(text) }) } };
  }
  if (kind === 'discord') {
    // allowed_mentions.parse = [] stops @everyone / @here / role pings.
    return {
      url: target,
      init: { method: 'POST', headers, body: JSON.stringify({ content: text.slice(0, 1900), allowed_mentions: { parse: [] } }) },
    };
  }
  if (!chatId) return null;
  return {
    url: `https://api.telegram.org/bot${target}/sendMessage`,
    init: {
      method: 'POST',
      headers,
      body: JSON.stringify({ chat_id: chatId, text: text.slice(0, 3900), disable_web_page_preview: true }),
    },
  };
}
