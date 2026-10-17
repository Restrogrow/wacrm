// ============================================================
// Inbound webhook — processing one verified delivery. Server-only.
//
//   1. normalise the phone number (national numbers get the hook's calling code)
//   2. find or create the contact (same dedupe + race handling as the public API)
//   3. fill blank name/email/company (never overwrite what the team already has)
//   4. add tags (hook defaults + payload; existing tags are kept)
//   5. fill custom fields that already exist on the account (unknown names are reported)
//   6. add a contact note
//   7. optionally send an approved WhatsApp template (hook must have allow_send,
//      the contact must not have opted out, plan/trial checks run in the send path)
//
// Every delivery is logged in inbound_hook_deliveries. Nothing here throws.
// ============================================================

import type { SupabaseClient } from '@supabase/supabase-js';

import { findOrCreateContact, resolveAuditUserId, setContactTags, ContactError } from '@/lib/api/v1/contacts';
import { normalizeIntegrationPhone } from '@/lib/integrations/phone';
import { checkRateLimit } from '@/lib/rate-limit';
import { resolveConversationByPhone } from '@/lib/whatsapp/resolve-conversation';
import { SendMessageError, sendMessageToConversation } from '@/lib/whatsapp/send-message';
import { supabaseAdmin } from '@/lib/flows/admin-client';

import { mergeTags, type HookPayload } from './core';

export interface HookRow {
  id: string;
  account_id: string;
  name: string;
  allow_send: boolean;
  default_tags: string[] | null;
  default_country_code: string | null;
  enabled: boolean;
}

export const HOOK_COLUMNS = 'id, account_id, name, token_hash, allow_send, default_tags, default_country_code, enabled';

export interface HookResult {
  httpStatus: number;
  body: Record<string, unknown>;
}

const DELIVERY_RETENTION_DAYS = 30;

async function logDelivery(
  db: SupabaseClient,
  hook: HookRow,
  status: 'ok' | 'skipped' | 'failed',
  detail: string,
  extra: { contactId?: string | null; phone?: string | null } = {}
): Promise<void> {
  try {
    await db.from('inbound_hook_deliveries').insert({
      hook_id: hook.id,
      account_id: hook.account_id,
      status,
      contact_id: extra.contactId ?? null,
      phone: extra.phone ?? null,
      detail: detail.slice(0, 500),
    });
    if (Math.random() < 0.05) {
      const cutoff = new Date(Date.now() - DELIVERY_RETENTION_DAYS * 86_400_000).toISOString();
      await db.from('inbound_hook_deliveries').delete().eq('hook_id', hook.id).lt('created_at', cutoff);
    }
  } catch {
    // The log is a convenience; never fail a delivery because of it.
  }
}

/** Add tags without removing the contact's existing ones. */
async function addTags(
  db: SupabaseClient,
  accountId: string,
  auditUserId: string,
  contactId: string,
  wanted: string[]
): Promise<number> {
  if (wanted.length === 0) return 0;
  const { data } = await db.from('contact_tags').select('tags(name)').eq('contact_id', contactId);
  const current = ((data ?? []) as unknown as { tags: { name: string } | null }[])
    .map((r) => r.tags?.name)
    .filter((n): n is string => !!n);
  const have = new Set(current.map((n) => n.toLowerCase()));
  const added = wanted.filter((t) => !have.has(t.toLowerCase()));
  if (added.length === 0) return 0;
  await setContactTags(db, accountId, auditUserId, contactId, [...current, ...added]);
  return added.length;
}

async function applyCustomFields(
  db: SupabaseClient,
  accountId: string,
  contactId: string,
  values: Record<string, string>
): Promise<{ saved: number; unknown: string[] }> {
  const names = Object.keys(values);
  if (names.length === 0) return { saved: 0, unknown: [] };
  const { data: defs } = await db.from('custom_fields').select('id, field_name').eq('account_id', accountId);
  const byName = new Map(((defs ?? []) as { id: string; field_name: string }[]).map((d) => [d.field_name.trim().toLowerCase(), d.id]));
  const rows: { contact_id: string; custom_field_id: string; value: string }[] = [];
  const unknown: string[] = [];
  for (const name of names) {
    const id = byName.get(name.trim().toLowerCase());
    if (id) rows.push({ contact_id: contactId, custom_field_id: id, value: values[name] });
    else unknown.push(name);
  }
  if (rows.length > 0) {
    const { error } = await db.from('contact_custom_values').upsert(rows, { onConflict: 'contact_id,custom_field_id' });
    if (error) {
      console.error('[inbound-hook] custom fields not saved:', error.message);
      return { saved: 0, unknown };
    }
  }
  return { saved: rows.length, unknown };
}

