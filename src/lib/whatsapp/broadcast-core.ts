// ============================================================
// Public-API broadcast core.
//
// createBroadcast() validates, resolves contacts and stores the
// `broadcasts` row + its `broadcast_recipients` rows (status 'pending',
// each with its template params). The sending itself is done by the
// server-side broadcast sender (lib/broadcasts/scheduled.ts), which the
// route starts in `after()` and the every-minute cron continues, so a
// large broadcast never times out half-way.
//
// Recipient rows carry `whatsapp_message_id`, so the inbound webhook's
// status handler (which matches on that column) updates delivered/read
// for API broadcasts exactly as it does for dashboard ones.
// ============================================================

import type { SupabaseClient } from '@supabase/supabase-js';

import { sanitizePhoneForMeta, isValidE164 } from '@/lib/whatsapp/phone-utils';
import { isMessageTemplate } from '@/lib/whatsapp/template-row-guard';
import { findOrCreateContact } from '@/lib/api/v1/contacts';
import { loadOptedOutPhones, phoneKey } from '@/lib/contacts/opt-out';
import { accountCanSend } from '@/lib/billing/server';
import { PLAN_EXPIRED_MESSAGE, planLimitMessage } from '@/lib/billing/plans';

/** Thrown by createBroadcast on a caller-visible failure; route maps it. */
export class BroadcastError extends Error {
  readonly code: string;
  readonly status: number;
  constructor(code: string, message: string, status: number) {
    super(message);
    this.name = 'BroadcastError';
    this.code = code;
    this.status = status;
  }
}

export interface BroadcastRecipientInput {
  /** E.164 phone. */
  to: string;
  /** Positional body params for the template ({{1}}, {{2}}…). */
  params?: string[];
}

export interface CreateBroadcastParams {
  name?: string | null;
  templateName: string;
  templateLanguage?: string | null;
  recipients: BroadcastRecipientInput[];
}

export interface BroadcastPlan {
  broadcastId: string;
  /** Recipients stored for sending. */
  accepted: number;
  /** Phones rejected up front (invalid E.164 / opted out). */
  rejected: number;
}

const MAX_RECIPIENTS = 1000;

/**
 * Validate + persist a broadcast, resolving each recipient to a
 * contact, ready for the server-side sender. Throws
 * {@link BroadcastError} on bad input / missing config / a malformed
 * template / a DB failure — nothing is sent in this phase.
 */
