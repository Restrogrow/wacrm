-- ============================================================
-- 050: Trial-ending and plan-renewal reminder emails
--
-- billing_reminder_key remembers the last reminder emailed to the
-- account's owner (e.g. "trial:2d:2026-10-20"), so each stage is sent
-- once: 2 days before the trial ends, on the last day, after it ends;
-- and for paid plans 3 days before the paid-until date and after it.
-- Sent by the every-minute automations cron (lib/billing/reminders.ts),
-- during the day in India time.
-- ============================================================

ALTER TABLE accounts
  ADD COLUMN IF NOT EXISTS billing_reminder_key TEXT,
  ADD COLUMN IF NOT EXISTS billing_reminder_sent_at TIMESTAMPTZ;
