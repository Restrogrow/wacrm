// Validation for the inbox bulk-actions API (POST /api/inbox/conversations/bulk).
// Pure so it can be unit tested; the route does the account checks.

export const MAX_BULK = 100;

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const STATUSES = ['open', 'pending', 'closed'] as const;

export type BulkAction =
  | { action: 'assign'; ids: string[]; userId: string | null }
  | { action: 'status'; ids: string[]; status: (typeof STATUSES)[number] }
  | { action: 'tag'; ids: string[]; tagId: string }
  | { action: 'mark_read'; ids: string[] };

export function parseBulkRequest(
  input: unknown,
): { ok: true; value: BulkAction } | { ok: false; error: string } {
  if (!input || typeof input !== 'object') return { ok: false, error: 'Invalid request' };
  const o = input as Record<string, unknown>;

  if (!Array.isArray(o.ids)) return { ok: false, error: 'ids must be a list' };
  const ids = Array.from(new Set(o.ids.filter((v): v is string => typeof v === 'string')));
  if (ids.length === 0) return { ok: false, error: 'Select at least one conversation' };
  if (ids.length > MAX_BULK) return { ok: false, error: `Select up to ${MAX_BULK} conversations at a time` };
  if (ids.some((id) => !UUID_RE.test(id))) return { ok: false, error: 'Invalid conversation id' };

  switch (o.action) {
    case 'assign': {
      // null / empty = unassign
      if (o.value === null || o.value === '' || o.value === undefined) return { ok: true, value: { action: 'assign', ids, userId: null } };
      if (typeof o.value !== 'string' || !UUID_RE.test(o.value)) return { ok: false, error: 'Invalid agent' };
      return { ok: true, value: { action: 'assign', ids, userId: o.value } };
    }
    case 'status': {
      if (typeof o.value !== 'string' || !(STATUSES as readonly string[]).includes(o.value)) {
        return { ok: false, error: 'Status must be open, pending or closed' };
      }
      return { ok: true, value: { action: 'status', ids, status: o.value as (typeof STATUSES)[number] } };
    }
    case 'tag': {
      if (typeof o.value !== 'string' || !UUID_RE.test(o.value)) return { ok: false, error: 'Pick a tag' };
      return { ok: true, value: { action: 'tag', ids, tagId: o.value } };
    }
    case 'mark_read':
      return { ok: true, value: { action: 'mark_read', ids } };
    default:
      return { ok: false, error: 'Unknown action' };
  }
}
