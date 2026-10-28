-- ============================================================
-- 087_ai_usage_events.sql — one row per Gemini call, with tokens
--
-- Feeds /admin/ai-usage: which model ran, for which feature and account,
-- how many tokens went in and out, and what it cost. Cost is worked out
-- in code from the token counts (src/lib/ai/pricing.ts), so a price
-- change never needs a migration. Server writes only (service role);
-- no client policies, like ai_usage_daily.
-- ============================================================

CREATE TABLE IF NOT EXISTS ai_usage_events (
  id BIGSERIAL PRIMARY KEY,
  account_id UUID REFERENCES accounts(id) ON DELETE CASCADE,
  feature TEXT NOT NULL,
  model TEXT NOT NULL,
  input_tokens INTEGER NOT NULL DEFAULT 0,
  -- Part of input_tokens that was audio / an image (priced differently).
  input_audio_tokens INTEGER NOT NULL DEFAULT 0,
  input_image_tokens INTEGER NOT NULL DEFAULT 0,
  output_tokens INTEGER NOT NULL DEFAULT 0,
  thinking_tokens INTEGER NOT NULL DEFAULT 0,
  latency_ms INTEGER,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS ai_usage_events_created_idx ON ai_usage_events (created_at DESC);
CREATE INDEX IF NOT EXISTS ai_usage_events_account_idx ON ai_usage_events (account_id, created_at DESC);

ALTER TABLE ai_usage_events ENABLE ROW LEVEL SECURITY;
-- No policies on purpose: service role only.