export async function createBroadcast(
  db: SupabaseClient,
  accountId: string,
  auditUserId: string,
  params: CreateBroadcastParams
): Promise<BroadcastPlan> {
  const { name, templateName, recipients } = params;
  const templateLanguage = params.templateLanguage || 'en_US';

  if (!templateName) {
    throw new BroadcastError('bad_request', "'template_name' is required", 400);
  }
  if (!Array.isArray(recipients) || recipients.length === 0) {
    throw new BroadcastError(
      'bad_request',
      "'recipients' must be a non-empty array of { to, params? }",
      400
    );
  }
  if (recipients.length > MAX_RECIPIENTS) {
    throw new BroadcastError(
      'bad_request',
      `A broadcast is capped at ${MAX_RECIPIENTS} recipients per request; split larger sends`,
      400
    );
  }

  // Trial or paid period over: the account is read-only.
  if (!(await accountCanSend(accountId))) {
    throw new BroadcastError('plan_expired', PLAN_EXPIRED_MESSAGE, 402);
  }

  // Fail fast when WhatsApp isn't connected (the sender re-reads it).
  const { data: config, error: configError } = await db
    .from('whatsapp_config')
    .select('phone_number_id')
    .eq('account_id', accountId)
    .single();
  if (configError || !config) {
    throw new BroadcastError(
      'whatsapp_not_configured',
      'WhatsApp not configured. Please set up your WhatsApp integration first.',
      400
    );
  }

  // Guard a malformed local template row up front rather than N
  // identical opaque failures later.
  const { data: rawTemplateRow } = await db
    .from('message_templates')
    .select('*')
    .eq('account_id', accountId)
    .eq('name', templateName)
    .eq('language', templateLanguage)
    .maybeSingle();
  if (rawTemplateRow && !isMessageTemplate(rawTemplateRow)) {
    throw new BroadcastError(
      'template_malformed',
      'Template row is malformed locally — run "Sync from Meta" in Settings to repair it before broadcasting.',
      500
    );
  }

  // Resolve each recipient to a contact. Invalid phones are dropped
  // (counted as rejected) rather than aborting the whole broadcast.
  // Contacts who replied STOP are skipped (WhatsApp policy) and
  // counted as rejected, like invalid numbers.
  const optedOut = await loadOptedOutPhones(db, accountId);
  const resolved: { contactId: string; phone: string; params: string[] }[] = [];
  let rejected = 0;
  for (const r of recipients) {
    const sanitized = sanitizePhoneForMeta(typeof r.to === 'string' ? r.to : '');
    if (!isValidE164(sanitized) || optedOut.has(phoneKey(sanitized))) {
      rejected++;
      continue;
    }
    const { id } = await findOrCreateContact(db, accountId, auditUserId, {
      phone: sanitized,
    });
    resolved.push({
      contactId: id,
      phone: sanitized,
      params: Array.isArray(r.params)
        ? r.params.filter((p): p is string => typeof p === 'string')
        : [],
    });
  }

  // Collapse recipients that resolved to the SAME contact (the caller
  // listed a phone twice, or two numbers fuzzy-matched to one contact).
  // Keep the first occurrence so the contact is messaged once and its
  // params aren't silently overwritten by a later duplicate — and so
  // the row↔params pairing below (keyed by contact_id) is unambiguous.
  const seenContact = new Set<string>();
  const deduped = resolved.filter((r) => {
    if (seenContact.has(r.contactId)) return false;
    seenContact.add(r.contactId);
    return true;
  });

  if (deduped.length === 0) {
    throw new BroadcastError(
      'bad_request',
      'No recipients left to send to (invalid phone numbers or contacts who opted out)',
      400
    );
  }

  // Persist the broadcast + its recipients. It is stored as 'draft' and
  // only flipped to 'sending' once every recipient row is in, so the
  // cron never starts (and finishes) a half-built broadcast. The count columns
  // (sent/delivered/read/replied/failed) are owned by the DB aggregate
  // trigger (migrations 003/005) and derived purely from
  // broadcast_recipients rows — we deliberately do NOT seed them here
  // (a manual value would be clobbered by the trigger on the first
  // recipient change). `rejected` phones have no recipient row, so they
  // are reported to the caller in the POST response, not in these
  // persisted counts.
  const { data: broadcast, error: bErr } = await db
    .from('broadcasts')
    .insert({
      account_id: accountId,
      user_id: auditUserId,
      name: name || `API broadcast (${templateName})`,
      template_name: templateName,
      template_language: templateLanguage,
      status: 'draft',
      scheduled_at: new Date().toISOString(),
      total_recipients: deduped.length,
    })
    .select('id')
    .single();
  if (bErr || !broadcast) {
    const limitMessage = planLimitMessage(bErr);
    if (limitMessage) throw new BroadcastError('plan_limit', limitMessage, 402);
    console.error('[broadcast-core] create broadcast error:', bErr);
    throw new BroadcastError('internal', 'Failed to create broadcast', 500);
  }

  const { error: rErr } = await db
    .from('broadcast_recipients')
    .insert(
      deduped.map((r) => ({
        broadcast_id: broadcast.id,
        contact_id: r.contactId,
        status: 'pending' as const,
        params: r.params,
      }))
    );
  if (rErr) {
    console.error('[broadcast-core] create recipients error:', rErr);
    await db.from('broadcasts').delete().eq('id', broadcast.id);
    throw new BroadcastError('internal', 'Failed to create broadcast', 500);
  }

  const { error: startErr } = await db
    .from('broadcasts')
    .update({ status: 'sending' })
    .eq('id', broadcast.id);
  if (startErr) {
    console.error('[broadcast-core] start broadcast error:', startErr);
    throw new BroadcastError('internal', 'Failed to start broadcast', 500);
  }

  return { broadcastId: broadcast.id, accepted: deduped.length, rejected };
}
