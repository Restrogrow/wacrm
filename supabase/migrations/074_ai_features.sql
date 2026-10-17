-- ============================================================
-- 074_ai_features.sql — AI scores per conversation + daily AI quota
--
-- conversation_ai: one row per conversation holding the latest AI read of
--   the chat: intent, sentiment and a 0-100 lead score. Written only by
--   server code (cron / the analyse route) with the service role; members
--   can read their account's rows.
--
-- ai_usage_daily: a per-account, per-feature counter for the day. No
--   client policies (service role only). ai_usage_bump() increments it
--   atomically and refuses once the cap is reached, so two parallel
--   requests cannot both slip past the limit.
-- ============================================================

CREATE TABLE IF NOT EXISTS conversation_ai (
  conversation_id UUID PRIMARY KEY REFERENCES conversations(id) ON DELETE CASCADE,
  account_id UUID NOT NULL REFERENCES accounts(id) ON DELETE CASCADE,
  intent TEXT NOT NULL DEFAULT 'other'
    CHECK (intent IN ('pricing', 'support', 'order_status', 'complaint', 'buying', 'other')),
  sentiment TEXT NOT NULL DEFAULT 'neutral'
    CHECK (sentiment IN ('positive', 'neutral', 'negative')),
  lead_score INTEGER NOT NULL DEFAULT 0 CHECK (lead_score BETWEEN 0 AND 100),
  -- conversations.last_message_at at the time of analysis; a newer
  -- message than this means the read is stale.
  analyzed_message_at TIMESTAMPTZ,
  analyzed_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS conversation_ai_account_score_idx
  ON conversation_ai (account_id, lead_score DESC);

ALTER TABLE conversation_ai ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Members can view conversation ai" ON conversation_ai;
CREATE POLICY "Members can view conversation ai" ON conversation_ai
  FOR SELECT USING (is_account_member(account_id, 'viewer'));
-- No insert/update/delete policies: the server writes with the service role.

CREATE TABLE IF NOT EXISTS ai_usage_daily (
  account_id UUID NOT NULL REFERENCES accounts(id) ON DELETE CASCADE,
  day DATE NOT NULL,
  feature TEXT NOT NULL,
  used INTEGER NOT NULL DEFAULT 0,
  PRIMARY KEY (account_id, day, feature)
);

ALTER TABLE ai_usage_daily ENABLE ROW LEVEL SECURITY;
-- No policies on purpose: service role only.

-- Atomically count one use. Returns TRUE if allowed, FALSE if the cap for
-- today is already reached (the counter is then left unchanged).
CREATE OR REPLACE FUNCTION public.ai_usage_bump(
  p_account_id UUID,
  p_feature TEXT,
  p_cap INTEGER
) RETURNS BOOLEAN
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_day DATE := (now() AT TIME ZONE 'Asia/Kolkata')::date;
  v_used INTEGER;
BEGIN
  IF p_cap <= 0 THEN
    RETURN FALSE;
  END IF;
  INSERT INTO ai_usage_daily (account_id, day, feature, used)
  VALUES (p_account_id, v_day, p_feature, 1)
  ON CONFLICT (account_id, day, feature)
  DO UPDATE SET used = ai_usage_daily.used + 1
  WHERE ai_usage_daily.used < p_cap
  RETURNING used INTO v_used;
  RETURN v_used IS NOT NULL;
END;
$$;

REVOKE ALL ON FUNCTION public.ai_usage_bump(UUID, TEXT, INTEGER) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.ai_usage_bump(UUID, TEXT, INTEGER) TO service_role;
