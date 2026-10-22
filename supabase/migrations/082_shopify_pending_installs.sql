-- ============================================================
-- 082: Shopify installs waiting for a Repeat Grow login
--
-- Shopify's App Store check wants OAuth to start the moment a merchant
-- installs, before any login of ours. When the merchant isn't signed in
-- yet, the OAuth callback exchanges the code (codes expire within
-- minutes) and parks the encrypted tokens here; after they sign in or
-- sign up, /api/integrations/shopify/claim moves the connection onto
-- their account and deletes the row.
--
-- The browser holds only a random claim token in an httpOnly cookie; we
-- store its SHA-256. Rows expire after an hour and are swept on insert.
-- Service role only: RLS on, no policies.
--
-- Idempotent — safe to run multiple times.
-- ============================================================

CREATE TABLE IF NOT EXISTS shopify_pending_installs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  claim_hash TEXT NOT NULL UNIQUE,
  shop_domain TEXT NOT NULL,
  shop_name TEXT,
  access_token TEXT NOT NULL,          -- encrypted (AES-256-GCM)
  refresh_token TEXT,                  -- encrypted
  access_token_expires_at TIMESTAMPTZ,
  scopes TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  expires_at TIMESTAMPTZ NOT NULL DEFAULT now() + interval '1 hour'
);

CREATE INDEX IF NOT EXISTS shopify_pending_installs_expires_idx
  ON shopify_pending_installs (expires_at);

ALTER TABLE shopify_pending_installs ENABLE ROW LEVEL SECURITY;
