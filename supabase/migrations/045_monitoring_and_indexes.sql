-- ============================================================
-- 045: Monitoring tables + performance indexes
--
-- 1. system_heartbeats — one row per background job (the two cron
--    endpoints and each task inside them). /api/health and the
--    /admin/system page read it to spot a job that stopped running
--    or keeps failing.
-- 2. webhook_failures — inbound webhooks (WhatsApp, Shopify,
--    Calendly) that threw while being processed. Shown on
--    /admin/system. Rows older than 30 days are pruned by the app
--    when new failures are written (no extra cron).
-- 3. Indexes for the paginated inbox, message threads, contacts and
--    broadcasts lists, and trigram indexes for contact search.
--
-- Both tables are service-role only: RLS is on with no policies, so
-- signed-in users can't read them through PostgREST.
-- ============================================================

CREATE TABLE IF NOT EXISTS system_heartbeats (
  job              TEXT PRIMARY KEY,
  last_started_at  TIMESTAMPTZ,
  last_finished_at TIMESTAMPTZ,
  last_ok_at       TIMESTAMPTZ,
  last_error       TEXT,
  last_error_at    TIMESTAMPTZ,
  last_duration_ms INTEGER,
  last_result      JSONB,
  updated_at       TIMESTAMPTZ NOT NULL DEFAULT now()
);

ALTER TABLE system_heartbeats ENABLE ROW LEVEL SECURITY;

CREATE TABLE IF NOT EXISTS webhook_failures (
  id         UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  source     TEXT NOT NULL CHECK (source IN ('whatsapp', 'shopify', 'calendly')),
  account_id UUID REFERENCES accounts(id) ON DELETE CASCADE,
  error      TEXT NOT NULL,
  context    JSONB,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

ALTER TABLE webhook_failures ENABLE ROW LEVEL SECURITY;

CREATE INDEX IF NOT EXISTS webhook_failures_created_idx
  ON webhook_failures (created_at DESC);
CREATE INDEX IF NOT EXISTS webhook_failures_source_created_idx
  ON webhook_failures (source, created_at DESC);

-- ---------- Performance indexes ----------

-- Message thread: latest page + "load earlier" by created_at.
CREATE INDEX IF NOT EXISTS idx_messages_conversation_created
  ON messages (conversation_id, created_at DESC);

-- Inbox list: newest activity first, paged.
CREATE INDEX IF NOT EXISTS idx_conversations_account_last_message
  ON conversations (account_id, last_message_at DESC NULLS LAST, id DESC);

-- Contacts list (newest first) and broadcasts list.
CREATE INDEX IF NOT EXISTS idx_contacts_account_created
  ON contacts (account_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_broadcasts_account_created
  ON broadcasts (account_id, created_at DESC);

-- Contact search uses ILIKE '%term%' on name / phone / email, which a
-- plain btree can't serve. Trigram GIN indexes make it fast on large
-- contact lists.
CREATE EXTENSION IF NOT EXISTS pg_trgm WITH SCHEMA extensions;

CREATE INDEX IF NOT EXISTS idx_contacts_name_trgm
  ON contacts USING gin (name extensions.gin_trgm_ops);
CREATE INDEX IF NOT EXISTS idx_contacts_phone_trgm
  ON contacts USING gin (phone extensions.gin_trgm_ops);
CREATE INDEX IF NOT EXISTS idx_contacts_email_trgm
  ON contacts USING gin (email extensions.gin_trgm_ops);
