// ============================================================
// Shared template submission pipeline.
//
// One implementation of "validate → (dry-run short-circuit) → Meta →
// persist" used by both the dashboard routes
// (`/api/whatsapp/templates/submit`, `/api/whatsapp/templates/[id]`)
// and the public API (`/api/v1/templates`). Callers pass the Supabase
// client they're authorised with (RLS session client in the dashboard,
// service role for API keys) and map `TemplateSubmitError` to their
// own response envelope.
// ============================================================

import type { SupabaseClient } from '@supabase/supabase-js';

import { decrypt } from '@/lib/whatsapp/encryption';
import { editMessageTemplate, submitMessageTemplate } from '@/lib/whatsapp/meta-api';
import { buildMetaTemplatePayload } from '@/lib/whatsapp/template-components';
import { ensureCarouselHandles, ensureImageHeaderHandle } from '@/lib/whatsapp/template-header-handle';
import { normalizeStatus } from '@/lib/whatsapp/template-status-normalize';
import { validateTemplatePayload, type TemplatePayload } from '@/lib/whatsapp/template-validators';

export type TemplateSubmitErrorCode =
  | 'bad_request'
  | 'whatsapp_not_configured'
  | 'meta_error'
  | 'rate_limited'
  | 'internal';

/** A failure with the HTTP status + machine code the caller should return. */
export class TemplateSubmitError extends Error {
  constructor(
    readonly code: TemplateSubmitErrorCode,
    message: string,
    readonly status: number,
    /** Set when Meta accepted the template but the local save failed. */
    readonly metaTemplateId?: string
  ) {
    super(message);
    this.name = 'TemplateSubmitError';
  }
}

export function isTemplatesDryRun(): boolean {
  return (
    process.env.WHATSAPP_TEMPLATES_DRY_RUN === 'true' ||
    process.env.WHATSAPP_TEMPLATES_DRY_RUN === '1'
  );
}

/** Validate a payload; Authentication templates aren't supported here. */
export function assertSubmittableTemplate(
  payload: TemplatePayload,
  authenticationMessage = 'AUTHENTICATION templates are not yet supported here — create them in Meta WhatsApp Manager and use "Sync from Meta".'
): void {
  if (payload.category === 'Authentication') {
    throw new TemplateSubmitError('bad_request', authenticationMessage, 400);
  }
  try {
    validateTemplatePayload(payload);
  } catch (e) {
    throw new TemplateSubmitError('bad_request', e instanceof Error ? e.message : 'Validation failed.', 400);
  }
}

/** The account's WhatsApp credentials for template calls. */
export async function loadTemplateCredentials(
  supabase: SupabaseClient,
  accountId: string,
  opts: { requireWaba: boolean; notConfiguredMessage?: string }
): Promise<{ wabaId: string | null; accessToken: string }> {
  const { data: config, error } = await supabase
    .from('whatsapp_config')
    .select('*')
    .eq('account_id', accountId)
    .single();
  if (error || !config) {
    throw new TemplateSubmitError(
      'whatsapp_not_configured',
      opts.notConfiguredMessage ??
        'WhatsApp not configured. Connect your WhatsApp Business account in Settings first.',
      400
    );
  }
  if (opts.requireWaba && !config.waba_id) {
    throw new TemplateSubmitError(
      'whatsapp_not_configured',
      'WABA (WhatsApp Business Account) ID missing. Re-connect your account in Settings.',
      400
    );
  }
  return { wabaId: config.waba_id ?? null, accessToken: decrypt(config.access_token) };
}

async function ensureHeaderHandle(payload: TemplatePayload, accessToken: string): Promise<void> {
  // Image headers need a Resumable-Upload handle (Meta rejects a plain
  // URL). Surfaces an actionable 400 (missing META_APP_ID, unreachable
  // URL, wrong type/size).
  try {
    await ensureImageHeaderHandle(payload, accessToken);
    await ensureCarouselHandles(payload, accessToken);
  } catch (e) {
    throw new TemplateSubmitError(
      'bad_request',
      e instanceof Error ? e.message : 'Header image upload failed.',
      400
    );
  }
}

function buildUpsertRow(
  accountId: string,
  userId: string,
  payload: TemplatePayload,
  extras: { status: string; metaTemplateId: string | null; submissionError: string | null }
) {
  return {
    // Account tenancy — NOT NULL on message_templates since migration 017.
    account_id: accountId,
    // Original author — audit only; the unique index (migration 033) is
    // on (account_id, name, language).
    user_id: userId,
    name: payload.name,
    category: payload.category,
    language: payload.language,
    header_type: payload.header_type ?? null,
    header_content: payload.header_content ?? null,
    header_media_url: payload.header_media_url ?? null,
    header_handle: payload.header_handle ?? null,
    body_text: payload.body_text,
    footer_text: payload.footer_text ?? null,
    buttons: payload.buttons ?? null,
    sample_values: payload.sample_values ?? null,
    carousel_cards: payload.carousel_cards?.length ? payload.carousel_cards : null,
    status: extras.status,
    meta_template_id: extras.metaTemplateId,
    submission_error: extras.submissionError,
    // Cleared on every (re)submit; the webhook sets it again if Meta rejects.
    rejection_reason: null,
    last_submitted_at: new Date().toISOString(),
  };
}

