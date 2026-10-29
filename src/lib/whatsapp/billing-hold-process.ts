// ============================================================
// Billing hold, release side (see billing-hold.ts). Server-only.
// Runs from the automations cron.
//
//   1. Accounts on hold are re-checked every 15 minutes: the oldest
//      held message is tried; if Meta takes it, the hold ends. With
//      nothing held (only broadcasts waiting), Meta's account health
//      decides: no payment problem → the hold ends, broadcasts resume
//      (and the first 131042 puts it straight back).
//   2. Held messages of accounts not on hold are sent, oldest first,
//      into their existing "sending" chat rows.
// ============================================================

import { isTransientSendError } from '@/lib/broadcasts/scheduled';
import { supabaseAdmin } from '@/lib/flows/admin-client';
import { decrypt } from '@/lib/whatsapp/encryption';
import { sendMessageToConversation, SendMessageError, type SendMessageParams } from '@/lib/whatsapp/send-message';
import { fetchWabaBilling, isPaymentError } from '@/lib/whatsapp/spend';

import { clearBillingHold, startBillingHold, type HeldParams } from './billing-hold';

const RECHECK_MINUTES = 15;
const RELEASE_PER_RUN = 60;
/** Tries for a held message that keeps hitting temporary Meta errors. */
const MAX_ATTEMPTS = 5;

interface HeldRow {
  id: string;
  account_id: string;
  message_row_id: string | null;
  params: HeldParams;
  attempts: number;
}

type ReleaseResult = 'sent' | 'held' | 'retry' | 'failed';

/** Send one held message. Never throws. */
async function releaseOne(row: HeldRow): Promise<ReleaseResult> {
  const db = supabaseAdmin();
  try {
    await sendMessageToConversation(db, row.account_id, {
      ...(row.params as SendMessageParams),
      releasingHeld: { messageRowId: row.message_row_id },
    });
    await db
      .from('held_messages')
      .update({ status: 'sent', sent_at: new Date().toISOString(), last_error: null })
      .eq('id', row.id);
    return 'sent';
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    const attempts = row.attempts + 1;
    if (err instanceof SendMessageError && err.code === 'billing_hold') {
      await startBillingHold(row.account_id, 'Meta still cannot charge your payment method (error 131042).');
      await db.from('held_messages').update({ attempts, last_error: message }).eq('id', row.id);
      return 'held';
    }
    if (isTransientSendError(message) && attempts < MAX_ATTEMPTS) {
      await db.from('held_messages').update({ attempts, last_error: message }).eq('id', row.id);
      return 'retry';
    }
    // Something else is wrong (template deleted, plan ended, …): this
    // one really can't be sent. Show it as failed in the chat.
    await db.from('held_messages').update({ status: 'failed', attempts, last_error: message }).eq('id', row.id);
    if (row.message_row_id) {
      await db.from('messages').update({ status: 'failed' }).eq('id', row.message_row_id);
    }
    return 'failed';
  }
}

/** Re-check accounts on hold; end the hold when billing works again. */
async function recheckHolds(): Promise<void> {
  const db = supabaseAdmin();
  const dueBefore = new Date(Date.now() - RECHECK_MINUTES * 60_000).toISOString();
  const { data: configs, error } = await db
    .from('whatsapp_config')
    .select('account_id, waba_id, access_token')
    .not('billing_hold_at', 'is', null)
    .or(`billing_hold_checked_at.is.null,billing_hold_checked_at.lt."${dueBefore}"`)
    .limit(20);
  if (error) {
    if (/billing_hold/.test(error.message)) return; // migration 091 not applied
    throw new Error(error.message);
  }

  for (const cfg of configs ?? []) {
    const accountId = cfg.account_id as string;
    await db
      .from('whatsapp_config')
      .update({ billing_hold_checked_at: new Date().toISOString() })
      .eq('account_id', accountId);

    const { data: oldest } = await db
      .from('held_messages')
      .select('id, account_id, message_row_id, params, attempts')
      .eq('account_id', accountId)
      .eq('status', 'held')
      .order('created_at', { ascending: true })
      .limit(1)
      .maybeSingle();

    if (oldest) {
      // The real test: does Meta take a paid message now?
      const result = await releaseOne(oldest as HeldRow);
      if (result !== 'held') await clearBillingHold(accountId);
      continue;
    }

    // Only broadcasts are waiting: ask Meta about the account instead.
    if (!cfg.waba_id || !cfg.access_token) continue;
    try {
      const billing = await fetchWabaBilling(cfg.waba_id as string, decrypt(cfg.access_token as string));
      const stillBroken = billing.canSend === 'BLOCKED' || billing.healthErrors.some(isPaymentError);
      if (!stillBroken) await clearBillingHold(accountId);
    } catch (err) {
      console.warn('[billing-hold] re-check failed:', accountId, err instanceof Error ? err.message : err);
    }
  }
}

/** Send held messages of accounts that are no longer on hold. */
async function releaseWaiting(): Promise<number> {
  const db = supabaseAdmin();
  const { data: rows, error } = await db
    .from('held_messages')
    .select('id, account_id, message_row_id, params, attempts')
    .eq('status', 'held')
    .order('created_at', { ascending: true })
    .limit(RELEASE_PER_RUN);
  if (error || !rows?.length) return 0;

  const accountIds = [...new Set(rows.map((r) => r.account_id as string))];
  const { data: onHold } = await db
    .from('whatsapp_config')
    .select('account_id')
    .in('account_id', accountIds)
    .not('billing_hold_at', 'is', null);
  const blocked = new Set((onHold ?? []).map((c) => c.account_id as string));

  let sent = 0;
  for (const row of rows as HeldRow[]) {
    if (blocked.has(row.account_id)) continue;
    const result = await releaseOne(row);
    if (result === 'sent') sent++;
    // Back on hold: leave the rest of this account's messages waiting.
    if (result === 'held') blocked.add(row.account_id);
  }
  return sent;
}

/** Cron entry point. Returns how many held messages went out. */
export async function processBillingHolds(): Promise<number> {
  await recheckHolds();
  return releaseWaiting();
}
