/**
 * In-memory per-key rate limiter.
 *
 * Fixed-window counter (not token bucket): every identifier gets a
 * fresh N-request budget each window. Simple, allocation-light, and
 * fine for a single-instance VPS — which is how forkers of this
 * template will usually deploy.
 *
 * Trade-off: a single Node process holds the Map, so horizontal scale
 * (multiple regions, multiple Hostinger nodes, Vercel serverless fan-
 * out) silently defeats the limit. If you scale beyond one instance,
 * swap the `check` implementation for Redis / Upstash / Cloudflare
 * Durable Objects keeping the same return shape. The call sites won't
 * change.
 *
 * Memory: entries are ~50 bytes each. With LIGHT_SWEEP below, expired
 * keys get cleared opportunistically on every ~1 000th call, so a
 * healthy instance stays in the low-MB range even with thousands of
 * distinct users. No background timer — works in serverless edge
 * runtimes that don't keep timers alive across requests.
 */

import { NextResponse } from 'next/server';

export interface RateLimitOptions {
  /** Max requests allowed in `windowMs`. */
  limit: number;
  /** Window size, milliseconds. */
  windowMs: number;
}

export interface RateLimitResult {
  success: boolean;
  /** Requests still allowed in the current window. */
  remaining: number;
  /** Unix ms when the bucket refills. */
  reset: number;
  limit: number;
}

interface Entry {
  count: number;
  resetAt: number;
}

const buckets = new Map<string, Entry>();

// Opportunistic cleanup. Running a sweep on every call would be
// quadratic; running it 1-in-N lets the Map self-drain without a
// background timer.
const LIGHT_SWEEP_EVERY = 1000;
let callsSinceSweep = 0;

function sweepExpired(now: number) {
  for (const [k, v] of buckets) {
    if (v.resetAt <= now) buckets.delete(k);
  }
}

export function checkRateLimit(
  key: string,
  { limit, windowMs }: RateLimitOptions,
): RateLimitResult {
  const now = Date.now();

  callsSinceSweep += 1;
  if (callsSinceSweep >= LIGHT_SWEEP_EVERY) {
    callsSinceSweep = 0;
    sweepExpired(now);
  }

  const entry = buckets.get(key);

  if (!entry || entry.resetAt <= now) {
    buckets.set(key, { count: 1, resetAt: now + windowMs });
    return { success: true, remaining: limit - 1, reset: now + windowMs, limit };
  }

  if (entry.count >= limit) {
    return { success: false, remaining: 0, reset: entry.resetAt, limit };
  }

  entry.count += 1;
  return {
    success: true,
    remaining: limit - entry.count,
    reset: entry.resetAt,
    limit,
  };
}

/**
 * Standard 429 response with the headers clients expect (RFC 6585 +
 * draft-ietf-httpapi-ratelimit-headers). Callers just `return` this.
 */
export function rateLimitResponse(result: RateLimitResult): NextResponse {
  const retryAfterSec = Math.max(1, Math.ceil((result.reset - Date.now()) / 1000));
  return NextResponse.json(
    {
      error: 'Rate limit exceeded',
      retry_after_seconds: retryAfterSec,
    },
    {
      status: 429,
      headers: {
        'Retry-After': String(retryAfterSec),
        'X-RateLimit-Limit': String(result.limit),
        'X-RateLimit-Remaining': String(result.remaining),
        'X-RateLimit-Reset': String(Math.ceil(result.reset / 1000)),
      },
    },
  );
}

/**
 * Best-effort client IP for rate limiting. Prefers headers the edge sets
 * itself (Cloudflare / x-real-ip), then the RIGHTMOST `x-forwarded-for`
 * entry: our reverse proxy appends the address it actually saw, so the
 * leftmost entries are whatever the client chose to send and must never
 * be trusted. Falls back to "unknown" (local dev: effectively global).
 */
export function getClientIp(request: Request): string {
  const cf = request.headers.get('cf-connecting-ip');
  if (cf) return cf.trim();
  const xri = request.headers.get('x-real-ip');
  if (xri) return xri.trim();
  const xff = request.headers.get('x-forwarded-for');
  if (xff) {
    const parts = xff.split(',').map((p) => p.trim()).filter(Boolean);
    if (parts.length) return parts[parts.length - 1];
  }
  return 'unknown';
}

/** True if this key has already used its whole budget (does not count a request). */
export function isRateLimited(key: string): boolean {
  const entry = buckets.get(key);
  return !!entry && entry.resetAt > Date.now() && entry.count >= RATE_LIMITS.webhookRejections.limit;
}

/**
 * Webhook abuse guard. Real deliveries from Meta / Shopify / Calendly
 * are never limited — only an IP that keeps sending requests with bad
 * signatures or unknown URLs. Call `webhookBlocked` first (cheap, no
 * DB) and `recordWebhookRejection` whenever a request is rejected.
 */
/**
 * Key for the webhook block. Uses the whole forwarding chain, not just
 * the leftmost entry: a client can put any value first in
 * x-forwarded-for, but our proxy appends the address it really saw, so
 * a request forging "X-Forwarded-For: <Meta's IP>" ends up with a
 * different key from Meta's genuine deliveries and can't get them
 * blocked.
 */
function webhookRejectKey(request: Request, source: string): string {
  const chain = (request.headers.get('x-forwarded-for') ?? '').replace(/\s+/g, '');
  const realIp = (request.headers.get('x-real-ip') ?? '').trim();
  return `webhook-reject:${source}:${chain}|${realIp}`;
}

