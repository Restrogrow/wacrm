-- ============================================================
-- 081: AI answers incoming WhatsApp calls
--
-- When on, an incoming call rings for the team first; if nobody picks
-- up within `voice_inbound_delay_seconds`, an open dashboard tab answers
-- it with the AI voice agent (same knowledge base and voice as AI calls,
-- migration 080). Needs at least one dashboard tab open. Inbound AI
-- calls are marked whatsapp_calls.ai_agent = true like outbound ones.
--
-- Idempotent — safe to run multiple times.
-- ============================================================

ALTER TABLE ai_chatbot_settings
  ADD COLUMN IF NOT EXISTS voice_inbound_enabled BOOLEAN NOT NULL DEFAULT false,
  -- Rings for the team this long before the AI answers.
  ADD COLUMN IF NOT EXISTS voice_inbound_delay_seconds INTEGER NOT NULL DEFAULT 8
    CHECK (voice_inbound_delay_seconds BETWEEN 0 AND 30),
  -- What the AI should do on incoming calls.
  ADD COLUMN IF NOT EXISTS voice_inbound_instructions TEXT NOT NULL DEFAULT '';
