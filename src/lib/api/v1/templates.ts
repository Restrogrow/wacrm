// ============================================================
// Public API (v1) message-template logic.
//
// `POST /api/v1/templates` is idempotent so a partner (RestroGrow)
// can safely call it again for every template it wants to exist:
//
//   no row with this name+language        → submit to Meta        (201)
//   same body, any status but REJECTED/DRAFT → return current row (200)
//   REJECTED / DRAFT                      → resubmit               (201)
//   different body, any other status      → 409 conflict
//     (an approved template keeps its wording; use a new name)
//
// Submission itself goes through the shared pipeline in
// `src/lib/whatsapp/template-submit.ts`, same as the dashboard.
// ============================================================

import type { TemplatePayload } from '@/lib/whatsapp/template-validators';

export type TemplateCategory = TemplatePayload['category'];

/** A `message_templates` row, as far as the API reads it. */
export interface TemplateRow {
  id: string;
  name: string;
  language: string;
  category: string;
  status: string;
  body_text: string;
  meta_template_id: string | null;
  rejection_reason?: string | null;
  updated_at?: string | null;
}

/** `MARKETING` / `marketing` / `Marketing` → `'Marketing'`; unknown → null. */
export function normalizeCategory(raw: unknown): TemplateCategory | null {
  if (typeof raw !== 'string') return null;
  switch (raw.trim().toUpperCase()) {
    case 'MARKETING':
      return 'Marketing';
    case 'UTILITY':
      return 'Utility';
    case 'AUTHENTICATION':
      return 'Authentication';
    default:
      return null;
  }
}

/** Thrown for request-shape problems; the route maps it to a 400. */
export class TemplateRequestError extends Error {}

const str = (v: unknown) => (typeof v === 'string' ? v : undefined);

/**
 * Build a `TemplatePayload` from the API body. Shape checks only —
 * content rules (name format, variables, samples) run in the shared
 * validator.
 */
export function parseCreateTemplateBody(body: unknown): TemplatePayload {
  if (!body || typeof body !== 'object' || Array.isArray(body)) {
    throw new TemplateRequestError('Request body must be a JSON object');
  }
  const b = body as Record<string, unknown>;
  const name = str(b.name)?.trim();
  if (!name) throw new TemplateRequestError("'name' is required");
  const language = str(b.language)?.trim();
  if (!language) throw new TemplateRequestError("'language' is required");
  const category = normalizeCategory(b.category);
  if (!category) {
    throw new TemplateRequestError("'category' must be MARKETING or UTILITY");
  }
  if (category === 'Authentication') {
    throw new TemplateRequestError(
      'AUTHENTICATION templates are not supported through the API — create them in Meta WhatsApp Manager.'
    );
  }
  const bodyText = str(b.body_text);
  if (!bodyText) throw new TemplateRequestError("'body_text' is required");

  const payload: TemplatePayload = { name, language, category, body_text: bodyText };
  if (b.sample_values && typeof b.sample_values === 'object') {
    payload.sample_values = b.sample_values as TemplatePayload['sample_values'];
  }
  if (str(b.header_type)) payload.header_type = b.header_type as TemplatePayload['header_type'];
  if (str(b.header_content)) payload.header_content = b.header_content as string;
  if (str(b.header_media_url)) payload.header_media_url = b.header_media_url as string;
  if (str(b.footer_text)) payload.footer_text = b.footer_text as string;
  if (Array.isArray(b.buttons)) payload.buttons = b.buttons as TemplatePayload['buttons'];
  return payload;
}

export type TemplateAction = 'create' | 'unchanged' | 'resubmit' | 'conflict';

const RESUBMITTABLE = new Set(['REJECTED', 'DRAFT']);

/** Decide what a create call should do given the existing row (if any). */
export function decideTemplateAction(
  existing: Pick<TemplateRow, 'status' | 'body_text'> | null,
  payload: Pick<TemplatePayload, 'body_text'>
): TemplateAction {
  if (!existing) return 'create';
  const status = (existing.status ?? '').toUpperCase();
  if (RESUBMITTABLE.has(status)) return 'resubmit';
  return existing.body_text === payload.body_text ? 'unchanged' : 'conflict';
}

/** Wire shape for a template. Category and status in Meta's words. */
export function serializeTemplate(row: TemplateRow) {
  return {
    id: row.id,
    name: row.name,
    language: row.language,
    category: (row.category ?? '').toUpperCase(),
    status: (row.status ?? '').toUpperCase(),
  };
}

/** Wire shape for the list endpoint. */
export function serializeTemplateDetail(row: TemplateRow) {
  return {
    ...serializeTemplate(row),
    rejection_reason: row.rejection_reason ?? null,
    body_text: row.body_text,
    updated_at: row.updated_at ?? null,
  };
}

/** Parse `?names=a,b,c` (max 50). Returns null when absent. */
export const MAX_NAMES_PER_CALL = 50;
export function parseNamesParam(raw: string | null): string[] | null {
  if (raw === null) return null;
  const names = [...new Set(raw.split(',').map((n) => n.trim()).filter(Boolean))];
  if (names.length > MAX_NAMES_PER_CALL) {
    throw new TemplateRequestError(`'names' accepts at most ${MAX_NAMES_PER_CALL} names per call`);
  }
  return names;
}

export interface CreateTemplateDeps {
  findExisting: (name: string, language: string) => Promise<TemplateRow | null>;
  submitNew: (payload: TemplatePayload) => Promise<TemplateRow>;
  resubmit: (existing: TemplateRow, payload: TemplatePayload) => Promise<TemplateRow>;
  isDryRun: () => boolean;
}

export type CreateTemplateResult =
  | { kind: 'created' | 'resubmitted' | 'unchanged'; template: TemplateRow }
  | { kind: 'conflict'; template: TemplateRow };

/**
 * Create-or-reuse a template. The payload must already have passed
 * `assertSubmittableTemplate` (shared validation).
 */
export async function createTemplateIdempotent(
  payload: TemplatePayload,
  deps: CreateTemplateDeps
): Promise<CreateTemplateResult> {
  const existing = await deps.findExisting(payload.name, payload.language);
  const action = decideTemplateAction(existing, payload);

  if (action === 'create') {
    return { kind: 'created', template: await deps.submitNew(payload) };
  }
  if (action === 'unchanged') return { kind: 'unchanged', template: existing! };
  if (action === 'conflict') return { kind: 'conflict', template: existing! };

  // Resubmit. A row Meta knows about is edited in place; one that never
  // reached Meta (a DRAFT, or a dry-run row now that dry-run is off) is
  // submitted fresh, which upserts the same (account, name, language) row.
  const metaId = existing!.meta_template_id;
  const knownToMeta = !!metaId && (deps.isDryRun() || !metaId.startsWith('dry-run-'));
  const template = knownToMeta ? await deps.resubmit(existing!, payload) : await deps.submitNew(payload);
  return { kind: 'resubmitted', template };
}
