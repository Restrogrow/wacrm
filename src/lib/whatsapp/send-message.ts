// ============================================================
// Outbound message send — the core that both the dashboard's
// `/api/whatsapp/send` route and the public `/api/v1/messages`
// endpoint call.
//
// Given a conversation and message params, this:
//   1. validates the params for the message type,
//   2. loads the conversation + contact + WhatsApp config,
//   3. sends to Meta (with phone-variant retry + contact auto-fix),
//   4. persists the message + updates the conversation,
//   5. pauses any active Flow run for the contact (agent stepped in).
//
// It is transport-agnostic: it takes a `SupabaseClient` and an
// `accountId` and throws `SendMessageError` on failure. The callers
// own auth, rate-limiting, body parsing, and mapping the error to
// their respective response shapes (internal `{ error }` vs the v1
// envelope). Behaviour is identical to the original inline route —
// this is a straight extraction so the public endpoint can reuse it
// without duplicating ~250 lines of Meta plumbing.
// ============================================================

import type { SupabaseClient } from '@supabase/supabase-js';

import {
  sendTextMessage,
  sendTemplateMessage,
  sendMediaMessage,
  sendInteractiveButtons,
  sendInteractiveList,
  INTERACTIVE_LIMITS,
  type MediaKind,
} from '@/lib/whatsapp/meta-api';
import { decrypt, encrypt, isLegacyFormat } from '@/lib/whatsapp/encryption';
import { supabaseAdmin } from '@/lib/flows/admin-client';
import {
  resolveSendTarget,
  isRecipientNotAllowedError,
} from '@/lib/whatsapp/phone-utils';
import type { MessageTemplate } from '@/types';
import { isMessageTemplate } from '@/lib/whatsapp/template-row-guard';
import { accountCanSend } from '@/lib/billing/server';
import { PLAN_EXPIRED_MESSAGE } from '@/lib/billing/plans';

export const MEDIA_KINDS = ['image', 'video', 'document', 'audio'] as const;
export const VALID_MESSAGE_TYPES = [
  'text',
  'template',
  ...MEDIA_KINDS,
  'interactive',
] as const;

/**
 * Reply buttons or a list (`type: 'interactive'`), the API shape. `contentText`
 * is the body above them. Only valid inside the 24-hour service window, like
 * any free-form message. A tap comes back as `message.received` with the id.
 */
export type InteractivePayload =
  | {
      kind: 'buttons';
      buttons: { id: string; title: string }[];
      header_image_url?: string;
      header_text?: string;
      footer?: string;
    }
  | {
      kind: 'list';
      button: string;
      sections: { title?: string; rows: { id: string; title: string; description?: string }[] }[];
      header_text?: string;
      footer?: string;
    };

const str = (v: unknown): string | undefined =>
  typeof v === 'string' && v.trim() !== '' ? v.trim() : undefined;

/**
 * Check and normalise an `interactive` object against Meta's limits, so a bad
 * payload is a 400 here and not a Meta error after the contact was created.
 */
