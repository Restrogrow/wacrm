-- ============================================================
-- 040_calendly_integration
--
-- Calendly → WhatsApp booking messages. A business pastes a Calendly
-- personal access token (Calendly → Integrations → API & Webhooks);
-- we create a webhook subscription for invitee.created /
-- invitee.canceled / invitee_no_show.created pointing at
-- /api/integrations/calendly/webhooks/<ingest_token>, signed with a
-- signing key we generate (Calendly-Webhook-Signature, HMAC-SHA256).
--
-- Each event (booking confirmed, rescheduled, cancelled, no-show, and
-- the 24 h / 1 h reminders the every-minute cron sends) maps to an
-- approved WhatsApp template via calendly_event_rules. Bookings are
-- kept so reminders can be scheduled and cancellations matched.
--
-- Webhooks require a paid Calendly plan.
--
-- RLS: enabled with NO policies on every table — they hold the access
-- token and signing key, so all access goes through the service role
-- in /api/integrations/calendly/* after a role check.
-- ============================================================

CREATE TABLE IF NOT EXISTS calendly_connections (
  id                        uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  account_id                uuid NOT NULL REFERENCES accounts(id) ON DELETE CASCADE,
  calendly_user_uri         text NOT NULL,
  organization_uri          text NOT NULL,
  user_name                 text,
  user_email                text,
  scheduling_url            text,
  -- Random, unguessable; identifies the connection in the webhook URL.
  ingest_token              text NOT NULL UNIQUE,
  -- Encrypted (lib/whatsapp/encryption).
  access_token              text NOT NULL,
  signing_key               text NOT NULL,
  webhook_subscription_uri  text,
  -- Calling code for numbers saved without one (e.g. 98765 43210).
  default_country_code      text NOT NULL DEFAULT '91',
  -- Optional exact booking question whose answer is the phone number;
  -- otherwise SMS-reminder number, then any question mentioning phone.
  phone_question            text,
  last_event_at             timestamptz,
  connected_by              uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at                timestamptz NOT NULL DEFAULT now(),
  updated_at                timestamptz NOT NULL DEFAULT now()
);

CREATE UNIQUE INDEX IF NOT EXISTS calendly_connections_account_key
  ON calendly_connections (account_id);

CREATE TABLE IF NOT EXISTS calendly_event_rules (
  account_id         uuid NOT NULL REFERENCES accounts(id) ON DELETE CASCADE,
  event              text NOT NULL,          -- see lib/calendly/events.ts
  enabled            boolean NOT NULL DEFAULT false,
  template_name      text,
  template_language  text,
  -- Calendly variable key for each body {{n}}, in order.
  body_variables     jsonb NOT NULL DEFAULT '[]'::jsonb,
  updated_at         timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (account_id, event)
);

CREATE TABLE IF NOT EXISTS calendly_bookings (
  id                    uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  account_id            uuid NOT NULL REFERENCES accounts(id) ON DELETE CASCADE,
  connection_id         uuid NOT NULL REFERENCES calendly_connections(id) ON DELETE CASCADE,
  invitee_uri           text NOT NULL,
  event_uri             text,
  event_name            text,
  host_name             text,
  start_time            timestamptz NOT NULL,
  end_time              timestamptz,
  timezone              text,
  invitee_name          text,
  invitee_email         text,
  phone                 text,             -- as Calendly gave it
  join_url              text,
  location              text,
  cancel_url            text,
  reschedule_url        text,
  status                text NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'canceled')),
  booked_at             timestamptz NOT NULL DEFAULT now(),
  reminder_24h_sent_at  timestamptz,
  reminder_1h_sent_at   timestamptz,
  created_at            timestamptz NOT NULL DEFAULT now(),
  updated_at            timestamptz NOT NULL DEFAULT now(),
  UNIQUE (connection_id, invitee_uri)
);

-- The reminder cron scans upcoming active bookings.
CREATE INDEX IF NOT EXISTS calendly_bookings_upcoming_idx
  ON calendly_bookings (start_time)
  WHERE status = 'active';

-- Webhook deliveries (dedupe) and message attempts, for the Settings
-- activity list and debugging.
CREATE TABLE IF NOT EXISTS calendly_events (
  id                   uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  account_id           uuid NOT NULL REFERENCES accounts(id) ON DELETE CASCADE,
  connection_id        uuid NOT NULL REFERENCES calendly_connections(id) ON DELETE CASCADE,
  delivery_id          text NOT NULL,
  topic                text NOT NULL,
  event                text,
  invitee_name         text,
  phone                text,
  status               text NOT NULL CHECK (status IN ('received', 'sent', 'skipped', 'failed')),
  detail               text,
  whatsapp_message_id  text,
  created_at           timestamptz NOT NULL DEFAULT now(),
  UNIQUE (connection_id, delivery_id)
);

CREATE INDEX IF NOT EXISTS calendly_events_account_created_idx
  ON calendly_events (account_id, created_at DESC);

ALTER TABLE calendly_connections  ENABLE ROW LEVEL SECURITY;
ALTER TABLE calendly_event_rules  ENABLE ROW LEVEL SECURITY;
ALTER TABLE calendly_bookings     ENABLE ROW LEVEL SECURITY;
ALTER TABLE calendly_events       ENABLE ROW LEVEL SECURITY;
