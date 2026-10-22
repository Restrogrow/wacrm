// ============================================================
// Scheduled broadcasts — sent by the server. Server-only.
//
// The wizard's "Schedule for later" (hooks/use-broadcast-sending.ts)
// stores the broadcast with status 'scheduled', scheduled_at, and each
// recipient's template values (migration 043). The every-minute
// automations cron calls processScheduledBroadcasts(), which:
//
//   1. claims due broadcasts (scheduled → sending),
//   2. sends pending recipients in time-boxed batches under a short
//      lease (one cron run per broadcast at a time), so a large
//      broadcast continues over several runs instead of timing out,
//   3. marks the broadcast sent (or failed if every send failed).
//
// Same rules as sending now: opted-out contacts are skipped, the
// account must be able to send (trial/plan), and recipient statuses
// feed the existing count triggers and delivery webhooks.
// ============================================================

import { supabaseAdmin } from '@/lib/flows/admin-client';
import { accountCanSend } from '@/lib/billing/server';
import { PLAN_EXPIRED_MESSAGE } from '@/lib/billing/plans';
import { loadOptedOutPhones, phoneKey } from '@/lib/contacts/opt-out';
import { decrypt } from '@/lib/whatsapp/encryption';
import { sendTemplateMessage } from '@/lib/whatsapp/meta-api';
import {
  isRecipientNotAllowedError,
  isValidE164,
  phoneVariants,
  sanitizePhoneForMeta,
} from '@/lib/whatsapp/phone-utils';
import { isMessageTemplate } from '@/lib/whatsapp/template-row-guard';
import type { SendTimeParams } from '@/lib/whatsapp/template-send-builder';

/** Leave headroom inside the cron route's 60 s limit. */
const TIME_BUDGET_MS = 40_000;
const BATCH = 60;

interface ScheduledBroadcast {
  id: string;
  account_id: string;
  template_name: string;
  template_language: string | null;
  message_params: SendTimeParams | null;
  phone_number_id: string | null;
}

async function failRemaining(broadcastId: string, message: string) {
  const db = supabaseAdmin();
  await db
    .from('broadcast_recipients')
    .update({ status: 'failed', error_message: message })
    .eq('broadcast_id', broadcastId)
    .eq('status', 'pending');
  await db
    .from('broadcasts')
    .update({ status: 'failed' })
    .eq('id', broadcastId);
}

async function finishIfDone(broadcastId: string) {
  const db = supabaseAdmin();
  const { count: pending } = await db
    .from('broadcast_recipients')
    .select('id', { count: 'exact', head: true })
    .eq('broadcast_id', broadcastId)
    .eq('status', 'pending');
  if ((pending ?? 0) > 0) return;
  const { count: notFailed } = await db
    .from('broadcast_recipients')
    .select('id', { count: 'exact', head: true })
    .eq('broadcast_id', broadcastId)
    .neq('status', 'failed');
  await db
    .from('broadcasts')
    .update({ status: (notFailed ?? 0) > 0 ? 'sent' : 'failed' })
    .eq('id', broadcastId);
}

