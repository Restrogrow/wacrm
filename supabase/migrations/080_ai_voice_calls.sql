-- ============================================================
-- 080: AI voice agent for outbound WhatsApp calls
--
-- An agent clicks "AI call" on a lead: the call is placed from their
-- browser as usual, and once the customer picks up, the browser passes
-- the call audio to and from Gemini Live, so the AI does the talking.
-- The agent hears both sides and can take over at any time.
--
-- ai_chatbot_settings: what the AI says on calls. It also uses the
--   chatbot's knowledge base and bot name.
-- whatsapp_calls.ai_agent: true when the AI placed the call (Calls page).
--
-- Idempotent — safe to run multiple times.
-- ============================================================

ALTER TABLE ai_chatbot_settings
  -- The goal and script for calls ("confirm the order, offer the combo…").
  ADD COLUMN IF NOT EXISTS voice_instructions TEXT NOT NULL DEFAULT '',
  -- A Gemini Live voice name; '' uses Google's default voice.
  ADD COLUMN IF NOT EXISTS voice_name TEXT NOT NULL DEFAULT '';

ALTER TABLE whatsapp_calls
  ADD COLUMN IF NOT EXISTS ai_agent BOOLEAN NOT NULL DEFAULT false;
