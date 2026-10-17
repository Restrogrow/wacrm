-- ============================================================
-- 063_woocommerce
--
-- WooCommerce → WhatsApp order notifications, mirroring Shopify
-- (039). A store connects by webhook: Repeat Grow generates a signing
-- secret and an unguessable delivery URL; the merchant pastes both
-- into WooCommerce → Settings → Advanced → Webhooks (topics
-- order.created and order.updated). Deliveries are verified with
-- X-WC-Webhook-Signature = base64(HMAC-SHA256(raw body, secret)).
--
-- Order status changes drive the messages (order placed, COD order,
-- completed, cancelled, refunded). WooCommerce has no native
-- abandoned-cart event, so none is offered.
--
-- RLS: enabled with NO policies on every table (they hold a signing
-- secret). All access goes through the service role in
-- /api/integrations/woocommerce/* after a role check.
-- ============================================================

CREATE TABLE IF NOT EXISTS woocommerce_stores (
  id                    uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  account_id            uuid NOT NULL REFERENCES accounts(id) ON DELETE CASCADE,
  store_url             text NOT NULL,              -- https://shop.example.com
  store_name            text,
  -- Random, unguessable; identifies the store in the webhook URL.
  ingest_token          text NOT NULL UNIQUE,
  -- Encrypted (lib/whatsapp/encryption). The webhook signing secret.
  webhook_secret        text NOT NULL,
  -- Calling code for numbers saved without one (e.g. 98765 43210).
  default_country_code  text NOT NULL DEFAULT '91',
  status                text NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'disconnected')),
  last_event_at         timestamptz,
  connected_by          uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at            timestamptz NOT NULL DEFAULT now(),
  updated_at            timestamptz NOT NULL DEFAULT now()
);

-- One store per account (v1).
CREATE UNIQUE INDEX IF NOT EXISTS woocommerce_stores_account_key
  ON woocommerce_stores (account_id);

CREATE TABLE IF NOT EXISTS woocommerce_event_rules (
  account_id         uuid NOT NULL REFERENCES accounts(id) ON DELETE CASCADE,
  event              text NOT NULL,          -- see lib/woocommerce/events.ts
  enabled            boolean NOT NULL DEFAULT false,
  template_name      text,
  template_language  text,
  -- Variable key for each body {{n}}, in order, e.g.
  -- ["customer_name", "order_number", "order_total"].
  body_variables     jsonb NOT NULL DEFAULT '[]'::jsonb,
  updated_at         timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (account_id, event)
);

CREATE TABLE IF NOT EXISTS woocommerce_orders (
  id                 uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  account_id         uuid NOT NULL REFERENCES accounts(id) ON DELETE CASCADE,
  store_id           uuid NOT NULL REFERENCES woocommerce_stores(id) ON DELETE CASCADE,
  woo_order_id       text NOT NULL,
  order_number       text,                   -- "#1001"
  status             text,                   -- processing, completed, ...
  phone              text,
  customer_name      text,
  email              text,
  total              text,
  currency           text,
  payment_method     text,
  order_url          text,
  tracking_number    text,
  tracking_url       text,
  tracking_company   text,
  contact_id         uuid REFERENCES contacts(id) ON DELETE SET NULL,
  created_at         timestamptz NOT NULL DEFAULT now(),
  updated_at         timestamptz NOT NULL DEFAULT now(),
  UNIQUE (store_id, woo_order_id)
);

-- Every webhook delivery (deduped by X-WC-Webhook-Delivery-ID, which
-- also protects against replays) and every message attempt, for the
-- Settings activity list and debugging.
CREATE TABLE IF NOT EXISTS woocommerce_events (
  id                   uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  account_id           uuid NOT NULL REFERENCES accounts(id) ON DELETE CASCADE,
  store_id             uuid NOT NULL REFERENCES woocommerce_stores(id) ON DELETE CASCADE,
  -- X-WC-Webhook-Delivery-ID, or "send:<event>:<order>" for message claims.
  delivery_id          text NOT NULL,
  topic                text NOT NULL,
  event                text,
  order_number         text,
  phone                text,
  status               text NOT NULL CHECK (status IN ('received', 'sent', 'skipped', 'failed')),
  detail               text,
  whatsapp_message_id  text,
  created_at           timestamptz NOT NULL DEFAULT now(),
  UNIQUE (store_id, delivery_id)
);

CREATE INDEX IF NOT EXISTS woocommerce_events_account_created_idx
  ON woocommerce_events (account_id, created_at DESC);

ALTER TABLE woocommerce_stores       ENABLE ROW LEVEL SECURITY;
ALTER TABLE woocommerce_event_rules  ENABLE ROW LEVEL SECURITY;
ALTER TABLE woocommerce_orders       ENABLE ROW LEVEL SECURITY;
ALTER TABLE woocommerce_events       ENABLE ROW LEVEL SECURITY;

-- Let webhook failures from WooCommerce show up on /admin/system.
ALTER TABLE webhook_failures DROP CONSTRAINT IF EXISTS webhook_failures_source_check;
ALTER TABLE webhook_failures
  ADD CONSTRAINT webhook_failures_source_check
  CHECK (source IN ('whatsapp', 'shopify', 'calendly', 'woocommerce'));