export function parseInteractive(raw: unknown): InteractivePayload {
  const bad = (m: string) => new SendMessageError('bad_request', `interactive: ${m}`, 400);
  if (!raw || typeof raw !== 'object') throw bad('an object is required for interactive messages');
  const o = raw as Record<string, unknown>;
  const L = INTERACTIVE_LIMITS;
  const header_text = str(o.header_text);
  const footer = str(o.footer);
  if (header_text && header_text.length > L.headerTextMaxLength) throw bad(`header_text is over ${L.headerTextMaxLength} characters`);
  if (footer && footer.length > L.footerMaxLength) throw bad(`footer is over ${L.footerMaxLength} characters`);
  const ids = new Set<string>();
  const id = (v: unknown, what: string): string => {
    const s = str(v);
    if (!s || s.length > 200) throw bad(`each ${what} needs an id (≤ 200 characters)`);
    if (ids.has(s)) throw bad(`duplicate id "${s}"`);
    ids.add(s);
    return s;
  };

  if (o.kind === 'buttons') {
    const list = Array.isArray(o.buttons) ? o.buttons : [];
    if (list.length < 1 || list.length > L.maxButtons) throw bad(`1–${L.maxButtons} buttons are required`);
    const buttons = list.map((b) => {
      const r = (b ?? {}) as Record<string, unknown>;
      const title = str(r.title);
      if (!title || title.length > L.buttonTitleMaxLength) throw bad(`each button needs a title of 1–${L.buttonTitleMaxLength} characters`);
      return { id: id(r.id, 'button'), title };
    });
    const header_image_url = str(o.header_image_url);
    if (header_image_url && !/^https?:\/\//i.test(header_image_url)) throw bad('header_image_url must be an http(s) URL');
    return { kind: 'buttons', buttons, header_image_url, header_text, footer };
  }

  if (o.kind === 'list') {
    const button = str(o.button);
    if (!button || button.length > L.buttonTitleMaxLength) throw bad(`button (the list's label) must be 1–${L.buttonTitleMaxLength} characters`);
    const secs = Array.isArray(o.sections) ? o.sections : [];
    if (secs.length < 1 || secs.length > L.maxListSections) throw bad(`1–${L.maxListSections} sections are required`);
    let total = 0;
    const sections = secs.map((s) => {
      const r = (s ?? {}) as Record<string, unknown>;
      const rows = (Array.isArray(r.rows) ? r.rows : []).map((row) => {
        const x = (row ?? {}) as Record<string, unknown>;
        const title = str(x.title);
        const description = str(x.description);
        if (!title || title.length > L.listRowTitleMaxLength) throw bad(`each row needs a title of 1–${L.listRowTitleMaxLength} characters`);
        if (description && description.length > L.listRowDescriptionMaxLength) throw bad(`row descriptions are at most ${L.listRowDescriptionMaxLength} characters`);
        return { id: id(x.id, 'row'), title, description };
      });
      if (!rows.length) throw bad('every section needs rows');
      total += rows.length;
      const title = str(r.title);
      if (title && title.length > L.listRowTitleMaxLength) throw bad(`section titles are at most ${L.listRowTitleMaxLength} characters`);
      return { title, rows };
    });
    if (total > L.maxListRowsTotal) throw bad(`at most ${L.maxListRowsTotal} rows in total`);
    if (sections.length > 1 && sections.some((s) => !s.title)) throw bad('with several sections, each needs a title');
    return { kind: 'list', button, sections, header_text, footer };
  }

  throw bad("kind must be 'buttons' or 'list'");
}

/**
 * Typed failure with a machine `code` and a suggested HTTP `status`.
 * Callers map it to their own response shape (`toErrorResponse` for
 * the dashboard route, the v1 envelope for the public endpoint).
 */
export class SendMessageError extends Error {
  readonly code: string;
  readonly status: number;
  constructor(code: string, message: string, status: number) {
    super(message);
    this.name = 'SendMessageError';
    this.code = code;
    this.status = status;
  }
}

export interface SendMessageParams {
  conversationId: string;
  messageType: string;
  contentText?: string | null;
  mediaUrl?: string | null;
  filename?: string | null;
  templateName?: string | null;
  templateLanguage?: string | null;
  /** Legacy positional body params (only used if messageParams.body unset). */
  templateParams?: string[];
  /** Structured template params (header/body/buttons). */
  templateMessageParams?: unknown;
  /** Buttons / list for `messageType: 'interactive'` (see parseInteractive). */
  interactive?: unknown;
  replyToMessageId?: string | null;
  /**
   * The signed-in teammate sending from the dashboard. Stored as
   * `messages.sender_id` so the inbox and Reports can attribute the reply.
   * Omitted for API-key sends, which have no user.
   */
  senderId?: string | null;
}

export interface SendMessageResult {
  /** Our `messages.id` (the persisted row). */
  messageId: string;
  /** Meta's `wamid` for the delivered message. */
  whatsappMessageId: string;
}

/**
 * Send a message in an existing conversation and persist it.
 *
 * `db` may be an RLS-scoped user client (dashboard) or the service-
 * role client (public API) — every query is filtered by `accountId`
 * either way, so tenancy holds regardless of which client is passed.
 */
/**
 * Validate the message-shape params (type, required content, caption
 * cap) independently of any DB state, throwing `SendMessageError` on a
 * bad payload. Exported so a caller can reject a malformed request
 * *before* it finds-or-creates a contact/conversation — otherwise an
 * invalid payload leaves an orphan empty conversation behind. The send
 * core calls this too, so validation can't be skipped.
 */
export function validateSendMessageParams(params: {
  messageType: string;
  contentText?: string | null;
  mediaUrl?: string | null;
  templateName?: string | null;
  interactive?: unknown;
}): void {
  const { messageType, contentText, mediaUrl, templateName } = params;

  if (!messageType) {
    throw new SendMessageError('bad_request', 'message_type is required', 400);
  }

  const isMediaKind = (MEDIA_KINDS as readonly string[]).includes(messageType);

  if (!(VALID_MESSAGE_TYPES as readonly string[]).includes(messageType)) {
    throw new SendMessageError(
      'bad_request',
      `Unsupported message_type "${messageType}"`,
      400
    );
  }

  if (messageType === 'text' && !contentText) {
    throw new SendMessageError(
      'bad_request',
      'content_text is required for text messages',
      400
    );
  }

  if (messageType === 'template' && !templateName) {
    throw new SendMessageError(
      'bad_request',
      'template_name is required for template messages',
      400
    );
  }

  if (messageType === 'interactive') {
    if (!contentText) {
      throw new SendMessageError(
        'bad_request',
        'text is required for interactive messages (the words above the buttons)',
        400
      );
    }
    if (contentText.length > INTERACTIVE_LIMITS.bodyMaxLength) {
      throw new SendMessageError(
        'bad_request',
        `Interactive text exceeds the ${INTERACTIVE_LIMITS.bodyMaxLength}-character limit`,
        400
      );
    }
    parseInteractive(params.interactive);
  }

  if (isMediaKind && !mediaUrl) {
    throw new SendMessageError(
      'bad_request',
      `media_url is required for ${messageType} messages`,
      400
    );
  }

  // The URL is stored and later rendered as a link in the inbox, so only
  // web URLs are accepted (never javascript:, data: and the like).
  if (mediaUrl && !/^https?:\/\//i.test(mediaUrl)) {
    throw new SendMessageError(
      'bad_request',
      'media_url must be an http(s) URL',
      400
    );
  }

  // Meta caps media captions at 1024 chars (audio carries none).
  if (
    isMediaKind &&
    messageType !== 'audio' &&
    typeof contentText === 'string' &&
    contentText.length > 1024
  ) {
    throw new SendMessageError(
      'bad_request',
      'Caption exceeds the 1024-character limit',
      400
    );
  }
}

export async function sendMessageToConversation(
  db: SupabaseClient,
  accountId: string,
  params: SendMessageParams
): Promise<SendMessageResult> {
  const {
    conversationId,
    messageType,
    contentText,
    mediaUrl,
    filename,
    templateName,
    templateLanguage,
    templateParams,
    templateMessageParams,
    replyToMessageId,
    senderId,
  } = params;

  if (!conversationId) {
    throw new SendMessageError(
      'bad_request',
      'conversation_id is required',
      400
    );
  }

  validateSendMessageParams({ messageType, contentText, mediaUrl, templateName, interactive: params.interactive });

  const isMediaKind = (MEDIA_KINDS as readonly string[]).includes(messageType);
  const interactive = messageType === 'interactive' ? parseInteractive(params.interactive) : null;

  // Conversation + contact, account-scoped.
  const { data: conversation, error: convError } = await db
    .from('conversations')
    .select('*, contact:contacts(*)')
    .eq('id', conversationId)
    .eq('account_id', accountId)
    .single();

  if (convError || !conversation) {
    throw new SendMessageError('not_found', 'Conversation not found', 404);
  }

  const contact = conversation.contact;
  // The phone number, or the BSUID of a username user whose number
  // Meta hides (see resolveSendTarget).
  const target = contact ? resolveSendTarget(contact) : null;
  if (!target?.ok) {
    throw new SendMessageError(
      'bad_request',
      target?.reason === 'invalid'
        ? 'Invalid phone number format'
        : 'Contact phone number not found',
      400
    );
  }
  const sanitizedPhone = target.to;

  // Trial or paid period over: the account is read-only.
  if (!(await accountCanSend(accountId))) {
    throw new SendMessageError('plan_expired', PLAN_EXPIRED_MESSAGE, 402);
  }

  // WhatsApp config, account-scoped.
  const { data: config, error: configError } = await db
    .from('whatsapp_config')
    .select('*')
    .eq('account_id', accountId)
    .single();

  if (configError || !config) {
    throw new SendMessageError(
      'whatsapp_not_configured',
      'WhatsApp not configured. Please set up your WhatsApp integration first.',
      400
    );
  }

  const accessToken = decrypt(config.access_token);

  // Self-heal legacy CBC ciphertexts. Fire-and-forget; idempotent.
  if (isLegacyFormat(config.access_token)) {
    void db
      .from('whatsapp_config')
      .update({ access_token: encrypt(accessToken) })
      .eq('id', config.id)
      .then(({ error }: { error: { message: string } | null }) => {
        if (error) {
          console.warn(
            '[send-message] access_token GCM upgrade failed:',
            error.message
          );
        }
      });
  }

  // Resolve the reply target to its Meta message_id. The parent must
  // belong to this same conversation — otherwise a caller could quote
  // messages they can't see by guessing UUIDs.
  let contextMessageId: string | undefined;
  if (replyToMessageId) {
    const { data: parent, error: parentError } = await db
      .from('messages')
      .select('message_id, conversation_id')
      .eq('id', replyToMessageId)
      .eq('conversation_id', conversationId)
      .maybeSingle();

    if (parentError || !parent) {
      throw new SendMessageError(
        'bad_request',
        'reply_to_message_id not found in this conversation',
        400
      );
    }
    if (!parent.message_id) {
      console.warn(
        '[send-message] reply target has no Meta message_id; sending without context'
      );
    } else {
      contextMessageId = parent.message_id;
    }
  }

  // Template row (for header + button components). isMessageTemplate
  // guards against a malformed local row crashing the send-builder.
  let templateRow: MessageTemplate | null = null;
  if (messageType === 'template' && templateName) {
    const { data } = await db
      .from('message_templates')
      .select('*')
      .eq('account_id', accountId)
      .eq('name', templateName)
      .eq('language', templateLanguage || 'en_US')
      .maybeSingle();
    if (data && !isMessageTemplate(data)) {
      throw new SendMessageError(
        'template_malformed',
        'Template row is malformed locally — run "Sync from Meta" in Settings to repair it.',
        500
      );
    }
    templateRow = data ?? null;
  }

  const attempt = async (phone: string): Promise<string> => {
    if (interactive?.kind === 'buttons') {
      const result = await sendInteractiveButtons({
        phoneNumberId: config.phone_number_id,
        accessToken,
        to: phone,
        bodyText: contentText!,
        buttons: interactive.buttons,
        headerImageUrl: interactive.header_image_url,
        headerText: interactive.header_text,
        footerText: interactive.footer,
        contextMessageId,
      });
      return result.messageId;
    }
    if (interactive?.kind === 'list') {
      const result = await sendInteractiveList({
        phoneNumberId: config.phone_number_id,
        accessToken,
        to: phone,
        bodyText: contentText!,
        buttonLabel: interactive.button,
        sections: interactive.sections,
        headerText: interactive.header_text,
        footerText: interactive.footer,
        contextMessageId,
      });
      return result.messageId;
    }
    if (messageType === 'template') {
      const result = await sendTemplateMessage({
        phoneNumberId: config.phone_number_id,
        accessToken,
        to: phone,
        templateName: templateName!,
        language: templateLanguage || 'en_US',
        template: templateRow ?? undefined,
        messageParams: templateMessageParams ?? undefined,
        params: templateParams || [],
        contextMessageId,
      });
      return result.messageId;
    }
    if (isMediaKind) {
      const result = await sendMediaMessage({
        phoneNumberId: config.phone_number_id,
        accessToken,
        to: phone,
        kind: messageType as MediaKind,
        link: mediaUrl!,
        caption: contentText || undefined,
        filename: filename || undefined,
        contextMessageId,
      });
      return result.messageId;
    }
    const result = await sendTextMessage({
      phoneNumberId: config.phone_number_id,
      accessToken,
      to: phone,
      text: contentText!,
      contextMessageId,
    });
    return result.messageId;
  };

  // Send via Meta — retry across phone-number variants if Meta rejects
  // with "recipient not in allowed list"; persist a working variant
  // back to the contact so the next send goes straight through.
  let waMessageId = '';
  let workingPhone = sanitizedPhone;
  try {
    const variants = target.variants;
    let lastError: unknown = null;

    for (const variant of variants) {
      try {
        waMessageId = await attempt(variant);
        workingPhone = variant;
        lastError = null;
        break;
      } catch (err) {
        const message = err instanceof Error ? err.message : String(err);
        if (!isRecipientNotAllowedError(message)) {
          throw err;
        }
        lastError = err;
        console.warn(
          `[send-message] variant "${variant}" rejected by Meta, trying next…`
        );
      }
    }

    if (lastError) throw lastError;
  } catch (err) {
    const message =
      err instanceof Error ? err.message : 'Unknown Meta API error';
    console.error('[send-message] Meta send failed for all variants:', message);
    throw new SendMessageError('meta_error', `Meta API error: ${message}`, 502);
  }

  if (workingPhone !== sanitizedPhone) {
    console.log(
      `[send-message] Auto-corrected contact phone: ${sanitizedPhone} → ${workingPhone}`
    );
    await db
      .from('contacts')
      .update({ phone: workingPhone })
      .eq('id', contact.id);
  }

  // Persist the sent message. Field names MUST match the messages
  // schema (see 001_initial_schema.sql).
  const { data: messageRecord, error: msgError } = await db
    .from('messages')
    .insert({
      conversation_id: conversationId,
      sender_type: 'agent',
      sender_id: senderId || null,
      content_type: messageType,
      content_text: contentText || null,
      // an interactive message's photo header shows in the inbox like a media message
      media_url: mediaUrl || (interactive?.kind === 'buttons' ? interactive.header_image_url : null) || null,
      template_name: templateName || null,
      message_id: waMessageId,
      status: 'sent',
      reply_to_message_id: replyToMessageId || null,
    })
    .select()
    .single();

  if (msgError) {
    console.error('[send-message] error inserting sent message:', msgError);
    throw new SendMessageError(
      'db_error',
      `Message sent to Meta but failed to save to DB: ${msgError.message}`,
      500
    );
  }

  await db
    .from('conversations')
    .update({
      last_message_text: contentText || `[${messageType}]`,
      last_message_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    })
    .eq('id', conversationId);

  // Pause any active Flow run for this contact — the agent stepping in
  // is the strongest "yield, human is here" signal. Best-effort.
  try {
    const { error: pauseErr } = await supabaseAdmin()
      .from('flow_runs')
      .update({
        status: 'paused_by_agent',
        ended_at: new Date().toISOString(),
        end_reason: 'agent_replied',
      })
      .eq('account_id', accountId)
      .eq('contact_id', contact.id)
      .eq('status', 'active');
    if (pauseErr) {
      console.error('[flows] pause-on-agent-send failed:', pauseErr.message);
    }
  } catch (err) {
    console.error(
      '[flows] pause-on-agent-send threw:',
      err instanceof Error ? err.message : err
    );
  }

  return { messageId: messageRecord.id, whatsappMessageId: waMessageId };
}
