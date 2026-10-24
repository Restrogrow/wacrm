// ============================================================
// Outbound webhook delivery.
//
// `dispatchWebhookEvent` finds the account's active endpoints
// subscribed to an event, builds one JSON payload, and POSTs it to
// each in parallel. It never throws — callers fire it from the inbound
// webhook's `after()` block, where a failed delivery must not affect
// the 200 OK returned to Meta.
//
// Delivery semantics (documented in docs/public-api.md):
//   - The first try happens right away. A failed try (timeout, network
//     error, non-2xx, a 3xx we refuse to follow) is retried with
//     backoff by the every-minute cron (`processWebhookRetries`):
//     after 1 min, 5 min, 30 min, 2 h and 6 h — 6 tries in all.
//   - Every delivery is logged in `webhook_deliveries` (migration 085)
//     with its status, tries, last HTTP status and error; rows older
//     than 14 days are pruned. Without the migration, deliveries fall
//     back to a single try and no log.
//   - A retry sends the same body (same envelope `id`, so receivers can
//     dedupe) with a fresh signature timestamp.
//   - Each delivery that gives up for good bumps the endpoint's
//     `failure_count`; once it crosses MAX_CONSECUTIVE_FAILURES the
//     endpoint is auto-disabled (`is_active = false`). A success resets
//     the counter and stamps `last_delivery_at`.
// ============================================================

import { randomUUID } from 'node:crypto';

import type { SupabaseClient } from '@supabase/supabase-js';

import { decrypt } from '@/lib/whatsapp/encryption';
import { buildSignatureHeader } from '@/lib/webhooks/sign';
import { isDeliverableUrl } from '@/lib/webhooks/ssrf';
import type { WebhookEvent } from '@/lib/webhooks/events';

/** Per-endpoint HTTP timeout. Kept short — this runs in `after()`. */
export const DELIVERY_TIMEOUT_MS = 5000;

/** Auto-disable an endpoint after this many deliveries failed for good in a row. */
export const MAX_CONSECUTIVE_FAILURES = 15;

/** Wait before try 2, 3, 4, 5, 6. */
export const RETRY_DELAYS_MS = [
  60_000,
  5 * 60_000,
  30 * 60_000,
  2 * 60 * 60_000,
  6 * 60 * 60_000,
];
export const MAX_ATTEMPTS = RETRY_DELAYS_MS.length + 1;

/** Delivery log retention. */
const LOG_RETENTION_MS = 14 * 24 * 60 * 60_000;

interface EndpointRow {
  id: string;
  url: string;
  secret: string;
  is_active?: boolean;
}

/** Outcome of one HTTP try. `retry: false` means trying again can't help. */
interface TryResult {
  ok: boolean;
  statusCode: number | null;
  error: string | null;
  retry: boolean;
}

/** When to try again after `attempts` failed tries, or null to give up. */
export function nextAttemptAt(attempts: number, now = Date.now()): string | null {
  if (attempts >= MAX_ATTEMPTS) return null;
  return new Date(now + RETRY_DELAYS_MS[attempts - 1]).toISOString();
}

/**
 * Deliver `event` (+ `data`) to every active endpoint of `accountId`
 * subscribed to it. Never throws.
 */
export async function dispatchWebhookEvent(
  db: SupabaseClient,
  accountId: string,
  event: WebhookEvent,
  data: unknown
): Promise<void> {
  try {
    const { data: rows, error } = await db
      .from('webhook_endpoints')
      .select('id, url, secret')
      .eq('account_id', accountId)
      .eq('is_active', true)
      .contains('events', [event]);

    if (error || !rows || rows.length === 0) return;

    // Sign the exact bytes we send so a receiver can recompute the
    // HMAC over the raw request body. `id` is a per-event uuid the
    // receiver can dedupe on (deliveries are at-least-once and may
    // repeat / arrive out of order).
    const payload = JSON.stringify({
      id: randomUUID(),
      event,
      occurred_at: new Date().toISOString(),
      account_id: accountId,
      data,
    });

    await Promise.allSettled(
      (rows as EndpointRow[]).map((row) =>
        deliverFirst(db, accountId, row, event, payload)
      )
    );
  } catch (err) {
    // Never let a delivery problem bubble into the webhook response.
    console.error('[webhooks] dispatch failed:', err);
  }
}

/** One HTTP try. Never throws. */
async function tryDeliver(row: EndpointRow, event: string, payload: string): Promise<TryResult> {
  // SSRF guard: refuse to POST to a host that resolves to a private /
  // loopback / link-local address.
  if (!(await isDeliverableUrl(row.url))) {
    console.warn('[webhooks] refusing non-public delivery target for', row.id);
    return { ok: false, statusCode: null, error: 'URL does not resolve to a public address', retry: false };
  }

  let secret: string;
  try {
    secret = decrypt(row.secret);
  } catch (err) {
    // A row whose secret can't be decrypted can never produce a valid
    // signature.
    console.error('[webhooks] secret decrypt failed for', row.id, err);
    return { ok: false, statusCode: null, error: 'Signing secret could not be read', retry: false };
  }

  try {
    const res = await fetch(row.url, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'X-Wacrm-Event': event,
        'X-Wacrm-Webhook-Id': row.id,
        'X-Wacrm-Signature': buildSignatureHeader(payload, secret, Math.floor(Date.now() / 1000)),
      },
      body: payload,
      // Do NOT follow redirects — a public URL could 3xx-bounce to an
      // internal address, bypassing the SSRF check above. A 3xx is a
      // misconfiguration; treat it as a failure.
      redirect: 'manual',
      signal: AbortSignal.timeout(DELIVERY_TIMEOUT_MS),
    });
    if (res.ok) return { ok: true, statusCode: res.status, error: null, retry: false };
    return { ok: false, statusCode: res.status, error: `endpoint responded ${res.status}`, retry: true };
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    return { ok: false, statusCode: null, error: message.slice(0, 500), retry: true };
  }
}