function upsertTemplateRow(supabase: SupabaseClient, row: ReturnType<typeof buildUpsertRow>) {
  return supabase
    .from('message_templates')
    .upsert(row, { onConflict: 'account_id,name,language' })
    .select()
    .single();
}

/**
 * Submit a NEW template to Meta and upsert it locally by
 * (account_id, name, language). On a Meta failure the row is saved as
 * DRAFT with the error so it can be retried. Honours
 * WHATSAPP_TEMPLATES_DRY_RUN (no Meta call, synthetic id).
 */
export async function submitNewTemplate(
  supabase: SupabaseClient,
  args: { accountId: string; userId: string; payload: TemplatePayload }
): Promise<Record<string, unknown>> {
  const { accountId, userId, payload } = args;
  let metaTemplateId: string;
  let metaStatus: string;

  if (isTemplatesDryRun()) {
    metaTemplateId = `dry-run-${crypto.randomUUID()}`;
    metaStatus = 'PENDING';
  } else {
    const { wabaId, accessToken } = await loadTemplateCredentials(supabase, accountId, { requireWaba: true });
    await ensureHeaderHandle(payload, accessToken);
    try {
      const meta = await submitMessageTemplate({
        wabaId: wabaId as string,
        accessToken,
        payload: buildMetaTemplatePayload(payload),
      });
      metaTemplateId = meta.id;
      metaStatus = meta.status;
    } catch (e) {
      const message = e instanceof Error ? e.message : 'Meta submit failed.';
      await upsertTemplateRow(
        supabase,
        buildUpsertRow(accountId, userId, payload, { status: 'DRAFT', metaTemplateId: null, submissionError: message })
      );
      if (/\b429\b/.test(message)) {
        throw new TemplateSubmitError(
          'rate_limited',
          'Meta rate limit hit (100 template creates per hour). Try again later.',
          429
        );
      }
      throw new TemplateSubmitError('meta_error', message, 502);
    }
  }

  const { data: row, error } = await upsertTemplateRow(
    supabase,
    buildUpsertRow(accountId, userId, payload, {
      status: normalizeStatus(metaStatus),
      metaTemplateId,
      submissionError: null,
    })
  );
  if (error || !row) {
    // Submitted on Meta but not saved locally — "Sync from Meta" recovers.
    throw new TemplateSubmitError(
      'internal',
      `Submitted to Meta but failed to save locally: ${error?.message ?? 'no row'}. Run "Sync from Meta" to recover.`,
      500,
      metaTemplateId
    );
  }
  return row as Record<string, unknown>;
}

/**
 * Edit an already-submitted template on Meta (components are replaced
 * wholesale) and reset it to PENDING locally. Honours dry-run.
 */
export async function resubmitExistingTemplate(
  supabase: SupabaseClient,
  args: { accountId: string; templateId: string; metaTemplateId: string; payload: TemplatePayload }
): Promise<Record<string, unknown>> {
  const { accountId, templateId, metaTemplateId, payload } = args;

  if (!isTemplatesDryRun()) {
    const { accessToken } = await loadTemplateCredentials(supabase, accountId, {
      requireWaba: false,
      notConfiguredMessage: 'WhatsApp not configured.',
    });
    // Meta replaces components on edit, so image headers need a fresh handle.
    await ensureHeaderHandle(payload, accessToken);
    try {
      await editMessageTemplate({
        metaTemplateId,
        accessToken,
        components: buildMetaTemplatePayload(payload).components,
      });
    } catch (e) {
      const message = e instanceof Error ? e.message : 'Meta edit failed.';
      await supabase
        .from('message_templates')
        .update({ submission_error: message, last_submitted_at: new Date().toISOString() })
        .eq('id', templateId);
      throw new TemplateSubmitError('meta_error', message, 502);
    }
  }

  // Meta accepted the edit — status flips back to PENDING for review.
  const { data: row, error } = await supabase
    .from('message_templates')
    .update({
      category: payload.category,
      header_type: payload.header_type ?? null,
      header_content: payload.header_content ?? null,
      header_media_url: payload.header_media_url ?? null,
      header_handle: payload.header_handle ?? null,
      body_text: payload.body_text,
      footer_text: payload.footer_text ?? null,
      buttons: payload.buttons ?? null,
      sample_values: payload.sample_values ?? null,
      carousel_cards: payload.carousel_cards?.length ? payload.carousel_cards : null,
      status: 'PENDING',
      submission_error: null,
      rejection_reason: null,
      last_submitted_at: new Date().toISOString(),
    })
    .eq('id', templateId)
    .select()
    .single();
  if (error || !row) {
    throw new TemplateSubmitError(
      'internal',
      `Edited on Meta but failed to save locally: ${error?.message ?? 'no row'}. Run "Sync from Meta" to recover.`,
      500
    );
  }
  return row as Record<string, unknown>;
}
