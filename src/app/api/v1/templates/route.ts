// ============================================================
// /api/v1/templates — WhatsApp message templates.
//
// POST — create a template and submit it to Meta (scope templates:write).
//   Body: { name, category: "MARKETING"|"UTILITY" (any case), language,
//           body_text, sample_values: { body: [...] },
//           header_* / footer_text / buttons optional }
//   Idempotent (see src/lib/api/v1/templates.ts):
//     201 { data: { id, name, language, category, status } }  submitted
//     200 { data: … }                                         already there
//     409 conflict                                            approved/pending with other wording
//   Same pipeline as the dashboard (src/lib/whatsapp/template-submit.ts);
//   honours WHATSAPP_TEMPLATES_DRY_RUN.
//
// GET  — list templates (scope templates:read), optionally filtered by
//   ?names=a,b,c (up to 50). Status is kept current by Meta's template
//   status webhook.
//   200 { data: [ { id, name, language, category, status,
//                   rejection_reason, body_text, updated_at } ] }
// ============================================================

import { requireApiKey } from '@/lib/auth/api-context';
import { fail, ok, toApiErrorResponse } from '@/lib/api/v1/respond';
import { resolveAuditUserId } from '@/lib/api/v1/contacts';
import {
  createTemplateIdempotent,
  parseCreateTemplateBody,
  parseNamesParam,
  serializeTemplate,
  serializeTemplateDetail,
  TemplateRequestError,
  type TemplateRow,
} from '@/lib/api/v1/templates';
import {
  assertSubmittableTemplate,
  isTemplatesDryRun,
  resubmitExistingTemplate,
  submitNewTemplate,
  TemplateSubmitError,
} from '@/lib/whatsapp/template-submit';

const ROW_COLUMNS =
  'id, name, language, category, status, body_text, meta_template_id, rejection_reason, updated_at';

export async function POST(request: Request) {
  try {
    const ctx = await requireApiKey(request, 'templates:write');

    const payload = parseCreateTemplateBody(await request.json().catch(() => null));
    assertSubmittableTemplate(payload);

    const db = ctx.supabase;
    const result = await createTemplateIdempotent(payload, {
      findExisting: async (name, language) => {
        const { data } = await db
          .from('message_templates')
          .select(ROW_COLUMNS)
          .eq('account_id', ctx.accountId)
          .eq('name', name)
          .eq('language', language)
          .maybeSingle();
        return (data as TemplateRow | null) ?? null;
      },
      submitNew: async (p) => {
        const userId = ctx.createdBy ?? (await resolveAuditUserId(db, ctx.accountId));
        return (await submitNewTemplate(db, { accountId: ctx.accountId, userId, payload: p })) as unknown as TemplateRow;
      },
      resubmit: async (existing, p) =>
        (await resubmitExistingTemplate(db, {
          accountId: ctx.accountId,
          templateId: existing.id,
          metaTemplateId: existing.meta_template_id as string,
          payload: p,
        })) as unknown as TemplateRow,
      isDryRun: isTemplatesDryRun,
    });

    if (result.kind === 'conflict') {
      return fail(
        'conflict',
        `Template '${payload.name}' (${payload.language}) already exists with status ${result.template.status} and different wording. Create it under a new name instead.`,
        409
      );
    }
    return ok(serializeTemplate(result.template), result.kind === 'unchanged' ? 200 : 201);
  } catch (err) {
    if (err instanceof TemplateRequestError) return fail('bad_request', err.message, 400);
    if (err instanceof TemplateSubmitError) return fail(err.code, err.message, err.status);
    return toApiErrorResponse(err);
  }
}

export async function GET(request: Request) {
  try {
    const ctx = await requireApiKey(request, 'templates:read');
    const names = parseNamesParam(new URL(request.url).searchParams.get('names'));
    if (names && names.length === 0) return ok([]);

    let query = ctx.supabase
      .from('message_templates')
      .select(ROW_COLUMNS)
      .eq('account_id', ctx.accountId)
      .order('name', { ascending: true })
      .order('language', { ascending: true })
      .limit(1000);
    if (names) query = query.in('name', names);

    const { data, error } = await query;
    if (error) throw error;

    return ok(((data ?? []) as TemplateRow[]).map(serializeTemplateDetail));
  } catch (err) {
    if (err instanceof TemplateRequestError) return fail('bad_request', err.message, 400);
    return toApiErrorResponse(err);
  }
}
