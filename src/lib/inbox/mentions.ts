// Pure helpers for @mentions in internal notes: the composer typeahead and
// the display highlighting share these so they cannot drift apart.

export interface MentionMember {
  id: string;
  name: string;
}

export const MAX_NOTE_LENGTH = 2000;
export const MAX_MENTIONS = 10;

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/**
 * If the caret sits inside an "@query" token (the @ at the start of the text
 * or after whitespace), return the query and where the token starts.
 */
export function activeMentionQuery(
  text: string,
  caret: number,
): { query: string; start: number } | null {
  const before = text.slice(0, caret);
  const at = before.lastIndexOf('@');
  if (at < 0) return null;
  if (at > 0 && !/\s/.test(before[at - 1])) return null;
  const query = before.slice(at + 1);
  // A token ends at a newline; spaces are allowed so "@Priya Sh" can narrow.
  if (query.includes('\n') || query.length > 30) return null;
  return { query, start: at };
}

/** Members whose name contains the query, best (prefix) matches first. */
export function matchMembers(members: MentionMember[], query: string, limit = 6): MentionMember[] {
  const q = query.trim().toLowerCase();
  const scored = members
    .filter((m) => m.name.trim().length > 0)
    .map((m) => {
      const name = m.name.toLowerCase();
      const rank = q === '' || name.startsWith(q) ? 0 : name.split(/\s+/).some((w) => w.startsWith(q)) ? 1 : name.includes(q) ? 2 : -1;
      return { m, rank };
    })
    .filter((x) => x.rank >= 0)
    .sort((a, b) => a.rank - b.rank || a.m.name.localeCompare(b.m.name));
  return scored.slice(0, limit).map((x) => x.m);
}

/** Replace the active "@query" token with "@Full Name " and return the new text + caret. */
export function applyMention(
  text: string,
  start: number,
  caret: number,
  name: string,
): { text: string; caret: number } {
  const insert = `@${name} `;
  return { text: text.slice(0, start) + insert + text.slice(caret), caret: start + insert.length };
}

/**
 * The ids that are still really mentioned: a picked member only counts if
 * "@Name" is still in the text (the user may have deleted it afterwards).
 */
export function resolveMentions(text: string, picked: MentionMember[]): string[] {
  const ids: string[] = [];
  for (const p of picked) {
    if (p.name && text.includes(`@${p.name}`) && !ids.includes(p.id)) ids.push(p.id);
  }
  return ids.slice(0, MAX_MENTIONS);
}

/** Split a note body into plain and mention segments for display. */
export function splitMentions(
  body: string,
  names: string[],
): Array<{ text: string; mention: boolean }> {
  const cleaned = Array.from(new Set(names.filter(Boolean))).sort((a, b) => b.length - a.length);
  if (cleaned.length === 0) return [{ text: body, mention: false }];
  const escaped = cleaned.map((n) => n.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'));
  const re = new RegExp(`(@(?:${escaped.join('|')}))`, 'g');
  return body
    .split(re)
    .filter((s) => s !== '')
    .map((s) => ({ text: s, mention: cleaned.some((n) => s === `@${n}`) }));
}

/** Validate the body and mention ids a client sent for a new note. */
export function parseNoteInput(
  input: unknown,
):
  | { ok: true; value: { conversationId: string; body: string; mentions: string[] } }
  | { ok: false; error: string } {
  if (!input || typeof input !== 'object') return { ok: false, error: 'Invalid request' };
  const o = input as Record<string, unknown>;

  if (typeof o.conversation_id !== 'string' || !UUID_RE.test(o.conversation_id)) {
    return { ok: false, error: 'conversation_id is required' };
  }
  const body = typeof o.body === 'string' ? o.body.trim() : '';
  if (!body) return { ok: false, error: 'Write a note first' };
  if (body.length > MAX_NOTE_LENGTH) return { ok: false, error: `Notes are limited to ${MAX_NOTE_LENGTH} characters` };

  const raw = Array.isArray(o.mentions) ? o.mentions : [];
  const mentions = Array.from(
    new Set(raw.filter((v): v is string => typeof v === 'string' && UUID_RE.test(v))),
  );
  if (mentions.length > MAX_MENTIONS) return { ok: false, error: `Mention up to ${MAX_MENTIONS} people per note` };

  return { ok: true, value: { conversationId: o.conversation_id, body, mentions } };
}