async function recordSuccess(db: SupabaseClient, endpointId: string): Promise<void> {
  await db
    .from('webhook_endpoints')
    .update({ failure_count: 0, last_delivery_at: new Date().toISOString() })
    .eq('id', endpointId);
}

async function recordFailure(db: SupabaseClient, endpointId: string): Promise<void> {
  // Atomic increment (+ auto-disable at the threshold) via a SQL
  // function — a read-modify-write here would lose increments when two
  // deliveries to the same endpoint give up concurrently, so a dead
  // endpoint might never reach the disable threshold.
  const { error } = await db.rpc('record_webhook_failure', {
    endpoint_id: endpointId,
    max_failures: MAX_CONSECUTIVE_FAILURES,
  });
  if (error) {
    console.error('[webhooks] record_webhook_failure failed for', endpointId, error);
  }
}

/** Fields for a log row after a try that made `attempts` tries in all. */
function logFields(result: TryResult, attempts: number) {
  const retryAt = !result.ok && result.retry ? nextAttemptAt(attempts) : null;
  return {
    status: result.ok ? 'delivered' : retryAt ? 'pending' : 'failed',
    attempts,
    next_attempt_at: retryAt,
    last_status_code: result.statusCode,
    last_error: result.error,
    delivered_at: result.ok ? new Date().toISOString() : null,
  } as const;
}

async function deliverFirst(
  db: SupabaseClient,
  accountId: string,
  row: EndpointRow,
  event: WebhookEvent,
  payload: string
): Promise<void> {
  const result = await tryDeliver(row, event, payload);
  const fields = logFields(result, 1);

  const { error: logError } = await db.from('webhook_deliveries').insert({
    account_id: accountId,
    endpoint_id: row.id,
    event,
    payload,
    ...fields,
  });

  if (result.ok) {
    await recordSuccess(db, row.id);
  } else if (fields.status === 'failed' || logError) {
    // Given up (or no log to retry from, e.g. migration 085 missing).
    console.warn(`[webhooks] delivery to ${row.id} failed:`, result.error);
    await recordFailure(db, row.id);
  }
}

interface DeliveryRow {
  id: string;
  endpoint_id: string;
  event: string;
  payload: string;
  attempts: number;
  next_attempt_at: string;
  endpoint: EndpointRow | EndpointRow[] | null;
}

/**
 * Cron: retry due webhook deliveries and prune the old log. Returns how
 * many tries were made. Never throws.
 */
export async function processWebhookRetries(db: SupabaseClient, limit = 50): Promise<number> {
  try {
    const now = Date.now();
    await db
      .from('webhook_deliveries')
      .delete()
      .lt('created_at', new Date(now - LOG_RETENTION_MS).toISOString());

    const { data, error } = await db
      .from('webhook_deliveries')
      .select('id, endpoint_id, event, payload, attempts, next_attempt_at, endpoint:webhook_endpoints(id, url, secret, is_active)')
      .eq('status', 'pending')
      .lte('next_attempt_at', new Date(now).toISOString())
      .order('next_attempt_at', { ascending: true })
      .limit(limit);
    if (error || !data) return 0; // migration 085 missing, or nothing due

    let tried = 0;
    await Promise.allSettled(
      (data as unknown as DeliveryRow[]).map(async (delivery) => {
        // Claim it: push next_attempt_at out so an overlapping cron run
        // doesn't send the same retry twice.
        const { data: claimed } = await db
          .from('webhook_deliveries')
          .update({ next_attempt_at: new Date(Date.now() + 5 * 60_000).toISOString() })
          .eq('id', delivery.id)
          .eq('status', 'pending')
          .eq('next_attempt_at', delivery.next_attempt_at)
          .select('id')
          .maybeSingle();
        if (!claimed) return;

        const endpoint = Array.isArray(delivery.endpoint) ? delivery.endpoint[0] : delivery.endpoint;
        if (!endpoint || endpoint.is_active === false) {
          await db
            .from('webhook_deliveries')
            .update({ status: 'failed', next_attempt_at: null, last_error: 'Endpoint was disabled' })
            .eq('id', delivery.id);
          return;
        }

        tried++;
        const result = await tryDeliver(endpoint, delivery.event, delivery.payload);
        const fields = logFields(result, delivery.attempts + 1);
        await db.from('webhook_deliveries').update(fields).eq('id', delivery.id);
        if (result.ok) await recordSuccess(db, endpoint.id);
        else if (fields.status === 'failed') await recordFailure(db, endpoint.id);
      })
    );
    return tried;
  } catch (err) {
    console.error('[webhooks] retry run failed:', err);
    return 0;
  }
}
