-- ============================================================
-- 042_saved_replies
--
-- Saved (quick) replies for the inbox: type "/" in the message box to
-- pick one. Shared by everyone on the account; admins and above create,
-- edit and delete them (Settings → Saved replies).
--
-- Bodies may contain variables filled in when inserted:
--   {{name}}       contact's first name
--   {{full_name}}  contact's full name
--   {{agent}}      the agent's first name
-- ============================================================

CREATE TABLE IF NOT EXISTS saved_replies (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  account_id  uuid NOT NULL REFERENCES accounts(id) ON DELETE CASCADE,
  -- Typed after "/", e.g. "price" → "/price". Lowercase letters,
  -- digits, - and _ (checked in the app).
  shortcut    text NOT NULL,
  title       text,
  body        text NOT NULL CHECK (char_length(body) <= 4096),
  created_by  uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at  timestamptz NOT NULL DEFAULT now(),
  updated_at  timestamptz NOT NULL DEFAULT now(),
  UNIQUE (account_id, shortcut)
);

ALTER TABLE saved_replies ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS saved_replies_select ON saved_replies;
CREATE POLICY saved_replies_select ON saved_replies FOR SELECT
  USING (is_account_member(account_id));

DROP POLICY IF EXISTS saved_replies_insert ON saved_replies;
CREATE POLICY saved_replies_insert ON saved_replies FOR INSERT
  WITH CHECK (is_account_member(account_id, 'admin'));

DROP POLICY IF EXISTS saved_replies_update ON saved_replies;
CREATE POLICY saved_replies_update ON saved_replies FOR UPDATE
  USING (is_account_member(account_id, 'admin'))
  WITH CHECK (is_account_member(account_id, 'admin'));

DROP POLICY IF EXISTS saved_replies_delete ON saved_replies;
CREATE POLICY saved_replies_delete ON saved_replies FOR DELETE
  USING (is_account_member(account_id, 'admin'));
