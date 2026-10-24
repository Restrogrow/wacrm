// ============================================================
// Broadcasts are sent by the server. Server-only.
//
// Every broadcast — "Send now" in the wizard, "Schedule for later" and
// POST /api/v1/broadcasts — is stored first: the broadcast row with
// scheduled_at (now, or the chosen time) and one 'pending'
// broadcast_recipients row per contact carrying its template values
// (migration 043). Sending then happens here, never in the browser:
//
//   - sendBroadcastNow(id) starts a "Send now" broadcast straight away
//     (called from `after()` by /api/broadcasts/[id]/send and the v1 API);
//   - the every-minute automations cron calls processScheduledBroadcasts(),
//     which claims due broadcasts (scheduled → sending) and continues
//     every broadcast still in flight.
//
// Each run sends pending recipients in time-boxed batches under a short
// lease (one runner per broadcast at a time), so a large broadcast
// continues over several runs instead of timing out, and a closed tab or
// a restart never leaves it stuck on "sending". Temporary Meta errors
// (rate limits, Meta outages, network) are retried with backoff
// (migration 085: attempts / next_attempt_at); permanent ones fail the
// recipient. When nothing is pending any more the broadcast is marked
// sent (or failed if every send failed).
//
// Same rules as before: opted-out contacts are skipped, the account must
// be able to send (trial/plan), and recipient statuses feed the existing
// count triggers and delivery webhooks.
// ============================================================

import { supabaseAdmin } from '@/lib/flows/admin-client';
import { accountCanSend } from '@/lib/billing/server';
import { PLAN_EXPIRED_MESSAGE } from '@/lib/billing/plans';
import { DEMO_BLOCKED_MESSAGE } from '@/lib/auth/demo-guard';
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
import type { MessageTemplate } from '@/types';

/** Leave headroom inside the routes' 60 s limit. */
const TIME_BUDGET_MS = 40_000;
const BATCH = 60;
/** Parallel Meta calls per broadcast; well under Meta's 80 msg/s. */
const CONCURRENCY = 10;
/** Lease length; longer than TIME_BUDGET_MS plus one slow batch. */
const LEASE_MS = 55_000;
/** Total tries for a recipient that keeps hitting temporary errors. */
export const MAX_ATTEMPTS = 4;
/** Wait before try 2, 3, 4. */
const RETRY_DELAYS_MS = [60_000, 5 * 60_000, 15 * 60_000];

/**
 * Errors worth trying again later: Meta throttling or outages, and
 * network failures. Anything else (bad template, invalid number,
 * blocked user, …) won't get better by retrying.
 */
export function isTransientSendError(message: string): boolean {
  return /130429|131016|131000|rate limit|too many|throughput|temporar|try again|service unavailable|unexpected error|something went wrong|Meta API error: 5\d\d|fetch failed|timed? ?out|ECONNRESET|ETIMEDOUT|ENOTFOUND|socket hang up|network/i.test(
    message,
  );
}

/** When to try again after `attempts` failed tries, or null to give up. */
export function nextRetryAt(attempts: number, now = Date.now()): string | null {
  if (attempts >= MAX_ATTEMPTS) return null;
  const delay = RETRY_DELAYS_MS[Math.min(attempts - 1, RETRY_DELAYS_MS.length - 1)];
  return new Date(now + delay).toISOString();
}

interface ServerBroadcast {
  id: string;
  account_id: string;
  user_id: string | null;
  template_name: string;
  template_language: string | null;
  message_params: SendTimeParams | null;
  phone_number_id: string | null;
}

const BROADCAST_COLUMNS =
  'id, account_id, user_id, template_name, template_language, message_params, phone_number_id';

/**
 * Whether migration 085 (attempts / next_attempt_at) is applied. Until it
 * is, broadcasts still send, just without retries.
 */
let retryColumns: boolean | null = null;
async function hasRetryColumns(): Promise<boolean> {
  if (retryColumns === null) {
    const { error } = await supabaseAdmin()
      .from('broadcast_recipients')
      .select('attempts, next_attempt_at')
      .limit(1);
    retryColumns = !error;
    if (error) console.warn('[broadcasts] migration 085 not applied; sending without retries');
  }
  return retryColumns;
}

