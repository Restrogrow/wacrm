// ============================================================
// Team alerts — delivery. Server-only.
//
//   fireTeamAlert(accountId, event, data)   called from the webhook, cron
//                                           and integration code. NEVER
//                                           throws and never blocks for
//                                           long: a Slack outage must not
//                                           break inbound processing.
//   deliverToChannel(channel, text)         one send, used by the test button.
//
// Secrets (webhook URL / bot token) are stored encrypted, decrypted only
// here, re-validated against the host allowlist, and sent with safeFetch
// (public addresses only, https only, no redirects, 5 s timeout).
// ============================================================

import { supabaseAdmin } from '@/lib/flows/admin-client';
import { safeFetch } from '@/lib/webhooks/ssrf';
import { decrypt } from '@/lib/whatsapp/encryption';

import {
  buildAlertRequest,
  formatAlertText,
  isAllowedAlertUrl,
  isAlertKind,
  type AlertData,
  type AlertEvent,
  type AlertKind,
} from './core';

export interface AlertChannelRow {
  id: string;
  account_id: string;
  kind: string;
  name: string;
  target_enc: string;
  chat_id: string | null;
  events: string[] | null;
  enabled: boolean;
}

const SEND_TIMEOUT_MS = 5_000;
const CHANNEL_COLUMNS = 'id, account_id, kind, name, target_enc, chat_id, events, enabled';

export type DeliverResult = { ok: true } | { ok: false; error: string };

/** Send one message to one channel. Never throws; the error text never contains the secret. */
export async function deliverToChannel(channel: AlertChannelRow, text: string): Promise<DeliverResult> {
  if (!isAlertKind(channel.kind)) return { ok: false, error: 'Unknown channel type' };
  const kind: AlertKind = channel.kind;

  let target: string;
  try {
    target = decrypt(channel.target_enc);
  } catch {
    return { ok: false, error: 'Could not read the saved credentials. Save the channel again.' };
  }

  const request = buildAlertRequest(kind, target, channel.chat_id, text);
  if (!request || !isAllowedAlertUrl(kind, request.url)) {
    return { ok: false, error: 'This destination is not allowed' };
  }

  try {
    const res = await safeFetch(request.url, request.init, {
      httpsOnly: true,
      timeoutMs: SEND_TIMEOUT_MS,
      maxRedirects: 0, // an official webhook never redirects; anything that does is wrong
    });
    if (res.ok) return { ok: true };
    if (res.status === 404 || res.status === 401 || res.status === 403) {
      return { ok: false, error: `The ${kind} destination rejected the request (HTTP ${res.status}). Check the URL or token.` };
    }
    if (res.status === 429) return { ok: false, error: `${kind} is rate limiting this channel (HTTP 429)` };
    return { ok: false, error: `${kind} returned HTTP ${res.status}` };
  } catch (err) {
    // Deliberately generic: fetch errors can echo the URL (which holds the secret).
    const name = err instanceof Error ? err.name : '';
    return { ok: false, error: name === 'TimeoutError' || name === 'AbortError' ? 'Timed out' : 'Could not reach the destination' };
  }
}

async function recordResult(channelId: string, result: DeliverResult): Promise<void> {
  try {
    await supabaseAdmin()
      .from('alert_channels')
      .update({
        last_status: result.ok ? 'ok' : 'failed',
        last_error: result.ok ? null : result.error.slice(0, 300),
        last_sent_at: new Date().toISOString(),
      })
      .eq('id', channelId);
  } catch {
    // Status bookkeeping is best-effort.
  }
}

/** Deliver and remember the outcome (used by the test button too). */
export async function deliverAndRecord(channel: AlertChannelRow, text: string): Promise<DeliverResult> {
  const result = await deliverToChannel(channel, text);
  await recordResult(channel.id, result);
  return result;
}

/**
 * Tell the team about `event` on every enabled channel that subscribed to it.
 * Safe to call from anywhere: errors are swallowed, the table being missing
 * (migration 071 not applied) is silent, and the whole thing is time-boxed.
 */
export async function fireTeamAlert(accountId: string, event: AlertEvent, data: AlertData): Promise<void> {
  try {
    const { data: rows, error } = await supabaseAdmin()
      .from('alert_channels')
      .select(CHANNEL_COLUMNS)
      .eq('account_id', accountId)
      .eq('enabled', true)
      .contains('events', [event]);
    if (error || !rows || rows.length === 0) return;

    const text = formatAlertText(event, data);
    await Promise.allSettled((rows as AlertChannelRow[]).map((c) => deliverAndRecord(c, text)));
  } catch (err) {
    console.warn('[alerts] could not send:', err instanceof Error ? err.message : 'error');
  }
}
