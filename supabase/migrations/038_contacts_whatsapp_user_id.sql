-- ============================================================
-- 038_contacts_whatsapp_user_id
--
-- WhatsApp usernames. A user who adopts a username can hide their
-- phone number; Meta then leaves `from` / `wa_id` out of webhooks and
-- identifies them only by a business-scoped user ID (BSUID) such as
-- "IN.13491208655302741918". Meta requires every integration to
-- support this.
-- https://developers.facebook.com/documentation/business-messaging/whatsapp/business-scoped-user-ids/
--
--   whatsapp_user_id   — the BSUID (Meta sends it on every inbound
--                        message, username or not). Unique per account.
--   whatsapp_username  — the @username, when the user has one.
--
-- `phone` stays NOT NULL: a contact known only by BSUID is stored with
-- phone = '' (already excluded from the 022 unique phone index) and is
-- messaged via the BSUID until Meta reveals the number.
-- ============================================================

ALTER TABLE contacts
  ADD COLUMN IF NOT EXISTS whatsapp_user_id TEXT,
  ADD COLUMN IF NOT EXISTS whatsapp_username TEXT;

CREATE UNIQUE INDEX IF NOT EXISTS idx_contacts_account_whatsapp_user_id
  ON contacts (account_id, whatsapp_user_id)
  WHERE whatsapp_user_id IS NOT NULL;
