-- ============================================================
-- Google Sheets integration: one connection per account.
-- Tokens are AES-GCM encrypted (same helper as whatsapp_config).
-- RLS is on with no client policies - only the service role reads it.
-- ============================================================

CREATE TABLE IF NOT EXISTS google_sheets_connections (
  account_id          UUID PRIMARY KEY REFERENCES accounts(id) ON DELETE CASCADE,
  google_email        TEXT,
  access_token        TEXT NOT NULL,
  refresh_token       TEXT NOT NULL,
  token_expires_at    TIMESTAMPTZ NOT NULL,
  spreadsheet_id      TEXT,
  spreadsheet_url     TEXT,
  spreadsheet_title   TEXT,
  sync_contacts       BOOLEAN NOT NULL DEFAULT TRUE,
  sync_messages       BOOLEAN NOT NULL DEFAULT FALSE,
  status              TEXT NOT NULL DEFAULT 'active',
  last_sync_at        TIMESTAMPTZ,
  last_error          TEXT,
  rows_synced         INTEGER NOT NULL DEFAULT 0,
  connected_by        UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at          TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at          TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

ALTER TABLE google_sheets_connections ENABLE ROW LEVEL SECURITY;
