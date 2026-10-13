-- ============================================================
-- 043_scheduled_broadcasts
--
-- "Send later" for broadcasts. When a broadcast is scheduled the
-- wizard resolves the audience and each recipient's template values
-- immediately and stores them; the every-minute automations cron
-- (lib/broadcasts/scheduled.ts) sends it from the server once
-- broadcasts.scheduled_at is due, in batches, so the browser doesn't
-- need to stay open.
--
--   broadcast_recipients.params     body {{1}}, {{2}}, … values (jsonb array)
--   broadcasts.message_params       shared send-time params, e.g. header media URL
--   broadcasts.send_lease_until     which cron run is currently sending it
--
-- broadcasts.status already allows 'scheduled' (001), and
-- broadcasts.scheduled_at already exists.
-- ============================================================

ALTER TABLE broadcast_recipients
  ADD COLUMN IF NOT EXISTS params jsonb;

ALTER TABLE broadcasts
  ADD COLUMN IF NOT EXISTS message_params jsonb,
  -- Short lease so two overlapping cron runs never send the same
  -- broadcast at once.
  ADD COLUMN IF NOT EXISTS send_lease_until timestamptz;

-- The cron looks for due scheduled broadcasts.
CREATE INDEX IF NOT EXISTS broadcasts_scheduled_due_idx
  ON broadcasts (scheduled_at)
  WHERE status IN ('scheduled', 'sending') AND scheduled_at IS NOT NULL;
