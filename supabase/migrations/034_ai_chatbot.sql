-- ============================================================
-- 034_ai_chatbot.sql — AI chatbot settings + knowledge base
--
-- One row per account. When `enabled`, inbound text messages that no
-- flow handled are answered by an LLM (Groq, API_GROQ env) grounded
-- ONLY in `knowledge_base` + `instructions`. The bot hands the chat to
-- a human (conversation → pending) when it can't answer or the
-- customer asks for a person, and stays quiet while a human agent is
-- active in the conversation (`pause_minutes_after_agent`).
--
-- RLS: settings-class, mirroring webhook_endpoints — any member reads,
-- admin+ writes. The webhook reads it with the service-role client.
--
-- Idempotent — safe to run multiple times.
-- ============================================================

CREATE TABLE IF NOT EXISTS ai_chatbot_settings (
  account_id                uuid PRIMARY KEY REFERENCES accounts(id) ON DELETE CASCADE,
  enabled                   boolean NOT NULL DEFAULT false,
  bot_name                  text NOT NULL DEFAULT 'Assistant',
  -- Business facts the bot may use: menu, prices, hours, area, policies, FAQs.
  knowledge_base            text NOT NULL DEFAULT '',
  -- Tone / rules ("reply in Hinglish", "never promise delivery times").
  instructions              text NOT NULL DEFAULT '',
  -- Sent when the bot hands the chat to a human.
  handoff_message           text NOT NULL DEFAULT 'Let me connect you with our team — someone will reply here shortly. 🙏',
  -- Bot stays silent for this long after a human agent replies.
  pause_minutes_after_agent integer NOT NULL DEFAULT 30
    CHECK (pause_minutes_after_agent BETWEEN 0 AND 10080),
  updated_at                timestamptz NOT NULL DEFAULT now(),
  updated_by                uuid REFERENCES auth.users(id) ON DELETE SET NULL
);

ALTER TABLE ai_chatbot_settings ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS ai_chatbot_settings_select ON ai_chatbot_settings;
CREATE POLICY ai_chatbot_settings_select ON ai_chatbot_settings FOR SELECT
  USING (is_account_member(account_id));

DROP POLICY IF EXISTS ai_chatbot_settings_insert ON ai_chatbot_settings;
CREATE POLICY ai_chatbot_settings_insert ON ai_chatbot_settings FOR INSERT
  WITH CHECK (is_account_member(account_id, 'admin'));

DROP POLICY IF EXISTS ai_chatbot_settings_update ON ai_chatbot_settings;
CREATE POLICY ai_chatbot_settings_update ON ai_chatbot_settings FOR UPDATE
  USING (is_account_member(account_id, 'admin'));

DROP POLICY IF EXISTS ai_chatbot_settings_delete ON ai_chatbot_settings;
CREATE POLICY ai_chatbot_settings_delete ON ai_chatbot_settings FOR DELETE
  USING (is_account_member(account_id, 'admin'));
