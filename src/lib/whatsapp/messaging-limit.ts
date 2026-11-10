// ============================================================
// Meta messaging limit — the cap on how many *different* customers a
// number may start a conversation with in a rolling 24 hours
// (TIER_250 / TIER_1K / TIER_2K / TIER_10K / TIER_100K / UNLIMITED).
//
// Why this exists: the broadcast sender used to pour an entire
// recipient list at Meta as fast as its lease allowed. On a TIER_2K
// number a 33k-contact broadcast sent ~2,000 messages, then every
// remaining recipient came back rejected. Those rejections look
// transient, so they burned MAX_ATTEMPTS (4 tries over ~21 minutes)
// and were marked 'failed' — a 24-hour cap cannot clear in 21 minutes.
// The result was a broadcast reporting ~31k permanent failures that
// would have gone out fine spread over several days.
//
// So the sender now paces itself: it reads the number's tier, counts
// what already went out inside the window, and only sends what fits.
// The rest stays 'pending' with `next_attempt_at` set to when the
// window frees up, and the every-minute cron resumes it by itself.
// ============================================================

import type { SupabaseClient } from '@supabase/supabase-js';

/** Meta's messaging limit is a rolling 24-hour window. */
export const WINDOW_MS = 24 * 60 * 60 * 1000;

/**
 * Leave a little of the tier unused. Our count is derived from our own
 * `sent_at` rows, which can drift from Meta's counter (messages sent
 * outside broadcasts, a send Meta counted but we recorded late). Going
 * right up to the cap turns that drift into hard rejections, so stop
 * just short of it.
 */
export const SAFETY_MARGIN = 0.98;

/**
 * Tier string → customers per 24 h. `Infinity` for an unlimited number.
 * `null` when Meta hasn't told us the tier yet (a number connected
 * minutes ago, or a health row that predates the column) — callers must
 * treat null as "don't pace", not as zero, or an unknown tier would
 * stop every broadcast.
 */
export function tierCapacity(messagingLimit: string | null | undefined): number | null {
  // Trim before stripping the prefix: a padded " TIER_1M " would
  // otherwise keep its prefix and fall through as unknown.
  const v = (messagingLimit ?? '').trim().toUpperCase().replace(/^TIER_/, '');
  if (!v) return null;
  if (v === 'UNLIMITED') return Infinity;
  const m = v.match(/^(\d+)(K|M)?$/);
  if (!m) return null;
  const multiplier = m[2] === 'M' ? 1_000_000 : m[2] === 'K' ? 1_000 : 1;
  const n = Number(m[1]) * multiplier;
  return n > 0 ? n : null;
}

/**
 * Meta errors that mean "this number has sent as much as it is allowed
 * to for now" rather than "this message is bad". They do not clear on
 * the sender's normal minutes-long backoff, so a recipient that hits
 * one is parked until the window moves instead of spending a try.
 *
 *   131048  restrictions on how many messages this number may send
 *   131049  not delivered to maintain healthy ecosystem engagement
 *   133016  number's messaging limit reached
 */
export function isMessagingCapError(message: string): boolean {
  return /131048|131049|133016|messaging limit|spam rate limit|restrictions on how many/i.test(
    message,
  );
}

export interface DailyQuota {
  /** Customers per 24 h for this number, or Infinity / null (unknown). */
  cap: number | null;
  /** How many we have already sent inside the window. */
  used: number;
  /** How many more we may send right now; Infinity when uncapped. */
  remaining: number;
  /**
   * When the window first frees up — the oldest send inside it, plus
   * 24 h. Null when nothing is queued against the cap.
   */
  resetsAt: Date | null;
}

const UNCAPPED: DailyQuota = { cap: null, used: 0, remaining: Infinity, resetsAt: null };

/**
 * Read how much of `accountId`'s messaging limit is still free.
 *
 * `used` counts this account's broadcast recipients marked sent inside
 * the window. That deliberately ignores one-off sends from the inbox,
 * flows and automations: they also consume Meta's counter, which is why
 * SAFETY_MARGIN exists rather than a claim of exactness. It is a floor
 * on usage, so pacing can still slightly overshoot — the cap-error
 * deferral in the sender is the backstop for that.
 */
export async function readDailyQuota(
  db: SupabaseClient,
  accountId: string,
  phoneNumberId: string | null,
  now = Date.now(),
): Promise<DailyQuota> {
  let health = db
    .from('whatsapp_number_health')
    .select('messaging_limit')
    .eq('account_id', accountId);
  if (phoneNumberId) health = health.eq('phone_number_id', phoneNumberId);

  const { data: rows, error } = await health.limit(1);
  if (error) {
    // No health table yet (migration not applied): behave as before.
    console.warn('[messaging-limit] health read failed; not pacing:', error.message);
    return UNCAPPED;
  }

  const cap = tierCapacity(rows?.[0]?.messaging_limit as string | null | undefined);
  if (cap === null || !Number.isFinite(cap)) return { ...UNCAPPED, cap };

  const sinceIso = new Date(now - WINDOW_MS).toISOString();

  // `broadcasts!inner` turns the embed into a join so the filter on the
  // parent's account_id actually restricts the count.
  const { count, error: countErr } = await db
    .from('broadcast_recipients')
    .select('id, broadcasts!inner(account_id)', { count: 'exact', head: true })
    .eq('broadcasts.account_id', accountId)
    .gte('sent_at', sinceIso);
  if (countErr) {
    console.warn('[messaging-limit] usage count failed; not pacing:', countErr.message);
    return UNCAPPED;
  }

  const used = count ?? 0;
  const budget = Math.floor(cap * SAFETY_MARGIN);
  const remaining = Math.max(0, budget - used);

  let resetsAt: Date | null = null;
  if (remaining === 0) {
    const { data: oldest } = await db
      .from('broadcast_recipients')
      .select('sent_at, broadcasts!inner(account_id)')
      .eq('broadcasts.account_id', accountId)
      .gte('sent_at', sinceIso)
      .order('sent_at', { ascending: true })
      .limit(1);
    const oldestSentAt = oldest?.[0]?.sent_at as string | undefined;
    // +1 min so the retry lands just after the window has actually moved.
    resetsAt = new Date(
      (oldestSentAt ? new Date(oldestSentAt).getTime() : now) + WINDOW_MS + 60_000,
    );
  }

  return { cap, used, remaining, resetsAt };
}

/** Human line for logs and the broadcast's status text. */
export function describeQuota(q: DailyQuota): string {
  if (q.cap === null) return 'messaging limit unknown — not pacing';
  if (!Number.isFinite(q.cap)) return 'unlimited messaging limit';
  return `${q.used}/${Math.floor(q.cap * SAFETY_MARGIN)} of the ${q.cap.toLocaleString('en-IN')}/day limit used`;
}
