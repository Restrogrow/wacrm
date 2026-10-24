-- ============================================================
-- 085: Broadcast retries + outbound webhook delivery log
--
-- 1. Broadcasts are always sent by the server now (lib/broadcasts/
--    scheduled.ts), including "Send now" and the public API. A
--    recipient that hits a temporary Meta error (rate limit, outage,
--    network) stays 'pending' and is tried again later:
--
--      broadcast_recipients.attempts         failed tries so far
--      broadcast_recipients.next_attempt_at  not before this time
--
-- 2. Outbound webhooks (webhook_endpoints, migration 028) are retried
--    with backoff instead of being sent once. Every delivery is logged
--    in webhook_deliveries (kept 14 days) so an account can see what
--    was sent, what failed and why (GET /api/v1/webhooks/{id}/deliveries).
--    `payload` holds the exact JSON body, so a retry carries the same
--    envelope `id` and receivers can dedupe.
--
-- Idempotent — safe to run multiple times.
-- ============================================================

ALTER TABLE broadcast_recipients
  ADD COLUMN IF NOT EXISTS attempts integer NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS next_attempt_at timestamptz;

-- The sender reads a broadcast's due pending recipients.
CREATE INDEX IF NOT EXISTS broadcast_recipients_pending_idx
  ON broadcast_recipients (broadcast_id, created_at)
  WHERE status = 'pending';

CREATE TABLE IF NOT EXISTS webhook_deliveries (
  id               uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  account_id       uuid NOT NULL REFERENCES accounts(id) ON DELETE CASCADE,
  endpoint_id      uuid NOT NULL REFERENCES webhook_endpoints(id) ON DELETE CASCADE,
  event            text NOT NULL,
  payload          text NOT NULL,              -- exact JSON body (signed again per try)
  status           text NOT NULL DEFAULT 'pending'
                     CHECK (status IN ('pending', 'delivered', 'failed')),
  attempts         integer NOT NULL DEFAULT 0,
  next_attempt_at  timestamptz,                -- set while status = 'pending'
  last_status_code integer,                    -- HTTP status of the last try, if any
  last_error       text,
  created_at       timestamptz NOT NULL DEFAULT now(),
  delivered_at     timestamptz
);

CREATE INDEX IF NOT EXISTS webhook_deliveries_endpoint_idx
  ON webhook_deliveries (endpoint_id, created_at DESC);
CREATE INDEX IF NOT EXISTS webhook_deliveries_due_idx
  ON webhook_deliveries (next_attempt_at)
  WHERE status = 'pending';
CREATE INDEX IF NOT EXISTS webhook_deliveries_created_idx
  ON webhook_deliveries (created_at);

ALTER TABLE webhook_deliveries ENABLE ROW LEVEL SECURITY;

-- Read: admins of the account (payloads contain customer messages).
-- Writes: service role only (the deliverer); no client policies.
DROP POLICY IF EXISTS webhook_deliveries_select ON webhook_deliveries;
CREATE POLICY webhook_deliveries_select ON webhook_deliveries FOR SELECT
  USING (is_account_member(account_id, 'admin'));

-- Only the server (service role) may bump failure counters.
REVOKE EXECUTE ON FUNCTION public.record_webhook_failure(uuid, int) FROM PUBLIC, anon, authenticated;
