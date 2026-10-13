// ============================================================
// Saved replies — pure helpers shared by the inbox composer and
// Settings → Saved replies (migration 042).
// ============================================================

export interface SavedReply {
  id: string;
  shortcut: string;
  title: string | null;
  body: string;
}

export const SHORTCUT_RE = /^[a-z0-9_-]{1,32}$/;

/** "Price List!" → "price-list". */
export function normalizeShortcut(input: string): string {
  return input
    .trim()
    .toLowerCase()
    .replace(/^\/+/, '')
    .replace(/\s+/g, '-')
    .replace(/[^a-z0-9_-]/g, '')
    .slice(0, 32);
}

export const REPLY_VARIABLES = [
  { token: '{{name}}', label: "Contact's first name" },
  { token: '{{full_name}}', label: "Contact's full name" },
  { token: '{{agent}}', label: 'Your first name' },
] as const;

export interface ReplyContext {
  contactName?: string | null;
  agentName?: string | null;
}

const first = (s: string | null | undefined) => s?.trim().split(/\s+/)[0] ?? '';

/** Fill {{name}} / {{full_name}} / {{agent}}; unknown values become "". */
export function renderReply(body: string, ctx: ReplyContext): string {
  // A contact saved without a name shows its phone number as the name —
  // don't greet people as "Hi 919876543210".
  const contact =
    ctx.contactName && !/^\+?[\d\s-]+$/.test(ctx.contactName)
      ? ctx.contactName
      : '';
  return body
    .replace(/\{\{\s*full_name\s*\}\}/gi, contact.trim())
    .replace(/\{\{\s*name\s*\}\}/gi, first(contact))
    .replace(/\{\{\s*agent\s*\}\}/gi, first(ctx.agentName))
    .replace(/[ \t]+([,.!?])/g, '$1')
    .replace(/[ \t]{2,}/g, ' ');
}

/**
 * The query after a leading "/" in the composer, or null when the text
 * isn't a slash command ("/pri" → "pri", "/" → "", "hi /x" → null).
 */
export function slashQuery(text: string): string | null {
  const m = /^\/([^\s]*)$/.exec(text);
  return m ? m[1].toLowerCase() : null;
}

/** Shortcut-prefix matches first, then title/body matches. */
export function matchReplies(
  replies: SavedReply[],
  query: string,
  limit = 8
): SavedReply[] {
  const q = query.toLowerCase();
  if (!q) return replies.slice(0, limit);
  const prefix = replies.filter((r) => r.shortcut.startsWith(q));
  const rest = replies.filter(
    (r) =>
      !r.shortcut.startsWith(q) &&
      (r.shortcut.includes(q) ||
        (r.title ?? '').toLowerCase().includes(q) ||
        r.body.toLowerCase().includes(q))
  );
  return [...prefix, ...rest].slice(0, limit);
}
