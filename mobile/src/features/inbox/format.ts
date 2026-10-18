import type { ContentType, InboxConversation, InboxMessage } from './types';

const MIN = 60_000;
const HOUR = 60 * MIN;
const DAY = 24 * HOUR;

export function contactLabel(c: { name: string | null; phone: string } | null | undefined): string {
  if (!c) return 'Unknown contact';
  return c.name?.trim() || c.phone || 'Unknown contact';
}

/** "now", "5m", "3h", "Yesterday", "Mon", "12 Oct" - compact label for list rows. */
export function relativeTime(iso: string | null | undefined, now = Date.now()): string {
  if (!iso) return '';
  const t = Date.parse(iso);
  if (!Number.isFinite(t)) return '';
  const diff = now - t;
  if (diff < MIN) return 'now';
  if (diff < HOUR) return `${Math.floor(diff / MIN)}m`;
  const d = new Date(t);
  const today = new Date(now);
  if (d.toDateString() === today.toDateString()) return `${Math.floor(diff / HOUR)}h`;
  const yesterday = new Date(now - DAY);
  if (d.toDateString() === yesterday.toDateString()) return 'Yesterday';
  if (diff < 6 * DAY) return d.toLocaleDateString(undefined, { weekday: 'short' });
  return d.toLocaleDateString(undefined, { day: 'numeric', month: 'short' });
}

export function clockTime(iso: string): string {
  const d = new Date(iso);
  return Number.isNaN(d.getTime()) ? '' : d.toLocaleTimeString(undefined, { hour: 'numeric', minute: '2-digit' });
}

/** Day header for the thread: "Today", "Yesterday", or a full date. */
export function dayLabel(iso: string, now = Date.now()): string {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return '';
  const today = new Date(now);
  if (d.toDateString() === today.toDateString()) return 'Today';
  if (d.toDateString() === new Date(now - DAY).toDateString()) return 'Yesterday';
  return d.toLocaleDateString(undefined, { weekday: 'long', day: 'numeric', month: 'long', year: d.getFullYear() === today.getFullYear() ? undefined : 'numeric' });
}

export function dayKey(iso: string): string {
  return new Date(iso).toDateString();
}

const TYPE_LABEL: Record<ContentType, string> = {
  text: '',
  image: 'Photo',
  video: 'Video',
  audio: 'Voice message',
  document: 'Document',
  location: 'Location',
  template: 'Template message',
  interactive: 'Reply',
};

export function typeLabel(type: ContentType | string | null | undefined): string {
  return TYPE_LABEL[(type as ContentType) ?? 'text'] ?? '';
}

export type PreviewIcon = 'image-outline' | 'videocam-outline' | 'mic-outline' | 'document-outline' | 'location-outline' | 'document-text-outline' | null;

/** Icon for the last-message preview, from how the web stores `last_message_text` (plain text). */
export function previewIcon(text: string | null | undefined): PreviewIcon {
  const t = (text ?? '').trim().toLowerCase();
  if (!t) return null;
  if (/^(\[?(image|photo)\]?|\u{1F4F7})/u.test(t)) return 'image-outline';
  if (/^(\[?video\]?)/.test(t)) return 'videocam-outline';
  if (/^(\[?(audio|voice)[^\]]*\]?)/.test(t)) return 'mic-outline';
  if (/^(\[?(document|file)[^\]]*\]?)/.test(t)) return 'document-outline';
  if (/^(\[?location\]?)/.test(t)) return 'location-outline';
  return null;
}

/** Text shown for a message in notifications, replies and previews. */
export function messageSummary(m: Pick<InboxMessage, 'content_type' | 'content_text'>): string {
  const text = m.content_text?.trim();
  if (text) return text;
  return typeLabel(m.content_type) || 'Message';
}

export const WINDOW_HOURS = 24;

/**
 * The 24-hour customer-service window, exactly like the web thread: free-form
 * messages are allowed only if the customer wrote within the last 24 hours.
 * `messages` is newest-first.
 */
export function windowInfo(messages: InboxMessage[], now = Date.now()): { expired: boolean; label: string } {
  if (messages.length === 0) return { expired: false, label: '' };
  const lastCustomer = messages.find((m) => m.sender_type === 'customer' && !m.pending);
  if (!lastCustomer) return { expired: true, label: 'No customer message yet' };
  const hours = (now - Date.parse(lastCustomer.created_at)) / HOUR;
  if (!Number.isFinite(hours)) return { expired: false, label: '' };
  if (hours >= WINDOW_HOURS) return { expired: true, label: 'Session expired' };
  const left = WINDOW_HOURS - hours;
  return { expired: false, label: left >= 1 ? `${Math.floor(left)}h left` : `${Math.max(1, Math.floor(left * 60))}m left` };
}

export function matchesSearch(c: InboxConversation, q: string): boolean {
  const needle = q.trim().toLowerCase();
  if (!needle) return true;
  return (
    (c.contact?.name ?? '').toLowerCase().includes(needle) ||
    (c.contact?.phone ?? '').toLowerCase().includes(needle) ||
    (c.last_message_text ?? '').toLowerCase().includes(needle)
  );
}

/** Remove characters that could break out of a PostgREST filter value. */
export function sanitizeSearch(raw: string): string {
  return raw.replace(/[^\p{L}\p{N} +@.\-_]/gu, '').trim().slice(0, 60);
}

/** Replace {{1}}, {{2}}... in a template body with the given values. */
export function renderTemplateBody(body: string, params: string[]): string {
  return body.replace(/\{\{(\d+)\}\}/g, (_, raw: string) => {
    const v = params[Number(raw) - 1];
    return v && v.trim() ? v : `{{${raw}}}`;
  });
}

export function extractVariableIndices(text: string): number[] {
  const set = new Set<number>();
  for (const m of text.matchAll(/\{\{(\d+)\}\}/g)) {
    const n = Number(m[1]);
    if (Number.isFinite(n) && n >= 1) set.add(n);
  }
  return [...set].sort((a, b) => a - b);
}

const firstWord = (s: string | null | undefined) => s?.trim().split(/\s+/)[0] ?? '';

/** Fill {{name}} / {{full_name}} / {{agent}} in a saved reply (same rules as the web app). */
export function renderReply(body: string, ctx: { contactName?: string | null; agentName?: string | null }): string {
  const contact = ctx.contactName && !/^\+?[\d\s-]+$/.test(ctx.contactName) ? ctx.contactName : '';
  return body
    .replace(/\{\{\s*full_name\s*\}\}/gi, contact.trim())
    .replace(/\{\{\s*name\s*\}\}/gi, firstWord(contact))
    .replace(/\{\{\s*agent\s*\}\}/gi, firstWord(ctx.agentName))
    .replace(/[ \t]+([,.!?])/g, '$1')
    .replace(/[ \t]{2,}/g, ' ');
}