export async function processInboundHook(hook: HookRow, payload: HookPayload): Promise<HookResult> {
  const db = supabaseAdmin();
  const accountId = hook.account_id;

  const phone = normalizeIntegrationPhone(payload.phone, payload.country, hook.default_country_code || '91');
  if (!phone) {
    await logDelivery(db, hook, 'failed', `"${payload.phone.slice(0, 40)}" is not a valid phone number`, { phone: payload.phone.slice(0, 40) });
    return { httpStatus: 400, body: { error: "'phone' is not a valid phone number. Use international format, e.g. +919876543210" } };
  }

  try {
    const auditUserId = await resolveAuditUserId(db, accountId);
    const { id: contactId, created } = await findOrCreateContact(db, accountId, auditUserId, {
      phone,
      name: payload.name,
      email: payload.email,
      company: payload.company,
    });

    // Fill blanks on an existing contact; never overwrite what the team typed.
    let optedOut = false;
    if (!created) {
      const { data: existing } = await db
        .from('contacts')
        .select('name, phone, email, company, opted_out_at')
        .eq('id', contactId)
        .eq('account_id', accountId)
        .maybeSingle();
      if (existing) {
        optedOut = !!existing.opted_out_at;
        const patch: Record<string, string> = {};
        const nameIsPlaceholder = !existing.name || String(existing.name).replace(/\D/g, '') === String(existing.phone ?? '').replace(/\D/g, '');
        if (payload.name && nameIsPlaceholder) patch.name = payload.name;
        if (payload.email && !existing.email) patch.email = payload.email;
        if (payload.company && !existing.company) patch.company = payload.company;
        if (Object.keys(patch).length > 0) {
          await db.from('contacts').update(patch).eq('id', contactId).eq('account_id', accountId);
        }
      }
    }

    const tagsAdded = await addTags(db, accountId, auditUserId, contactId, mergeTags(hook.default_tags ?? [], payload.tags));
    const custom = await applyCustomFields(db, accountId, contactId, payload.customFields);

    if (payload.note) {
      await db.from('contact_notes').insert({
        contact_id: contactId,
        account_id: accountId,
        user_id: auditUserId,
        note_text: `[${hook.name}] ${payload.note}`.slice(0, 2000),
      });
    }

    // Optional template message.
    let template: { status: 'sent' | 'skipped' | 'failed'; detail?: string } | undefined;
    if (payload.template) {
      if (!hook.allow_send) {
        template = { status: 'skipped', detail: 'This webhook is not allowed to send messages. Turn on "Allow sending templates" in Settings.' };
      } else if (optedOut) {
        template = { status: 'skipped', detail: 'The contact has opted out of messages' };
      } else if (!checkRateLimit(`hook-send:${hook.id}`, { limit: 30, windowMs: 60_000 }).success) {
        template = { status: 'skipped', detail: 'Sending limit reached (30 messages a minute per webhook). Try again shortly.' };
      } else {
        try {
          const { conversationId } = await resolveConversationByPhone(db, accountId, phone, payload.name);
          await sendMessageToConversation(db, accountId, {
            conversationId,
            messageType: 'template',
            templateName: payload.template.name,
            templateLanguage: payload.template.language,
            templateMessageParams: { body: payload.template.params },
          });
          template = { status: 'sent' };
        } catch (err) {
          const detail = err instanceof SendMessageError || err instanceof Error ? err.message : 'Could not send';
          template = { status: 'failed', detail: detail.slice(0, 300) };
        }
      }
    }

    const parts = [created ? 'contact created' : 'contact updated'];
    if (tagsAdded) parts.push(`${tagsAdded} tag${tagsAdded === 1 ? '' : 's'} added`);
    if (custom.saved) parts.push(`${custom.saved} custom field${custom.saved === 1 ? '' : 's'} saved`);
    if (custom.unknown.length) parts.push(`unknown custom fields ignored: ${custom.unknown.slice(0, 5).join(', ')}`);
    if (payload.note) parts.push('note added');
    if (template) parts.push(`template ${template.status}${template.detail ? ` (${template.detail})` : ''}`);

    const failed = template?.status === 'failed';
    await logDelivery(db, hook, failed ? 'failed' : 'ok', parts.join('; '), { contactId, phone });

    return {
      httpStatus: 200,
      body: {
        ok: true,
        contact_id: contactId,
        created,
        tags_added: tagsAdded,
        custom_fields_saved: custom.saved,
        custom_fields_ignored: custom.unknown,
        ...(template ? { template: template.status, ...(template.detail ? { template_detail: template.detail } : {}) } : {}),
      },
    };
  } catch (err) {
    if (err instanceof ContactError) {
      await logDelivery(db, hook, 'failed', err.message, { phone });
      return { httpStatus: err.status >= 500 ? 500 : 400, body: { error: err.message } };
    }
    console.error('[inbound-hook] processing failed:', err instanceof Error ? err.message : err);
    await logDelivery(db, hook, 'failed', 'Unexpected error while saving the contact', { phone });
    return { httpStatus: 500, body: { error: 'Could not save the contact' } };
  }
}
