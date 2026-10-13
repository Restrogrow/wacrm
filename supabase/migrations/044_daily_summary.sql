-- ============================================================
-- 044_daily_summary
--
-- Daily email summary for business owners (Settings → Daily summary).
-- Each account chooses whether to get it, at which hour (India time),
-- and who receives it. The every-minute automations cron
-- (lib/summary/daily.ts) sends it once per day at that hour:
-- before noon it covers the previous day; from noon, today so far.
--
--   summary_enabled       on/off (off by default)
--   summary_hour          0–23, IST
--   summary_emails        recipients; empty = the account owner's email
--   summary_last_sent_on  IST date of the last send (claimed before
--                         sending, so it never goes out twice a day)
--
-- Email goes through the app's SMTP settings (SMTP_* env vars).
-- ============================================================

ALTER TABLE accounts
  ADD COLUMN IF NOT EXISTS summary_enabled boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS summary_hour smallint NOT NULL DEFAULT 9
    CHECK (summary_hour BETWEEN 0 AND 23),
  ADD COLUMN IF NOT EXISTS summary_emails text[] NOT NULL DEFAULT '{}',
  ADD COLUMN IF NOT EXISTS summary_last_sent_on date;

CREATE INDEX IF NOT EXISTS accounts_summary_due_idx
  ON accounts (summary_hour)
  WHERE summary_enabled;