export function webhookBlocked(request: Request, source: string): NextResponse | null {
  const key = webhookRejectKey(request, source);
  if (!isRateLimited(key)) return null;
  const entry = buckets.get(key)!;
  return rateLimitResponse({ success: false, remaining: 0, reset: entry.resetAt, limit: RATE_LIMITS.webhookRejections.limit });
}

export function recordWebhookRejection(request: Request, source: string): void {
  checkRateLimit(webhookRejectKey(request, source), RATE_LIMITS.webhookRejections);
}

/** Preconfigured budgets, tweak here not at call sites. */
export const RATE_LIMITS = {
  /** Individual message send. 60/min per user = one per second
   *  sustained, comfortable for a live human typing. */
  send: { limit: 60, windowMs: 60_000 },
  /** Broadcast dispatch. 5/min per user — even a 1 000-recipient
   *  broadcast is one call; this caps the rate at which a single user
   *  can launch campaigns, not the messages inside one. */
  broadcast: { limit: 5, windowMs: 60_000 },
  /** Reaction add/swap/remove. More permissive than send — users
   *  fidget with reactions and a single "swap" is actually two calls
   *  (remove + add) under the hood. */
  react: { limit: 120, windowMs: 60_000 },
  /** Invitation peek (public, per-IP). 30/min lets a forwarded link
   *  retry a handful of times under flaky connectivity without
   *  enabling brute-force token enumeration. With 256-bit tokens the
   *  enumeration risk is theoretical; this is belt-and-braces. */
  invitationPeek: { limit: 30, windowMs: 60_000 },
  /** Demo request form (public, per-IP). 5 an hour is plenty for a real
   *  visitor (including a retry after a typo) and stops a script from
   *  filling the table or the inbox. */
  demoRequest: { limit: 5, windowMs: 60 * 60_000 },
  /** Invitation redeem (authed, per-IP+user). Tighter than peek —
   *  successful redemption mutates two profiles and an invite row, so
   *  the abuse surface is "spam join attempts." */
  invitationRedeem: { limit: 10, windowMs: 60_000 },
  /** Admin-only account / member-management actions: create/revoke
   *  invitation, rename account, change member role, remove member,
   *  transfer ownership. 30/min per user is comfortably above any
   *  realistic legitimate use (the Members tab is a clicks-only UI)
   *  while still bounding accidental abuse from a script run in a
   *  loop or a compromised admin session spamming role flips. */
  adminAction: { limit: 30, windowMs: 60_000 },
  /** Public REST API (`/api/v1/*`), keyed per API key. 120/min ≈ 2
   *  req/s sustained — comfortable for a polling integration or an
   *  automation firing on inbound events, while bounding a runaway
   *  script. Like every bucket here it's per-process; a multi-
   *  instance deploy needs the Redis swap described at the top of
   *  this file (the per-key call sites don't change). */
  publicApi: { limit: 120, windowMs: 60_000 },
  /** Connect token exchange (`POST /api/v1/connect/token`), keyed per
   *  IP and per client. A partner exchanges one code per owner who
   *  clicks "Connect", so 30/min is far above real use while making
   *  client-secret or code guessing pointless. */
  connectToken: { limit: 30, windowMs: 60_000 },
  /** "Create template with AI" drafts, per user. Each call is a paid
   *  Gemini request (two with a repair), so cap it well above a person
   *  iterating on wording but below a stuck retry loop. */
  aiTemplateDraft: { limit: 10, windowMs: 60_000 },
  /** "Download my data", per user. A full business export reads every
   *  table, so a handful per hour is plenty. */
  dataExport: { limit: 5, windowMs: 60 * 60_000 },
  /** "Delete my account" attempts, per user. Bounds confirmation-text
   *  guessing from a hijacked session. */
  accountDelete: { limit: 5, windowMs: 60 * 60_000 },
  /** Outgoing WhatsApp calls, per agent. A person can't usefully dial
   *  more than a few a minute; this stops a stuck retry loop. */
  callStart: { limit: 10, windowMs: 60_000 },
  /** "Check now" on WhatsApp number health, per account. Each check
   *  makes three Graph API calls. */
  numberHealthCheck: { limit: 6, windowMs: 60 * 60_000 },
  /** Public GET /api/health, per IP. Monitors poll every minute or
   *  five; this only stops someone hammering the database through it. */
  healthCheck: { limit: 60, windowMs: 60_000 },
  /** Rejected webhook requests (bad signature / unknown URL) per IP
   *  per source before that IP is blocked for the rest of the window. */
  webhookRejections: { limit: 20, windowMs: 10 * 60_000 },
  /** AI generation (flows, chatbot tests), per user — each is a paid
   *  Gemini request. */
  aiGenerate: { limit: 10, windowMs: 60_000 },
  /** Inbox "Translate" (a message or the draft reply), per user. An
   *  agent working a busy multilingual inbox clicks this often, but each
   *  is a Gemini request, so cap a runaway loop. */
  aiTranslate: { limit: 60, windowMs: 60_000 },
  /** Inbox "Summarise this chat", per user. */
  aiSummary: { limit: 20, windowMs: 60_000 },
  /** Inbox "Suggest reply" (3 drafts), per user. Each is a Gemini request. */
  aiSuggest: { limit: 20, windowMs: 60_000 },
  /** Inbox "Score this chat" refresh, per user. */
  aiAnalyze: { limit: 20, windowMs: 60_000 },
  /** Inbox voice-note transcription, per user. Each is a Gemini audio request. */
  aiTranscribe: { limit: 30, windowMs: 60_000 },
} as const;

/** Test-only helper. Clears the in-memory state so unit tests don't
 *  leak buckets across files. Not wired up in production code. */
export function __resetRateLimitForTests() {
  buckets.clear();
  callsSinceSweep = 0;
}
