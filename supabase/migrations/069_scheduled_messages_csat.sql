-- ============================================================
-- 069_scheduled_messages_csat.sql
--
-- 1. scheduled_messages — "Send later" for a single chat message. The
--    every-minute automations cron (lib/scheduled-messages/process.ts)
--    sends it once scheduled_at is due, through the normal send path.
--    Writes go through the API routes with the service-role client, so
--    members only get a read policy.
--
-- 2. csat_settings — per-account switch + wording for the rating
--    request sent when a chat is closed.
--
-- 3. csat_responses — one row per conversation (UNIQUE), created when
--    the survey is sent (rating NULL) and filled in when the customer
--    taps a button. The unique key is what guarantees at most one
--    survey per conversation.
-- ============================================================

CREATE TABLE IF NOT EXISTS scheduled_messages (
  id               UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  account_id       UUID NOT NULL REFERENCES accounts(id) ON DELETE CASCADE,
  conversation_id  UUID NOT NULL REFERENCES conversations(id) ON DELETE CASCADE,
  -- Text only for now (media/templates are a follow-up).
  message_type     TEXT NOT NULL DEFAULT 'text' CHECK (message_type = 'text'),
  content_text     TEXT NOT NULL CHECK (char_length(content_text) BETWEEN 1 AND 4096),
  scheduled_at     TIMESTAMPTZ NOT NULL,
  status           TEXT NOT NULL DEFAULT 'pending'
                   CHECK (status IN ('pending', 'sending', 'sent', 'failed', 'cancelled')),
  error_message    TEXT,
  sent_message_id  UUID,
  claimed_at       TIMESTAMPTZ,
  sent_at          TIMESTAMPTZ,
  created_by       UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at       TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at       TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- The cron looks for due pending rows.
CREATE INDEX IF NOT EXISTS scheduled_messages_due_idx
  ON scheduled_messages (scheduled_at)
  WHERE status IN ('pending', 'sending');

CREATE INDEX IF NOT EXISTS scheduled_messages_conversation_idx
  ON scheduled_messages (conversation_id, status);

ALTER TABLE scheduled_messages ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Members can view scheduled messages" ON scheduled_messages;
CREATE POLICY "Members can view scheduled messages" ON scheduled_messages
  FOR SELECT USING (is_account_member(account_id, 'viewer'));

-- ------------------------------------------------------------

CREATE TABLE IF NOT EXISTS csat_settings (
  account_id    UUID PRIMARY KEY REFERENCES accounts(id) ON DELETE CASCADE,
  enabled       BOOLEAN NOT NULL DEFAULT FALSE,
  message_text  TEXT NOT NULL DEFAULT 'Thanks for chatting with us! How was your experience today?'
                CHECK (char_length(message_text) BETWEEN 1 AND 1024),
  updated_by    UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  updated_at    TIMESTAMPTZ NOT NULL DEFAULT now()
);

ALTER TABLE csat_settings ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Members can view csat settings" ON csat_settings;
CREATE POLICY "Members can view csat settings" ON csat_settings
  FOR SELECT USING (is_account_member(account_id, 'viewer'));

-- ------------------------------------------------------------

CREATE TABLE IF NOT EXISTS csat_responses (
  id               UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  account_id       UUID NOT NULL REFERENCES accounts(id) ON DELETE CASCADE,
  conversation_id  UUID NOT NULL REFERENCES conversations(id) ON DELETE CASCADE,
  contact_id       UUID REFERENCES contacts(id) ON DELETE SET NULL,
  -- Who owned the chat when it was closed (for per-agent scores).
  agent_id         UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  sent_at          TIMESTAMPTZ NOT NULL DEFAULT now(),
  -- 1 = bad, 2 = okay, 3 = great. NULL until the customer answers.
  rating           SMALLINT CHECK (rating BETWEEN 1 AND 3),
  responded_at     TIMESTAMPTZ,
  UNIQUE (conversation_id)
);

CREATE INDEX IF NOT EXISTS csat_responses_account_sent_idx
  ON csat_responses (account_id, sent_at DESC);

ALTER TABLE csat_responses ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Members can view csat responses" ON csat_responses;
CREATE POLICY "Members can view csat responses" ON csat_responses
  FOR SELECT USING (is_account_member(account_id, 'viewer'));