/** Send what's due; returns how many messages were sent this run. */
export async function processScheduledBroadcasts(): Promise<number> {
  const db = supabaseAdmin();
  const started = Date.now();
  const nowIso = new Date().toISOString();

  // Claim newly due broadcasts.
  const { data: due, error } = await db
    .from('broadcasts')
    .select('id')
    .eq('status', 'scheduled')
    .lte('scheduled_at', nowIso)
    .limit(10);
  if (error) return 0; // migration 043 missing, or nothing to do
  for (const b of due ?? []) {
    await db
      .from('broadcasts')
      .update({ status: 'sending' })
      .eq('id', b.id)
      .eq('status', 'scheduled');
  }

  // Everything in flight that the server owns (scheduled ones carry
  // scheduled_at; browser-driven sends don't and are left alone).
  const { data: inFlight } = await db
    .from('broadcasts')
    .select('id, account_id, template_name, template_language, message_params, phone_number_id')
    .eq('status', 'sending')
    .not('scheduled_at', 'is', null)
    .lte('scheduled_at', nowIso)
    .order('scheduled_at', { ascending: true })
    .limit(10);

  let sent = 0;
  for (const broadcast of (inFlight ?? []) as ScheduledBroadcast[]) {
    if (Date.now() - started > TIME_BUDGET_MS) break;

    // Lease the broadcast so an overlapping cron run can't send the
    // same recipients twice.
    const leaseNow = new Date().toISOString();
    const { data: lease } = await db
      .from('broadcasts')
      .update({ send_lease_until: new Date(Date.now() + 55_000).toISOString() })
      .eq('id', broadcast.id)
      .or(`send_lease_until.is.null,send_lease_until.lt.${leaseNow}`)
      .select('id')
      .maybeSingle();
    if (!lease) continue;

    if (!(await accountCanSend(broadcast.account_id))) {
      await failRemaining(broadcast.id, PLAN_EXPIRED_MESSAGE);
      continue;
    }

    const { data: config } = await db
      .from('whatsapp_config')
      .select('phone_number_id, access_token')
      .eq('account_id', broadcast.account_id)
      .maybeSingle();
    if (!config) {
      await failRemaining(broadcast.id, 'WhatsApp is not connected');
      continue;
    }
    // Scheduled on a number the account has since swapped out (migration 083):
    // don't send it from the new one.
    if (broadcast.phone_number_id && config.phone_number_id !== broadcast.phone_number_id) {
      await failRemaining(broadcast.id, 'Not sent: it was scheduled on a WhatsApp number that is no longer connected.');
      continue;
    }
    const accessToken = decrypt(config.access_token);
    const language = broadcast.template_language || 'en_US';

    const { data: rawTemplate } = await db
      .from('message_templates')
      .select('*')
      .eq('account_id', broadcast.account_id)
      .eq('name', broadcast.template_name)
      .eq('language', language)
      .maybeSingle();
    const template =
      rawTemplate && isMessageTemplate(rawTemplate) ? rawTemplate : undefined;
    const optedOut = await loadOptedOutPhones(db, broadcast.account_id);

    while (Date.now() - started < TIME_BUDGET_MS) {
      const { data: batch } = await db
        .from('broadcast_recipients')
        .select('id, params, contact:contacts(phone)')
        .eq('broadcast_id', broadcast.id)
        .eq('status', 'pending')
        .limit(BATCH);
      if (!batch || batch.length === 0) break;

      for (const row of batch) {
        if (Date.now() - started > TIME_BUDGET_MS) break;
        const contact = (
          Array.isArray(row.contact) ? row.contact[0] : row.contact
        ) as { phone: string | null } | null;
        const phone = sanitizePhoneForMeta(contact?.phone ?? '');

        const fail = (message: string) =>
          db
            .from('broadcast_recipients')
            .update({ status: 'failed', error_message: message })
            .eq('id', row.id);

        if (!isValidE164(phone)) {
          await fail('No valid phone number');
          continue;
        }
        if (optedOut.has(phoneKey(phone))) {
          await fail('Opted out (replied STOP)');
          continue;
        }

        let messageId: string | null = null;
        let lastError = 'Unknown error';
        for (const variant of phoneVariants(phone)) {
          try {
            const result = await sendTemplateMessage({
              phoneNumberId: config.phone_number_id,
              accessToken,
              to: variant,
              templateName: broadcast.template_name,
              language,
              template,
              messageParams: broadcast.message_params ?? undefined,
              params: Array.isArray(row.params) ? row.params.map(String) : [],
            });
            messageId = result.messageId;
            break;
          } catch (err) {
            lastError = err instanceof Error ? err.message : String(err);
            if (!isRecipientNotAllowedError(lastError)) break;
          }
        }

        if (messageId) {
          sent++;
          await db
            .from('broadcast_recipients')
            .update({
              status: 'sent',
              sent_at: new Date().toISOString(),
              whatsapp_message_id: messageId,
              error_message: null,
            })
            .eq('id', row.id);
        } else {
          await fail(lastError);
        }
      }
    }

    await finishIfDone(broadcast.id);
    await db
      .from('broadcasts')
      .update({ send_lease_until: null })
      .eq('id', broadcast.id);
  }
  return sent;
}
