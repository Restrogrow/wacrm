-- ============================================================
-- 091: Billing hold — no message is lost to a Meta payment problem
--
-- When Meta refuses a message because it can't charge the business
-- (error 131042), or the daily number check reports a payment problem,
-- the account goes on "billing hold" (lib/whatsapp/billing-hold.ts):
--
--   * broadcasts stop sending; their remaining recipients stay pending
--   * every template (inbox, API, Shopify, WooCommerce, automations,
--     journeys, …) is kept in held_messages instead of being sent; the
--     chat shows it as "sending"
--   * a message Meta failed with 131042 after accepting it is put back:
--     broadcast recipients return to pending, other messages are held
--
-- The hold ends with the Resume button (Settings banner) or by itself:
-- every 15 minutes the cron tries the oldest held message, or re-checks
-- Meta when none is waiting. Then held messages and broadcasts go out.
--
--   whatsapp_config.billing_hold_at          on hold since (NULL = not)
--   whatsapp_config.billing_hold_reason      what Meta said
--   whatsapp_config.billing_hold_checked_at  last automatic re-check
--   messages.send_params                     how to send a template again
--
-- RLS: held_messages has no client policies (service role only).
-- Idempotent — safe to run multiple times.
-- ============================================================

ALTER TABLE whatsapp_config
  ADD COLUMN IF NOT EXISTS billing_hold_at         timestamptz,
  ADD COLUMN IF NOT EXISTS billing_hold_reason     text,
  ADD COLUMN IF NOT EXISTS billing_hold_checked_at timestamptz;

ALTER TABLE messages ADD COLUMN IF NOT EXISTS send_params jsonb;

CREATE TABLE IF NOT EXISTS held_messages (
  id               uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  account_id       uuid NOT NULL REFERENCES accounts(id) ON DELETE CASCADE,
  conversation_id  uuid NOT NULL REFERENCES conversations(id) ON DELETE CASCADE,
  -- The chat's "sending" row; updated in place when it finally goes out.
  message_row_id   uuid REFERENCES messages(id) ON DELETE SET NULL,
  -- SendMessageParams (lib/whatsapp/send-message.ts) as JSON.
  params           jsonb NOT NULL,
  status           text NOT NULL DEFAULT 'held' CHECK (status IN ('held', 'sent', 'failed')),
  attempts         integer NOT NULL DEFAULT 0,
  last_error       text,
  created_at       timestamptz NOT NULL DEFAULT now(),
  sent_at          timestamptz
);

CREATE INDEX IF NOT EXISTS held_messages_waiting_idx
  ON held_messages (account_id, created_at)
  WHERE status = 'held';

ALTER TABLE held_messages ENABLE ROW LEVEL SECURITY;
