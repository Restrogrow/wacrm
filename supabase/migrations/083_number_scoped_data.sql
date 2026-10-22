-- ============================================================
-- 083: Chats, broadcasts and templates belong to a WhatsApp number
--
-- An account can disconnect number 1 and connect number 2. Before this,
-- everything number 1 did kept showing as if it were number 2's. Now:
--
--   conversations, broadcasts  → phone_number_id of the number they ran on
--   message_templates          → waba_id of the Business Account (Meta keeps
--                                templates per WABA, not per number)
--
-- A BEFORE INSERT trigger fills the tag from whatsapp_config, so no insert
-- in the app has to change. A RESTRICTIVE select policy hides rows of
-- another number from the dashboard; nothing is deleted, and reconnecting
-- number 1 brings its history back. With no number connected, or rows
-- that have no tag (older than this migration on an account with no
-- config), everything stays visible.
--
-- Templates keep UNIQUE (account_id, name, language). When the new WABA
-- has a template with the same name and language as an old WABA's, the
-- old local row is removed (it is only a copy: the template still lives in
-- Meta, and a sync after reconnecting number 1 brings it back).
--
-- Server code on the service role is not filtered by RLS; the places that
-- find a contact's conversation filter by number themselves.
--
-- Idempotent — safe to run multiple times.
-- ============================================================

ALTER TABLE conversations     ADD COLUMN IF NOT EXISTS phone_number_id TEXT;
ALTER TABLE broadcasts        ADD COLUMN IF NOT EXISTS phone_number_id TEXT;
ALTER TABLE message_templates ADD COLUMN IF NOT EXISTS waba_id TEXT;

CREATE INDEX IF NOT EXISTS idx_conversations_account_number
  ON conversations (account_id, phone_number_id);

-- Existing rows belong to the number connected right now.
UPDATE conversations c SET phone_number_id = w.phone_number_id
  FROM whatsapp_config w
  WHERE c.phone_number_id IS NULL AND w.account_id = c.account_id;
UPDATE broadcasts b SET phone_number_id = w.phone_number_id
  FROM whatsapp_config w
  WHERE b.phone_number_id IS NULL AND w.account_id = b.account_id;
UPDATE message_templates t SET waba_id = w.waba_id
  FROM whatsapp_config w
  WHERE t.waba_id IS NULL AND w.account_id = t.account_id AND w.waba_id IS NOT NULL;

-- ---- current number / WABA of an account --------------------
CREATE OR REPLACE FUNCTION current_wa_number(p_account UUID)
RETURNS TEXT LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT phone_number_id FROM whatsapp_config WHERE account_id = p_account
$$;

CREATE OR REPLACE FUNCTION current_wa_waba(p_account UUID)
RETURNS TEXT LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT waba_id FROM whatsapp_config WHERE account_id = p_account
$$;

-- ---- tag new rows -------------------------------------------
CREATE OR REPLACE FUNCTION tag_wa_number()
RETURNS TRIGGER LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF NEW.phone_number_id IS NULL AND NEW.account_id IS NOT NULL THEN
    NEW.phone_number_id := current_wa_number(NEW.account_id);
  END IF;
  RETURN NEW;
END $$;

DROP TRIGGER IF EXISTS conversations_tag_number ON conversations;
CREATE TRIGGER conversations_tag_number BEFORE INSERT ON conversations
  FOR EACH ROW EXECUTE FUNCTION tag_wa_number();
DROP TRIGGER IF EXISTS broadcasts_tag_number ON broadcasts;
CREATE TRIGGER broadcasts_tag_number BEFORE INSERT ON broadcasts
  FOR EACH ROW EXECUTE FUNCTION tag_wa_number();

-- Templates: tag with the WABA, and make room when the new WABA has a
-- template of the same name + language as an old WABA's copy. Runs before
-- the ON CONFLICT check, so the submit route's upsert works unchanged.
CREATE OR REPLACE FUNCTION tag_wa_template()
RETURNS TRIGGER LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF NEW.waba_id IS NULL AND NEW.account_id IS NOT NULL THEN
    NEW.waba_id := current_wa_waba(NEW.account_id);
  END IF;
  IF NEW.waba_id IS NOT NULL THEN
    DELETE FROM message_templates
      WHERE account_id = NEW.account_id AND name = NEW.name AND language IS NOT DISTINCT FROM NEW.language
        AND waba_id IS NOT NULL AND waba_id <> NEW.waba_id;
  END IF;
  RETURN NEW;
END $$;

DROP TRIGGER IF EXISTS message_templates_tag_waba ON message_templates;
CREATE TRIGGER message_templates_tag_waba BEFORE INSERT ON message_templates
  FOR EACH ROW EXECUTE FUNCTION tag_wa_template();

-- ---- hide other numbers' rows in the dashboard --------------
DROP POLICY IF EXISTS conversations_current_number ON conversations;
CREATE POLICY conversations_current_number ON conversations AS RESTRICTIVE FOR SELECT
  USING (phone_number_id IS NULL OR current_wa_number(account_id) IS NULL
         OR phone_number_id = current_wa_number(account_id));

DROP POLICY IF EXISTS broadcasts_current_number ON broadcasts;
CREATE POLICY broadcasts_current_number ON broadcasts AS RESTRICTIVE FOR SELECT
  USING (phone_number_id IS NULL OR current_wa_number(account_id) IS NULL
         OR phone_number_id = current_wa_number(account_id));

DROP POLICY IF EXISTS message_templates_current_waba ON message_templates;
CREATE POLICY message_templates_current_waba ON message_templates AS RESTRICTIVE FOR SELECT
  USING (waba_id IS NULL OR current_wa_waba(account_id) IS NULL
         OR waba_id = current_wa_waba(account_id));
