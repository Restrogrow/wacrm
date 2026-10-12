-- ============================================================
-- 035_connect_clients.sql — "Connect RepeatGrow" for partner apps
--
-- Lets a partner app (first: RestroGrow) connect to a RepeatGrow
-- account with a consent screen instead of the owner copy-pasting an
-- API key. Contract: docs/RESTROGROW_CONNECT.md.
--
--   connect_clients — registered partner apps. The client secret is
--                     stored only as a SHA-256 hex hash; redirect URIs
--                     are an exact-match allowlist; allowed_scopes is
--                     the ceiling a client may request.
--   connect_codes   — one-time authorization codes issued by the
--                     consent page (/connect/[client]). Stored hashed,
--                     single use, 5-minute expiry. Exchanged server to
--                     server at POST /api/v1/connect/token for an API key.
--   api_keys.client_id — marks keys minted through Connect, so Settings
--                     can list them as "Connected apps".
--
-- RLS: both new tables have RLS enabled and NO policies, so only the
-- service role (consent server action + token route) can touch them.
--
-- Idempotent — safe to run multiple times.
-- ============================================================

CREATE TABLE IF NOT EXISTS connect_clients (
  id             text PRIMARY KEY,               -- e.g. 'restrogrow'
  name           text NOT NULL,                  -- 'RestroGrow'
  secret_hash    text NOT NULL,                  -- sha256 hex of the client secret
  redirect_uris  text[] NOT NULL,                -- exact-match allowlist
  allowed_scopes text[] NOT NULL,                -- ceiling for what the client may ask for
  created_at     timestamptz DEFAULT now()
);

CREATE TABLE IF NOT EXISTS connect_codes (
  code_hash    text PRIMARY KEY,                 -- sha256 hex of the one-time code
  client_id    text NOT NULL REFERENCES connect_clients(id),
  account_id   uuid NOT NULL REFERENCES accounts(id) ON DELETE CASCADE,
  user_id      uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  scopes       text[] NOT NULL,
  redirect_uri text NOT NULL,
  label        text,                             -- e.g. restaurant name, for the key name
  expires_at   timestamptz NOT NULL,             -- now() + 5 minutes
  used_at      timestamptz
);

CREATE INDEX IF NOT EXISTS connect_codes_expires_at_idx ON connect_codes (expires_at);

ALTER TABLE api_keys ADD COLUMN IF NOT EXISTS client_id text REFERENCES connect_clients(id);
CREATE INDEX IF NOT EXISTS api_keys_client_id_idx ON api_keys (client_id) WHERE client_id IS NOT NULL;

ALTER TABLE connect_clients ENABLE ROW LEVEL SECURITY;
ALTER TABLE connect_codes ENABLE ROW LEVEL SECURITY;

-- Seed RestroGrow. Only the hash of its client secret is stored; the
-- plaintext lives in RestroGrow's .env (REPEATGROW_CLIENT_SECRET).
-- ON CONFLICT keeps re-runs from overwriting a rotated secret.
INSERT INTO connect_clients (id, name, secret_hash, redirect_uris, allowed_scopes)
VALUES (
  'restrogrow',
  'RestroGrow',
  '73ae8d431e24ee24482d1fd9289e5a2a4019e04f23c6d5b9a978b5ca1b47b0a8',
  ARRAY[
    'https://restrogrow.com/main/api/repeatgrow_connect.php',
    'https://www.restrogrow.com/main/api/repeatgrow_connect.php',
    'http://localhost/menuwebsite/main/api/repeatgrow_connect.php'
  ],
  ARRAY['messages:send', 'templates:read', 'templates:write']
)
ON CONFLICT (id) DO NOTHING;
