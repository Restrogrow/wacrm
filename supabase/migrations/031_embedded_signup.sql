-- ============================================================
-- Meta Embedded Signup support.
--
-- Embedded Signup (FB.login with config_id) hands back a WABA id,
-- phone number id, business id, and a short-lived code that the
-- server exchanges for a Business Integration System User token —
-- the customer never sees or pastes any credential. `business_id`
-- records the Meta Business Portfolio the customer granted access
-- to (useful for support/debugging); `signup_method` distinguishes
-- rows created via the popup flow from the manual copy-paste form,
-- since the two have different completion states (embedded rows
-- always start unregistered — the popup never collects a 2FA PIN).
-- ============================================================

ALTER TABLE whatsapp_config ADD COLUMN IF NOT EXISTS business_id TEXT;

ALTER TABLE whatsapp_config ADD COLUMN IF NOT EXISTS signup_method TEXT NOT NULL DEFAULT 'manual';

ALTER TABLE whatsapp_config DROP CONSTRAINT IF EXISTS whatsapp_config_signup_method_check;
ALTER TABLE whatsapp_config ADD CONSTRAINT whatsapp_config_signup_method_check
  CHECK (signup_method IN ('manual', 'embedded'));