/** `next_attempt_at: null`, or nothing before migration 085. */
function clearRetry(on: boolean) {
  return on ? { next_attempt_at: null } : {};
}

/**
 * The shared demo login (DEMO_LOGIN_EMAIL) is an admin and can write
 * broadcast rows straight to the database, past the proxy's demo guard.
 * Its broadcasts are never sent. Cached per process.
 */
let demoUserId: { email: string; id: string | null } | null = null;
async function isDemoCreator(userId: string | null): Promise<boolean> {
  const email = process.env.DEMO_LOGIN_EMAIL?.trim().toLowerCase();
  if (!email || !userId) return false;
  if (demoUserId?.email !== email) {
    const { data } = await supabaseAdmin()
      .from('profiles')
      .select('user_id')
      .ilike('email', email)
      .maybeSingle();
    demoUserId = { email, id: (data?.user_id as string | undefined) ?? null };
  }
  return demoUserId.id === userId;
}

async function failRemaining(broadcastId: string, message: string) {
  const db = supabaseAdmin();
  await db
    .from('broadcast_recipients')
    .update({ status: 'failed', error_message: message, ...clearRetry(await hasRetryColumns()) })
    .eq('broadcast_id', broadcastId)
    .eq('status', 'pending');
  await db
    .from('broadcasts')
    .update({ status: 'failed', send_lease_until: null })
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
    .update({
      status: (notFailed ?? 0) > 0 ? 'sent' : 'failed',
      updated_at: new Date().toISOString(),
    })
    .eq('id', broadcastId);
}

interface RecipientRow {
  id: string;
  params: unknown;
  attempts?: number | null;
  contact: { phone: string | null } | { phone: string | null }[] | null;
}

/**
 * Send one broadcast's due pending recipients until `deadline`.
 * Returns how many messages were sent. Assumes the caller holds the lease.
 */
async function sendPending(broadcast: ServerBroadcast, deadline: number): Promise<number> {
  const db = supabaseAdmin();

  if (await isDemoCreator(broadcast.user_id)) {
    await failRemaining(broadcast.id, DEMO_BLOCKED_MESSAGE);
    return 0;
  }

  if (!(await accountCanSend(broadcast.account_id))) {
    await failRemaining(broadcast.id, PLAN_EXPIRED_MESSAGE);
    return 0;
  }

  const { data: config } = await db
    .from('whatsapp_config')
    .select('phone_number_id, access_token')
    .eq('account_id', broadcast.account_id)
    .maybeSingle();
  if (!config) {
    await failRemaining(broadcast.id, 'WhatsApp is not connected');
    return 0;
  }
  // Created on a number the account has since swapped out (migration 083):
  // don't send it from the new one.
  if (broadcast.phone_number_id && config.phone_number_id !== broadcast.phone_number_id) {
    await failRemaining(broadcast.id, 'Not sent: it was created on a WhatsApp number that is no longer connected.');
    return 0;
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
  const template: MessageTemplate | undefined =
    rawTemplate && isMessageTemplate(rawTemplate) ? rawTemplate : undefined;
  const optedOut = await loadOptedOutPhones(db, broadcast.account_id);

  const retries = await hasRetryColumns();
  let sent = 0;

  const sendOne = async (row: RecipientRow) => {
    const contact = Array.isArray(row.contact) ? row.contact[0] : row.contact;
    const phone = sanitizePhoneForMeta(contact?.phone ?? '');

    const fail = (message: string) =>
      db
        .from('broadcast_recipients')
        .update({ status: 'failed', error_message: message, ...clearRetry(retries) })
        .eq('id', row.id);

    if (!isValidE164(phone)) return void (await fail('No valid phone number'));
    if (optedOut.has(phoneKey(phone))) return void (await fail('Opted out (replied STOP)'));

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
          ...clearRetry(retries),
        })
        .eq('id', row.id);
      return;
    }

    const attempts = (row.attempts ?? 0) + 1;
    const retryAt = retries && isTransientSendError(lastError) ? nextRetryAt(attempts) : null;
    if (retryAt) {
      // Stays pending; picked up again once next_attempt_at has passed.
      await db
        .from('broadcast_recipients')
        .update({ attempts, next_attempt_at: retryAt, error_message: `Retrying: ${lastError}` })
        .eq('id', row.id);
    } else {
      await db
        .from('broadcast_recipients')
        .update({
          status: 'failed',
          error_message: lastError,
          ...(retries ? { attempts, next_attempt_at: null } : {}),
        })
        .eq('id', row.id);
    }
  };

  while (Date.now() < deadline) {
    const nowIso = new Date().toISOString();
    let query = db
      .from('broadcast_recipients')
      .select(retries ? 'id, params, attempts, contact:contacts(phone)' : 'id, params, contact:contacts(phone)')
      .eq('broadcast_id', broadcast.id)
      .eq('status', 'pending');
    if (retries) query = query.or(`next_attempt_at.is.null,next_attempt_at.lte.${nowIso}`);
    const { data: batch } = await query.order('created_at', { ascending: true }).limit(BATCH);
    if (!batch || batch.length === 0) break;

    for (let i = 0; i < batch.length; i += CONCURRENCY) {
      if (Date.now() >= deadline) break;
      await Promise.all(
        (batch.slice(i, i + CONCURRENCY) as unknown as RecipientRow[]).map((row) =>
          sendOne(row).catch((err) => {
            console.error('[broadcasts] recipient send crashed:', row.id, err);
          }),
        ),
      );
    }
  }

  return sent;
}

