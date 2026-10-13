-- ============================================================
-- 049: WhatsApp number health
--
-- One row per account: the business number's quality rating,
-- messaging limit, display-name status, whether Meta lets it send
-- (health_status.can_send_message) and whether calling is on. Filled
-- by a daily check inside the every-minute automations cron (no new
-- cron job) and by "Check now" in Settings → WhatsApp.
--
-- Shown in Settings → WhatsApp, as a warning bar in the app when the
-- number is at risk, and per account on /admin. The owner is emailed
-- when quality drops or Meta limits the number (last_alert_* stops
-- repeat emails).
--
-- Members can read their account's row (RLS); writes are service-role.
-- ============================================================

CREATE TABLE IF NOT EXISTS whatsapp_number_health (
  account_id       UUID PRIMARY KEY REFERENCES accounts(id) ON DELETE CASCADE,
  phone_number_id  TEXT,
  display_phone    TEXT,
  verified_name    TEXT,
  quality_rating   TEXT,          -- GREEN | YELLOW | RED | UNKNOWN | NA
  messaging_limit  TEXT,          -- e.g. TIER_250, TIER_2K, TIER_UNLIMITED
  name_status      TEXT,          -- APPROVED | PENDING_REVIEW | DECLINED | …
  number_status    TEXT,          -- CONNECTED | FLAGGED | RESTRICTED | …
  can_send         TEXT,          -- AVAILABLE | LIMITED | BLOCKED
  health_errors    JSONB,         -- Meta's reasons when not AVAILABLE
  calling_status   TEXT,          -- ENABLED | DISABLED | NOT_ALLOWED
  check_error      TEXT,          -- why the last check failed, if it did
  checked_at       TIMESTAMPTZ,
  last_alert_key   TEXT,          -- what we last emailed about
  last_alert_at    TIMESTAMPTZ,
  updated_at       TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS whatsapp_number_health_checked_idx
  ON whatsapp_number_health (checked_at NULLS FIRST);

ALTER TABLE whatsapp_number_health ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Members can view their number health" ON whatsapp_number_health;
CREATE POLICY "Members can view their number health" ON whatsapp_number_health
  FOR SELECT USING (is_account_member(account_id, 'viewer'));
