-- ============================================================
-- WhatsApp coexistence support (Business App + Cloud API, same number)
--
-- Meta lets a Tech Provider onboard an existing WhatsApp Business app
-- number onto Cloud API ("coexistence"). The number stays usable in
-- the Business App while Cloud API traffic flows in parallel:
--
--   * The Embedded Signup session reports event
--     FINISH_WHATSAPP_BUSINESS_APP_ONBOARDING. For those numbers
--     /register must be SKIPPED (the number is already registered),
--     so registered_at is set at onboarding time by the signup route.
--   * Within 24h of onboarding the provider must call
--     POST /{phone_number_id}/smb_app_data twice (sync_type
--     "smb_app_state_sync" for contacts, "history" for chat history).
--     Each sync_type is ONE-SHOT — a retry is only possible if the
--     original call failed. The columns below track which succeeded
--     so the retry endpoint knows what is still pending.
--   * Ongoing events arrive on three extra webhook fields:
--     smb_app_state_sync (contacts), smb_message_echoes (messages the
--     business sent from the Business App), history (phase/chunk
--     streamed import).
--
-- Column notes:
--   is_on_biz_app          — mirrors Meta's field; true = coexistence
--                            number. platform_type is not persisted
--                            (it is always "CLOUD_API" when true).
--   smb_contacts_synced_at / smb_history_synced_at — when each
--                            one-shot sync was successfully initiated.
--   smb_sync_request_ids   — Meta's request_id per sync call (support
--                            reference), e.g. {"contacts": "...", "history": "..."}.
--   smb_sync_error         — last failure (initiation error or the
--                            business declining history sharing).
--   smb_sync_progress      — overall history-sync progress % (0-100)
--                            from the latest history webhook.
--
-- Every column is nullable/defaulted — existing rows are untouched.
-- Idempotent — safe to re-run.
-- ============================================================

ALTER TABLE whatsapp_config
  ADD COLUMN IF NOT EXISTS is_on_biz_app BOOLEAN NOT NULL DEFAULT FALSE,
  ADD COLUMN IF NOT EXISTS smb_contacts_synced_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS smb_history_synced_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS smb_sync_request_ids JSONB,
  ADD COLUMN IF NOT EXISTS smb_sync_error TEXT,
  ADD COLUMN IF NOT EXISTS smb_sync_progress SMALLINT;

-- Supports "find coexistence numbers with pending syncs" queries
-- (the 24h sync deadline makes these urgent to notice).
CREATE INDEX IF NOT EXISTS idx_whatsapp_config_is_on_biz_app
  ON whatsapp_config (is_on_biz_app)
  WHERE is_on_biz_app IS TRUE;
