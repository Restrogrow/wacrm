-- ============================================================
-- 064_razorpay_payment_links.sql — Razorpay payment links in chat
--
-- razorpay_credentials (one row per account):
--   The merchant's Razorpay API key id + key secret and the webhook
--   secret this app generated for them. The secret and the webhook
--   secret are stored ENCRYPTED (AES-256-GCM, same helper as the
--   WhatsApp token). RLS is enabled with ZERO policies on purpose, like
--   `platform_admins`: only server code using the service-role client
--   reads or writes it, so no signed-in user (not even an admin) can
--   read it through the REST API.
--
-- payment_links:
--   Every payment link an agent sent from a chat: amount in paise, the
--   Razorpay link id + short URL, status and the optional order it pays
--   for. Members can read their account's rows (RLS); writes go through
--   the API routes / webhook with the service-role client.
-- ============================================================

CREATE TABLE IF NOT EXISTS razorpay_credentials (
  account_id          UUID PRIMARY KEY REFERENCES accounts(id) ON DELETE CASCADE,
  key_id              TEXT NOT NULL,
  key_secret_enc      TEXT NOT NULL,
  webhook_secret_enc  TEXT NOT NULL,
  connected_by        UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at          TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at          TIMESTAMPTZ NOT NULL DEFAULT now()
);

ALTER TABLE razorpay_credentials ENABLE ROW LEVEL SECURITY;
-- No policies added — see note above.

CREATE TABLE IF NOT EXISTS payment_links (
  id                   UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  account_id           UUID NOT NULL REFERENCES accounts(id) ON DELETE CASCADE,
  conversation_id      UUID REFERENCES conversations(id) ON DELETE SET NULL,
  contact_id           UUID REFERENCES contacts(id) ON DELETE SET NULL,
  order_id             UUID REFERENCES whatsapp_orders(id) ON DELETE SET NULL,
  amount               INTEGER NOT NULL CHECK (amount >= 100),   -- paise
  currency             TEXT NOT NULL DEFAULT 'INR',
  description          TEXT NOT NULL DEFAULT '',
  razorpay_link_id     TEXT,
  short_url            TEXT,
  status               TEXT NOT NULL DEFAULT 'created'
                       CHECK (status IN ('created', 'paid', 'failed', 'expired', 'cancelled')),
  razorpay_payment_id  TEXT,
  payment_method       TEXT,
  paid_at              TIMESTAMPTZ,
  created_by           UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at           TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at           TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS payment_links_account_created_idx ON payment_links (account_id, created_at DESC);
CREATE INDEX IF NOT EXISTS payment_links_conversation_idx ON payment_links (conversation_id, created_at DESC);
CREATE INDEX IF NOT EXISTS payment_links_order_idx ON payment_links (order_id);
CREATE UNIQUE INDEX IF NOT EXISTS payment_links_razorpay_link_idx ON payment_links (razorpay_link_id) WHERE razorpay_link_id IS NOT NULL;

ALTER TABLE payment_links ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Members can view payment links" ON payment_links;
CREATE POLICY "Members can view payment links" ON payment_links
  FOR SELECT USING (is_account_member(account_id, 'viewer'));
