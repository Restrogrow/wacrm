-- ============================================================
-- 078_device_push_tokens.sql — push notification tokens for the mobile app
--
-- One row per installed device (Expo push token). The app registers its
-- token through POST /api/mobile/push-token, which writes with the service
-- role; there are deliberately NO insert/update policies, so a signed-in
-- user can never plant a token for someone else. Users can read and remove
-- only their OWN rows. If a phone changes hands, the API re-assigns the
-- token to the new user (token is UNIQUE).
-- ============================================================

CREATE TABLE IF NOT EXISTS device_push_tokens (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  account_id UUID NOT NULL REFERENCES accounts(id) ON DELETE CASCADE,
  token TEXT NOT NULL,
  platform TEXT NOT NULL CHECK (platform IN ('ios', 'android')),
  device_name TEXT,
  app_version TEXT,
  enabled BOOLEAN NOT NULL DEFAULT TRUE,
  last_seen_at TIMESTAMPTZ DEFAULT NOW(),
  created_at TIMESTAMPTZ DEFAULT NOW(),
  CONSTRAINT device_push_tokens_token_key UNIQUE (token)
);

CREATE INDEX IF NOT EXISTS device_push_tokens_user_idx ON device_push_tokens (user_id) WHERE enabled;
CREATE INDEX IF NOT EXISTS device_push_tokens_account_idx ON device_push_tokens (account_id) WHERE enabled;

ALTER TABLE device_push_tokens ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Users read their own push tokens" ON device_push_tokens;
CREATE POLICY "Users read their own push tokens" ON device_push_tokens
  FOR SELECT USING (user_id = auth.uid());

DROP POLICY IF EXISTS "Users remove their own push tokens" ON device_push_tokens;
CREATE POLICY "Users remove their own push tokens" ON device_push_tokens
  FOR DELETE USING (user_id = auth.uid());
-- No INSERT / UPDATE policies: writes go through the API with the service role.
