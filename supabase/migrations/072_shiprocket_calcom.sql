-- ============================================================
-- 072_shiprocket_calcom.sql — Shiprocket shipment updates + Cal.com bookings
--
-- Both integrations work by webhook, like WooCommerce (063): Repeat Grow
-- generates an unguessable delivery URL and a secret; the merchant pastes
-- them into Shiprocket / Cal.com. The secrets are stored ENCRYPTED.
--
-- RLS is enabled with NO policies on every table (they hold secrets or
-- customer phone numbers): all access goes through the service role in
-- /api/integrations/{shipping-updates,calcom}/* after a role check.
-- ============================================================

-- ---------- Shiprocket ----------------------------------------

CREATE TABLE IF NOT EXISTS shiprocket_connections (
  id                    uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  account_id            uuid NOT NULL REFERENCES accounts(id) ON DELETE CASCADE,
  -- Random lowercase hex (no "sr"/"kr": Shiprocket rejects webhook URLs
  -- containing those letters). Identifies the account in the URL.
  ingest_token          text NOT NULL UNIQUE,
  -- Encrypted. Sent by Shiprocket in the x-api-key header.
  webhook_token         text NOT NULL,
  -- Calling code for numbers saved without one.
  default_country_code  text NOT NULL DEFAULT '91',
  status                text NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'disconnected')),
  last_event_at         timestamptz,
  connected_by          uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at            timestamptz NOT NULL DEFAULT now(),
  updated_at            timestamptz NOT NULL DEFAULT now()
);

CREATE UNIQUE INDEX IF NOT EXISTS shiprocket_connections_account_key
  ON shiprocket_connections (account_id);

CREATE TABLE IF NOT EXISTS shiprocket_event_rules (
  account_id         uuid NOT NULL REFERENCES accounts(id) ON DELETE CASCADE,
  event              text NOT NULL,
  enabled            boolean NOT NULL DEFAULT false,
  template_name      text,
  template_language  text,
  body_variables     jsonb NOT NULL DEFAULT '[]'::jsonb,
  updated_at         timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (account_id, event)
);

CREATE TABLE IF NOT EXISTS shiprocket_shipments (
  id                 uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  account_id         uuid NOT NULL REFERENCES accounts(id) ON DELETE CASCADE,
  connection_id      uuid NOT NULL REFERENCES shiprocket_connections(id) ON DELETE CASCADE,
  awb                text NOT NULL,
  order_ref          text,                    -- the merchant's order id
  courier            text,
  status             text,                    -- as Shiprocket named it
  status_id          integer,
  etd                text,
  tracking_url       text,
  phone              text,
  customer_name      text,
  contact_id         uuid REFERENCES contacts(id) ON DELETE SET NULL,
  last_status_at     timestamptz,
  created_at         timestamptz NOT NULL DEFAULT now(),
  updated_at         timestamptz NOT NULL DEFAULT now(),
  UNIQUE (connection_id, awb)
);

-- Every webhook delivery (deduped by a hash of awb + status + time, which
-- also protects against replays) and every message attempt.
CREATE TABLE IF NOT EXISTS shiprocket_events (
  id                   uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  account_id           uuid NOT NULL REFERENCES accounts(id) ON DELETE CASCADE,
  connection_id        uuid NOT NULL REFERENCES shiprocket_connections(id) ON DELETE CASCADE,
  delivery_id          text NOT NULL,
  topic                text NOT NULL,
  event                text,
  order_number         text,
  phone                text,
  status               text NOT NULL CHECK (status IN ('received', 'sent', 'skipped', 'failed')),
  detail               text,
  whatsapp_message_id  text,
  created_at           timestamptz NOT NULL DEFAULT now(),
  UNIQUE (connection_id, delivery_id)
);

CREATE INDEX IF NOT EXISTS shiprocket_events_account_created_idx
  ON shiprocket_events (account_id, created_at DESC);

ALTER TABLE shiprocket_connections ENABLE ROW LEVEL SECURITY;
ALTER TABLE shiprocket_event_rules ENABLE ROW LEVEL SECURITY;
ALTER TABLE shiprocket_shipments   ENABLE ROW LEVEL SECURITY;
ALTER TABLE shiprocket_events      ENABLE ROW LEVEL SECURITY;

-- ---------- Cal.com -------------------------------------------

CREATE TABLE IF NOT EXISTS calcom_connections (
  id                    uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  account_id            uuid NOT NULL REFERENCES accounts(id) ON DELETE CASCADE,
  ingest_token          text NOT NULL UNIQUE,
  -- Encrypted. Cal.com signs each delivery with it (X-Cal-Signature-256).
  webhook_secret        text NOT NULL,
  default_country_code  text NOT NULL DEFAULT '91',
  -- Name of the booking question that holds the phone number (optional;
  -- we also try the standard phone fields).
  phone_field           text,
  -- Cal.com host used for reschedule/cancel links and "book again".
  booking_page          text NOT NULL DEFAULT 'https://cal.com',
  status                text NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'disconnected')),
  last_event_at         timestamptz,
  connected_by          uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at            timestamptz NOT NULL DEFAULT now(),
  updated_at            timestamptz NOT NULL DEFAULT now()
);

CREATE UNIQUE INDEX IF NOT EXISTS calcom_connections_account_key
  ON calcom_connections (account_id);

CREATE TABLE IF NOT EXISTS calcom_event_rules (
  account_id         uuid NOT NULL REFERENCES accounts(id) ON DELETE CASCADE,
  event              text NOT NULL,
  enabled            boolean NOT NULL DEFAULT false,
  template_name      text,
  template_language  text,
  body_variables     jsonb NOT NULL DEFAULT '[]'::jsonb,
  updated_at         timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (account_id, event)
);

CREATE TABLE IF NOT EXISTS calcom_bookings (
  id                    uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  account_id            uuid NOT NULL REFERENCES accounts(id) ON DELETE CASCADE,
  connection_id         uuid NOT NULL REFERENCES calcom_connections(id) ON DELETE CASCADE,
  booking_uid           text NOT NULL,
  event_name            text,
  host_name             text,
  start_time            timestamptz NOT NULL,
  end_time              timestamptz,
  timezone              text,
  attendee_name         text,
  attendee_email        text,
  phone                 text,             -- as Cal.com gave it
  join_url              text,
  location              text,
  status                text NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'canceled')),
  booked_at             timestamptz NOT NULL DEFAULT now(),
  reminder_24h_sent_at  timestamptz,
  reminder_1h_sent_at   timestamptz,
  created_at            timestamptz NOT NULL DEFAULT now(),
  updated_at            timestamptz NOT NULL DEFAULT now(),
  UNIQUE (connection_id, booking_uid)
);

-- The reminder cron scans upcoming active bookings.
CREATE INDEX IF NOT EXISTS calcom_bookings_upcoming_idx
  ON calcom_bookings (start_time)
  WHERE status = 'active';

CREATE TABLE IF NOT EXISTS calcom_events (
  id                   uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  account_id           uuid NOT NULL REFERENCES accounts(id) ON DELETE CASCADE,
  connection_id        uuid NOT NULL REFERENCES calcom_connections(id) ON DELETE CASCADE,
  delivery_id          text NOT NULL,
  topic                text NOT NULL,
  event                text,
  attendee_name        text,
  phone                text,
  status               text NOT NULL CHECK (status IN ('received', 'sent', 'skipped', 'failed')),
  detail               text,
  whatsapp_message_id  text,
  created_at           timestamptz NOT NULL DEFAULT now(),
  UNIQUE (connection_id, delivery_id)
);

CREATE INDEX IF NOT EXISTS calcom_events_account_created_idx
  ON calcom_events (account_id, created_at DESC);

ALTER TABLE calcom_connections ENABLE ROW LEVEL SECURITY;
ALTER TABLE calcom_event_rules ENABLE ROW LEVEL SECURITY;
ALTER TABLE calcom_bookings    ENABLE ROW LEVEL SECURITY;
ALTER TABLE calcom_events      ENABLE ROW LEVEL SECURITY;

-- ---------- Let both show up on /admin/system ------------------
-- Widen the allowed webhook sources. Keep every existing value.
ALTER TABLE webhook_failures DROP CONSTRAINT IF EXISTS webhook_failures_source_check;
ALTER TABLE webhook_failures
  ADD CONSTRAINT webhook_failures_source_check
  CHECK (source IN ('whatsapp', 'shopify', 'calendly', 'woocommerce', 'shiprocket', 'calcom'));
