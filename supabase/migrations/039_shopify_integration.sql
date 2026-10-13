-- ============================================================
-- 039_shopify_integration
--
-- Shopify → WhatsApp order notifications. A store connects to an
-- account in one of two ways:
--
--   oauth   — "Connect Shopify": OAuth through Repeat Grow's Shopify
--             app; we register the webhooks via the Admin API and
--             verify deliveries with the app's client secret.
--   webhook — the merchant creates webhooks by hand in Shopify admin
--             (Settings → Notifications → Webhooks) pointing at
--             /api/integrations/shopify/webhooks/<ingest_token>, and
--             pastes the signing key Shopify shows there.
--
-- Each event (order placed, shipped, delivered, cancelled, abandoned
-- checkout, …) maps to an approved WhatsApp template via
-- shopify_event_rules. Orders and checkouts are kept minimally so later
-- events (fulfillment updates carry no phone number) and the
-- abandoned-cart cron can find the customer.
--
-- RLS: enabled with NO policies on every table — they hold OAuth tokens
-- and signing secrets, so all access goes through the service role in
-- /api/integrations/shopify/* after a role check.
-- ============================================================

CREATE TABLE IF NOT EXISTS shopify_stores (
  id                       uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  account_id               uuid NOT NULL REFERENCES accounts(id) ON DELETE CASCADE,
  shop_domain              text NOT NULL,              -- example.myshopify.com
  shop_name                text,
  connection_type          text NOT NULL CHECK (connection_type IN ('oauth', 'webhook')),
  -- Random, unguessable; identifies the store in the manual webhook URL.
  ingest_token             text NOT NULL UNIQUE,
  -- Encrypted (lib/whatsapp/encryption). webhook_secret: manual mode's
  -- signing key. access/refresh token: OAuth mode (expiring tokens).
  webhook_secret           text,
  access_token             text,
  refresh_token            text,
  access_token_expires_at  timestamptz,
  scopes                   text,
  -- Calling code for numbers saved without one (e.g. 98765 43210).
  default_country_code     text NOT NULL DEFAULT '91',
  status                   text NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'disconnected')),
  last_event_at            timestamptz,
  connected_by             uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at               timestamptz NOT NULL DEFAULT now(),
  updated_at               timestamptz NOT NULL DEFAULT now()
);

-- One store per account (v1).
CREATE UNIQUE INDEX IF NOT EXISTS shopify_stores_account_key
  ON shopify_stores (account_id);
-- OAuth webhooks are routed by the X-Shopify-Shop-Domain header, so an
-- active OAuth shop must map to exactly one account.
CREATE UNIQUE INDEX IF NOT EXISTS shopify_stores_active_oauth_shop_key
  ON shopify_stores (shop_domain)
  WHERE connection_type = 'oauth' AND status = 'active';

CREATE TABLE IF NOT EXISTS shopify_event_rules (
  account_id         uuid NOT NULL REFERENCES accounts(id) ON DELETE CASCADE,
  event              text NOT NULL,          -- see lib/shopify/events.ts
  enabled            boolean NOT NULL DEFAULT false,
  template_name      text,
  template_language  text,
  -- Shopify variable key for each body {{n}}, in order, e.g.
  -- ["customer_name", "order_number", "order_total"].
  body_variables     jsonb NOT NULL DEFAULT '[]'::jsonb,
  -- Abandoned checkout only: minutes of inactivity before reminding.
  delay_minutes      integer NOT NULL DEFAULT 60 CHECK (delay_minutes BETWEEN 15 AND 10080),
  updated_at         timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (account_id, event)
);

CREATE TABLE IF NOT EXISTS shopify_orders (
  id                 uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  account_id         uuid NOT NULL REFERENCES accounts(id) ON DELETE CASCADE,
  store_id           uuid NOT NULL REFERENCES shopify_stores(id) ON DELETE CASCADE,
  shopify_order_id   text NOT NULL,
  order_name         text,                   -- "#1001"
  phone              text,
  customer_name      text,
  email              text,
  total              text,
  currency           text,
  payment_method     text,
  order_status_url   text,
  checkout_token     text,
  tracking_number    text,
  tracking_url       text,
  tracking_company   text,
  contact_id         uuid REFERENCES contacts(id) ON DELETE SET NULL,
  created_at         timestamptz NOT NULL DEFAULT now(),
  updated_at         timestamptz NOT NULL DEFAULT now(),
  UNIQUE (store_id, shopify_order_id)
);

CREATE TABLE IF NOT EXISTS shopify_checkouts (
  id                 uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  account_id         uuid NOT NULL REFERENCES accounts(id) ON DELETE CASCADE,
  store_id           uuid NOT NULL REFERENCES shopify_stores(id) ON DELETE CASCADE,
  checkout_token     text NOT NULL,
  phone              text,
  customer_name      text,
  email              text,
  total              text,
  currency           text,
  items              text,
  recovery_url       text,
  -- Last time Shopify reported activity on the checkout.
  last_activity_at   timestamptz NOT NULL DEFAULT now(),
  completed_at       timestamptz,
  reminded_at        timestamptz,
  created_at         timestamptz NOT NULL DEFAULT now(),
  UNIQUE (store_id, checkout_token)
);

-- The abandoned-cart cron scans for due, un-reminded, open checkouts.
CREATE INDEX IF NOT EXISTS shopify_checkouts_due_idx
  ON shopify_checkouts (last_activity_at)
  WHERE completed_at IS NULL AND reminded_at IS NULL;

-- Every webhook received (dedupe by Shopify's webhook id) and every
-- message attempt, for the Settings activity list and debugging.
CREATE TABLE IF NOT EXISTS shopify_events (
  id                   uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  account_id           uuid NOT NULL REFERENCES accounts(id) ON DELETE CASCADE,
  store_id             uuid NOT NULL REFERENCES shopify_stores(id) ON DELETE CASCADE,
  -- X-Shopify-Webhook-Id, or "checkout-reminder:<token>" for cron sends.
  delivery_id          text NOT NULL,
  topic                text NOT NULL,
  event                text,
  order_name           text,
  phone                text,
  status               text NOT NULL CHECK (status IN ('received', 'sent', 'skipped', 'failed')),
  detail               text,
  whatsapp_message_id  text,
  created_at           timestamptz NOT NULL DEFAULT now(),
  UNIQUE (store_id, delivery_id)
);

CREATE INDEX IF NOT EXISTS shopify_events_account_created_idx
  ON shopify_events (account_id, created_at DESC);

ALTER TABLE shopify_stores       ENABLE ROW LEVEL SECURITY;
ALTER TABLE shopify_event_rules  ENABLE ROW LEVEL SECURITY;
ALTER TABLE shopify_orders       ENABLE ROW LEVEL SECURITY;
ALTER TABLE shopify_checkouts    ENABLE ROW LEVEL SECURITY;
ALTER TABLE shopify_events       ENABLE ROW LEVEL SECURITY;