/** Take the broadcast's lease; false when another runner holds it. */
async function takeLease(broadcastId: string): Promise<boolean> {
  const db = supabaseAdmin();
  const leaseNow = new Date().toISOString();
  const { data } = await db
    .from('broadcasts')
    .update({ send_lease_until: new Date(Date.now() + LEASE_MS).toISOString() })
    .eq('id', broadcastId)
    .eq('status', 'sending')
    .or(`send_lease_until.is.null,send_lease_until.lt.${leaseNow}`)
    .select('id')
    .maybeSingle();
  return !!data;
}

async function runLeased(broadcast: ServerBroadcast, deadline: number): Promise<number> {
  if (!(await takeLease(broadcast.id))) return 0;
  let sent = 0;
  try {
    sent = await sendPending(broadcast, deadline);
    await finishIfDone(broadcast.id);
  } finally {
    await supabaseAdmin()
      .from('broadcasts')
      .update({ send_lease_until: null })
      .eq('id', broadcast.id);
  }
  return sent;
}

/**
 * Start sending a "Send now" broadcast right away. Safe to call twice or
 * alongside the cron (the lease decides who sends); whatever doesn't fit
 * in this run is continued by the cron. Never throws.
 */
export async function sendBroadcastNow(broadcastId: string): Promise<number> {
  try {
    const { data } = await supabaseAdmin()
      .from('broadcasts')
      .select(BROADCAST_COLUMNS)
      .eq('id', broadcastId)
      .eq('status', 'sending')
      .maybeSingle();
    if (!data) return 0;
    return await runLeased(data as ServerBroadcast, Date.now() + TIME_BUDGET_MS);
  } catch (err) {
    console.error('[broadcasts] send now failed:', broadcastId, err);
    return 0;
  }
}

/** Cron: claim due broadcasts and continue all in flight. Returns messages sent. */
export async function processScheduledBroadcasts(): Promise<number> {
  const db = supabaseAdmin();
  const deadline = Date.now() + TIME_BUDGET_MS;
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

  // Everything in flight that the server owns. Server-sent broadcasts
  // carry scheduled_at; browser-driven sends from before migration 085
  // don't and are left alone.
  const { data: inFlight } = await db
    .from('broadcasts')
    .select(BROADCAST_COLUMNS)
    .eq('status', 'sending')
    .not('scheduled_at', 'is', null)
    .lte('scheduled_at', nowIso)
    .order('scheduled_at', { ascending: true })
    .limit(10);

  let sent = 0;
  for (const broadcast of (inFlight ?? []) as ServerBroadcast[]) {
    if (Date.now() >= deadline) break;
    sent += await runLeased(broadcast, deadline);
  }
  return sent;
}
