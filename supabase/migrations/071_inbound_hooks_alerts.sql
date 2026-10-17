-- ============================================================
-- 071_inbound_hooks_alerts.sql — inbound webhooks + team alert channels
--
-- inbound_hooks
--   Named "Inbound webhook" endpoints an admin creates in Settings. Each has
--   an unguessable URL token; only its SHA-256 hash is stored (like API
--   keys), the full URL is shown once. Zapier / Make / n8n / Google Forms /
--   Typeform POST contacts to it (POST /api/hooks/in/<token>).
--
-- inbound_hook_deliveries
--   One row per delivery so admins can see what happened ("Recent
--   deliveries"). Pruned by the delivery handler (30 days).
--
-- alert_channels
--   Where team alerts go: a Slack incoming-webhook URL, a Discord webhook
--   URL or a Telegram bot token + chat id. The secret part is stored
--   ENCRYPTED (AES-256-GCM, same helper as the WhatsApp token) and never
--   returned to the browser.
--
-- RLS is enabled with ZERO policies on all three tables, like
-- platform_admins and the other secret-holding tables: only server code
-- using the service-role client (after a role check) reads or writes them.
-- ============================================================

CREATE TABLE IF NOT EXISTS inbound_hooks (
  id                   UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  account_id           UUID NOT NULL REFERENCES accounts(id) ON DELETE CASCADE,
  name                 TEXT NOT NULL,
  -- SHA-256 hex of the URL token. The token itself is never stored.
  token_hash           TEXT NOT NULL UNIQUE,
  -- Non-secret display string, e.g. "whk_AbCd1234".
  token_prefix         TEXT NOT NULL,
  -- A hook may only send WhatsApp template messages when an admin allows it.
  allow_send           BOOLEAN NOT NULL DEFAULT FALSE,
  -- Tags added to every contact that arrives through this hook.
  default_tags         TEXT[] NOT NULL DEFAULT '{}',
  -- Calling code used for numbers without one (e.g. "98765 43210").
  default_country_code TEXT NOT NULL DEFAULT '91',
  enabled              BOOLEAN NOT NULL DEFAULT TRUE,
  last_used_at         TIMESTAMPTZ,
  created_by           UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at           TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at           TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS inbound_hooks_account_idx ON inbound_hooks (account_id);

CREATE TABLE IF NOT EXISTS inbound_hook_deliveries (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  hook_id     UUID NOT NULL REFERENCES inbound_hooks(id) ON DELETE CASCADE,
  account_id  UUID NOT NULL REFERENCES accounts(id) ON DELETE CASCADE,
  status      TEXT NOT NULL CHECK (status IN ('ok', 'skipped', 'failed')),
  contact_id  UUID REFERENCES contacts(id) ON DELETE SET NULL,
  phone       TEXT,
  detail      TEXT,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS inbound_hook_deliveries_hook_idx
  ON inbound_hook_deliveries (hook_id, created_at DESC);
CREATE INDEX IF NOT EXISTS inbound_hook_deliveries_account_idx
  ON inbound_hook_deliveries (account_id, created_at DESC);

CREATE TABLE IF NOT EXISTS alert_channels (
  id           UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  account_id   UUID NOT NULL REFERENCES accounts(id) ON DELETE CASCADE,
  kind         TEXT NOT NULL CHECK (kind IN ('slack', 'discord', 'telegram')),
  name         TEXT NOT NULL,
  -- Encrypted: Slack/Discord webhook URL, or the Telegram bot token.
  target_enc   TEXT NOT NULL,
  -- Telegram only: the chat id (or @channel) to post to. Not secret.
  chat_id      TEXT,
  -- Which events to send; see lib/alerts/core.ts.
  events       TEXT[] NOT NULL DEFAULT '{}',
  enabled      BOOLEAN NOT NULL DEFAULT TRUE,
  last_status  TEXT CHECK (last_status IN ('ok', 'failed')),
  last_error   TEXT,
  last_sent_at TIMESTAMPTZ,
  created_by   UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at   TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at   TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS alert_channels_account_idx ON alert_channels (account_id);

ALTER TABLE inbound_hooks            ENABLE ROW LEVEL SECURITY;
ALTER TABLE inbound_hook_deliveries  ENABLE ROW LEVEL SECURITY;
ALTER TABLE alert_channels           ENABLE ROW LEVEL SECURITY;
-- No policies added — see note above.
