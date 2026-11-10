-- ============================================================
-- 096: index behind broadcast pacing (Meta messaging limit)
--
-- lib/whatsapp/messaging-limit.ts asks, before every send batch, "how
-- many messages has this account sent in the last 24 hours?" — a count
-- over broadcast_recipients.sent_at joined to broadcasts.account_id.
--
-- Without an index on sent_at that is a full scan of every recipient
-- row the account has ever had, once a minute per in-flight broadcast.
-- The partial index keeps it to the sent rows only (pending/failed rows
-- have sent_at NULL and are the majority during a large paced send).
--
-- Idempotent — safe to run multiple times.
-- ============================================================

CREATE INDEX IF NOT EXISTS broadcast_recipients_sent_at_idx
  ON broadcast_recipients (sent_at)
  WHERE sent_at IS NOT NULL;

-- The same count joins up to broadcasts to filter by account.
CREATE INDEX IF NOT EXISTS broadcasts_account_idx
  ON broadcasts (account_id);
