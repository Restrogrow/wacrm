// ============================================================
// Billing hold: never lose a message to a Meta payment problem.
// Server-only. Schema and rules: migration 091.
//
// Meta refuses paid messages with error 131042 when it can't charge
// the business. Instead of failing every broadcast recipient and every
// order update, the account goes "on hold":
//
//   - templates are kept in held_messages (the chat shows "sending")
//   - broadcasts stop; their remaining recipients stay pending
//   - billing-hold-process.ts sends everything once billing works again
//     (Resume button, or the automatic re-check every 15 minutes)
//
// Free replies inside the 24-hour window keep sending during a hold:
// Meta doesn't charge for them. If one ever fails with 131042 it is
// held like a template.
//
// This module has no dependency on send-message.ts (which uses it);
// the release side lives in billing-hold-process.ts.
// ============================================================

import type { SupabaseClient } from '@supabase/supabase-js';

import { supabaseAdmin } from '@/lib/flows/admin-client';

/** Meta: "Business eligibility payment issue". */
export const PAYMENT_ERROR_CODE = 131042;

export const HOLD_WAITING_TEXT =
  'Waiting: WhatsApp billing problem. Sends automatically once billing works.';

/** True for Meta's payment error, as a code or inside an error message. */
export function isBillingError(error: unknown): boolean {
  if (error === PAYMENT_ERROR_CODE) return true;
  const text = error instanceof Error ? error.message : String(error ?? '');
  return /\b131042\b|eligibility payment|payment issue/i.test(text);
}

export interface BillingHold {
  since: string;
  reason: string | null;
}

/** The account's hold, or null. Null too before migration 091. */
export async function getBillingHold(accountId: string): Promise<BillingHold | null> {
  const { data, error } = await supabaseAdmin()
    .from('whatsapp_config')
    .select('billing_hold_at, billing_hold_reason')
    .eq('account_id', accountId)
    .maybeSingle();
  if (error || !data?.billing_hold_at) return null;
  return { since: data.billing_hold_at as string, reason: (data.billing_hold_reason as string | null) ?? null };
}

/** Put the account on hold (no-op when it already is). */
export async function startBillingHold(accountId: string, reason: string): Promise<void> {
  const now = new Date().toISOString();
  const { error } = await supabaseAdmin()
    .from('whatsapp_config')
    .update({
      billing_hold_at: now,
      billing_hold_reason: reason.slice(0, 300),
      // Wait a full interval before the first automatic re-check.
      billing_hold_checked_at: now,
    })
    .eq('account_id', accountId)
    .is('billing_hold_at', null);
  if (error) console.error('[billing-hold] could not start hold:', error.message);
  else console.warn('[billing-hold] account on hold:', accountId, reason);
}

export async function clearBillingHold(accountId: string): Promise<void> {
  await supabaseAdmin()
    .from('whatsapp_config')
    .update({ billing_hold_at: null, billing_hold_reason: null, billing_hold_checked_at: null })
    .eq('account_id', accountId);
}

/** What a held message needs to be sent later (SendMessageParams, minus internals). */
export interface HeldParams {
  conversationId: string;
  messageType: string;
  contentText?: string | null;
  mediaUrl?: string | null;
  filename?: string | null;
  templateName?: string | null;
  templateLanguage?: string | null;
  templateParams?: string[];
  templateMessageParams?: unknown;
  interactive?: unknown;
  planExempt?: boolean;
  replyToMessageId?: string | null;
  senderId?: string | null;
  senderType?: 'agent' | 'bot';
}

export function heldParams(p: HeldParams): HeldParams {
  return JSON.parse(
    JSON.stringify({
      conversationId: p.conversationId,
      messageType: p.messageType,
      contentText: p.contentText ?? null,
      mediaUrl: p.mediaUrl ?? null,
      filename: p.filename ?? null,
      templateName: p.templateName ?? null,
      templateLanguage: p.templateLanguage ?? null,
      templateParams: p.templateParams ?? [],
      templateMessageParams: p.templateMessageParams ?? null,
      interactive: p.interactive ?? null,
      planExempt: p.planExempt ?? false,
      replyToMessageId: p.replyToMessageId ?? null,
      senderId: p.senderId ?? null,
      senderType: p.senderType ?? 'agent',
    })
  ) as HeldParams;
}

/**
 * Keep a message for later: a "sending" row in the chat now, and a
 * held_messages row the release job sends from. Pass `messageRowId`
 * when the chat row already exists (a message Meta failed after
 * accepting it); it is reset to "sending" instead of adding a new one.
 * Returns the chat row id.
 */
export async function queueHeldMessage(
  accountId: string,
  params: HeldParams,
  messageRowId?: string | null
): Promise<string> {
  const db = supabaseAdmin();
  const stored = heldParams(params);
  let rowId = messageRowId ?? null;

  if (rowId) {
    await db.from('messages').update({ status: 'sending', message_id: null }).eq('id', rowId);
  } else {
    const { data, error } = await db
      .from('messages')
      .insert({
        conversation_id: stored.conversationId,
        sender_type: stored.senderType ?? 'agent',
        sender_id: stored.senderId ?? null,
        content_type: stored.messageType,
        content_text: stored.contentText ?? null,
        media_url: stored.mediaUrl ?? null,
        template_name: stored.templateName ?? null,
        status: 'sending',
        reply_to_message_id: stored.replyToMessageId ?? null,
      })
      .select('id')
      .single();
    if (error || !data) throw new Error(`could not hold message: ${error?.message ?? 'insert failed'}`);
    rowId = data.id as string;
    await db
      .from('conversations')
      .update({
        last_message_text: stored.contentText || `[${stored.messageType}]`,
        last_message_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      })
      .eq('id', stored.conversationId);
  }

  const { error } = await db.from('held_messages').insert({
    account_id: accountId,
    conversation_id: stored.conversationId,
    message_row_id: rowId,
    params: stored,
  });
  if (error) throw new Error(`could not hold message: ${error.message}`);
  return rowId;
}

/** Put a message Meta failed with 131042 (status webhook) back in line. */
export async function holdFailedMessage(accountId: string, messageRowId: string, sendParams: HeldParams): Promise<void> {
  await startBillingHold(accountId, 'Meta could not charge your payment method (error 131042).');
  await queueHeldMessage(accountId, sendParams, messageRowId);
}

/** Put a broadcast recipient Meta failed with 131042 back to pending. */
export async function holdFailedRecipient(
  db: SupabaseClient,
  accountId: string,
  recipientId: string,
  broadcastId: string
): Promise<void> {
  await startBillingHold(accountId, 'Meta could not charge your payment method (error 131042).');
  await db
    .from('broadcast_recipients')
    .update({ status: 'pending', whatsapp_message_id: null, sent_at: null, error_message: HOLD_WAITING_TEXT })
    .eq('id', recipientId);
  // A broadcast that already finished goes back to sending, so the cron
  // continues it after the hold.
  await db
    .from('broadcasts')
    .update({ status: 'sending', updated_at: new Date().toISOString() })
    .eq('id', broadcastId)
    .in('status', ['sent', 'failed'])
    .not('scheduled_at', 'is', null);
}
