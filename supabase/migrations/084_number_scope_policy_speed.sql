-- ============================================================
-- 084: Cheaper current-number policies (follow-up to 083)
--
-- 083's policies called current_wa_number() / current_wa_waba() up to
-- twice per row checked. Same rule with one call: the comparison is NULL
-- when either side is NULL (untagged row, or no number connected), and
-- COALESCE turns that into "visible", exactly as before.
--
-- Idempotent — safe to run multiple times.
-- ============================================================

DROP POLICY IF EXISTS conversations_current_number ON conversations;
CREATE POLICY conversations_current_number ON conversations AS RESTRICTIVE FOR SELECT
  USING (COALESCE(phone_number_id = current_wa_number(account_id), TRUE));

DROP POLICY IF EXISTS broadcasts_current_number ON broadcasts;
CREATE POLICY broadcasts_current_number ON broadcasts AS RESTRICTIVE FOR SELECT
  USING (COALESCE(phone_number_id = current_wa_number(account_id), TRUE));

DROP POLICY IF EXISTS message_templates_current_waba ON message_templates;
CREATE POLICY message_templates_current_waba ON message_templates AS RESTRICTIVE FOR SELECT
  USING (COALESCE(waba_id = current_wa_waba(account_id), TRUE));
