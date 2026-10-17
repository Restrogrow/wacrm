-- ============================================================
-- 067_inbox_notes_mentions.sql — internal notes + @mentions in chats
--
-- Internal notes live in their OWN table, not in `messages`, on purpose:
-- everything that reads `messages` (the WhatsApp send path, last-message
-- previews, unread counters, reports, the public /api/v1 API, the AI
-- chatbot and chat summaries, the daily summary) keeps seeing only real
-- customer-facing traffic. A note can therefore never be sent to a
-- customer, never counts as an agent reply, and never leaks via the API.
--
-- Mentions: `mentions` holds the user ids picked in the composer. The API
-- route validates they are members of the account before creating one
-- 'note_mention' notification per person (written with the service role,
-- like the existing share-chat notifications).
-- ============================================================

CREATE TABLE IF NOT EXISTS conversation_notes (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  account_id UUID NOT NULL REFERENCES accounts(id) ON DELETE CASCADE,
  conversation_id UUID NOT NULL REFERENCES conversations(id) ON DELETE CASCADE,
  author_id UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  body TEXT NOT NULL CHECK (char_length(btrim(body)) BETWEEN 1 AND 2000),
  mentions UUID[] NOT NULL DEFAULT '{}',
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_conversation_notes_conversation
  ON conversation_notes (conversation_id, created_at);
CREATE INDEX IF NOT EXISTS idx_conversation_notes_account
  ON conversation_notes (account_id);

ALTER TABLE conversation_notes ENABLE ROW LEVEL SECURITY;

-- Everyone on the team (including viewers) can read notes.
DROP POLICY IF EXISTS conversation_notes_select ON conversation_notes;
CREATE POLICY conversation_notes_select ON conversation_notes FOR SELECT
  USING (is_account_member(account_id));

-- Agents and above can write notes as themselves, only on a conversation
-- of their own account.
DROP POLICY IF EXISTS conversation_notes_insert ON conversation_notes;
CREATE POLICY conversation_notes_insert ON conversation_notes FOR INSERT
  WITH CHECK (
    is_account_member(account_id, 'agent')
    AND author_id = auth.uid()
    AND EXISTS (
      SELECT 1 FROM conversations c
      WHERE c.id = conversation_notes.conversation_id
        AND c.account_id = conversation_notes.account_id
    )
  );

-- The author can delete their own note; admins can delete any. No edits:
-- a note is a record of what was said.
DROP POLICY IF EXISTS conversation_notes_delete ON conversation_notes;
CREATE POLICY conversation_notes_delete ON conversation_notes FOR DELETE
  USING (author_id = auth.uid() OR is_account_member(account_id, 'admin'));

-- Live updates in an open thread.
ALTER TABLE conversation_notes REPLICA IDENTITY FULL;
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_publication_tables
    WHERE pubname = 'supabase_realtime' AND tablename = 'conversation_notes'
  ) THEN
    ALTER PUBLICATION supabase_realtime ADD TABLE conversation_notes;
  END IF;
END $$;

-- Notification type for "you were mentioned in a note". Migration 066
-- already allows 'mention'; this block keeps whatever the constraint allows
-- today and only adds 'mention' if it is missing, so it is safe whether or
-- not other migrations changed the list.
DO $$
DECLARE
  v_def TEXT;
  v_types TEXT[];
BEGIN
  SELECT pg_get_constraintdef(oid) INTO v_def
  FROM pg_constraint
  WHERE conrelid = 'public.notifications'::regclass
    AND conname = 'notifications_type_check';

  IF v_def IS NULL OR v_def LIKE '%''mention''%' THEN
    RETURN;
  END IF;

  SELECT array_agg(DISTINCT m[1]) INTO v_types
  FROM regexp_matches(v_def, '''([a-z_]+)''', 'g') AS m;
  v_types := array_append(COALESCE(v_types, ARRAY['conversation_assigned']), 'mention');

  ALTER TABLE notifications DROP CONSTRAINT notifications_type_check;
  EXECUTE format(
    'ALTER TABLE notifications ADD CONSTRAINT notifications_type_check CHECK (type IN (%s))',
    (SELECT string_agg(quote_literal(t), ', ') FROM (SELECT DISTINCT unnest(v_types) AS t) x)
  );
END $$;
