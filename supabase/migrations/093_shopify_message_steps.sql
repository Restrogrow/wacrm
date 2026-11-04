-- ============================================================
-- 093_shopify_message_steps.sql — multi-step Shopify automations
--
-- Turns "one template per event" into "a sequence per event", adds a
-- delay to every event (not just abandoned cart), and moves sending
-- off the webhook's back onto a scheduled queue.
--
-- Three parts:
--
--   1. shopify_event_rules gains `step_order`, widening its primary key
--      from (account_id, event) to (account_id, event, step_order).
--      Existing rows keep step_order = 0 and become step 1 of their
--      event, so nothing needs backfilling and every current automation
--      behaves exactly as before.
--
--   2. shopify_scheduled_messages — the queue. One row per pending
--      step per order/checkout, with a send_at and a status. The
--      every-minute cron claims and sends what's due. `dedupe_key` is
--      the no-double-send guarantee (see below).
--
--   3. shopify_checkouts.reminded_at is left in place but is no longer
--      the abandoned-cart claim — the queue's dedupe_key is. Kept so a
--      rollback to the pre-093 code still works, and because it records
--      when the first reminder went out.
--
-- Two new events ride along in lib/shopify/events.ts (feedback_request,
-- reorder_reminder, both "X days after Delivered"). They need no schema
-- of their own — `event` is free text here, deliberately, so adding one
-- is a code change rather than a migration.
-- ============================================================

-- ------------------------------------------------------------
-- 1. Steps per event
-- ------------------------------------------------------------

ALTER TABLE shopify_event_rules
  ADD COLUMN IF NOT EXISTS step_order integer NOT NULL DEFAULT 0;

-- Repoint the primary key at (account_id, event, step_order). Dropping
-- by the conventional name rather than a catalogue lookup: this table
-- was created in 039 with an inline PRIMARY KEY, so Postgres named it
-- predictably.
ALTER TABLE shopify_event_rules
  DROP CONSTRAINT IF EXISTS shopify_event_rules_pkey;
ALTER TABLE shopify_event_rules
  ADD PRIMARY KEY (account_id, event, step_order);

-- `delay_minutes` is the single source of truth for when a step fires,
-- measured from the event (not from the previous step) so re-ordering
-- or deleting a step can't shift the others. 039 constrained it to
-- 15..10080 because only abandoned cart used it; now every event has a
-- delay and 0 means "send immediately", so widen to 0..129600 (90 days)
-- to cover "reorder reminder 60 days after delivery".
ALTER TABLE shopify_event_rules
  DROP CONSTRAINT IF EXISTS shopify_event_rules_delay_minutes_check;
ALTER TABLE shopify_event_rules
  ADD CONSTRAINT shopify_event_rules_delay_minutes_check
  CHECK (delay_minutes BETWEEN 0 AND 129600);

-- Display only. The merchant typed "7 hours"; storing that lets the UI
-- show "7 hours" back instead of "420 minutes". Never used for maths —
-- delay_minutes is.
ALTER TABLE shopify_event_rules
  ADD COLUMN IF NOT EXISTS delay_unit text NOT NULL DEFAULT 'minutes'
  CHECK (delay_unit IN ('minutes', 'hours', 'days'));

-- Which Shopify variable fills a URL button's {{1}}, e.g. a template
-- whose button is https://momperfume.in/{{1}} mapped to checkout_url.
-- Null = the template has no dynamic URL button. The value is a
-- ShopifyVariable key (lib/shopify/events.ts); only the URL-shaped ones
-- make sense and the API validates that.
ALTER TABLE shopify_event_rules
  ADD COLUMN IF NOT EXISTS url_button_variable text;

-- ------------------------------------------------------------
-- 2. The queue
-- ------------------------------------------------------------

CREATE TABLE IF NOT EXISTS shopify_scheduled_messages (
  id                  uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  account_id          uuid NOT NULL REFERENCES accounts(id) ON DELETE CASCADE,
  store_id            uuid NOT NULL REFERENCES shopify_stores(id) ON DELETE CASCADE,

  event               text NOT NULL,
  step_order          integer NOT NULL,

  -- What this step is about. Exactly one is set in practice: a cart
  -- step has the checkout_token, an order step has the order id.
  -- Abandoned-cart cancellation matches on checkout_token OR phone, so
  -- both are indexed.
  checkout_token      text,
  shopify_order_id    text,

  phone               text,
  customer_name       text,

  -- Frozen at schedule time. The webhook payload is gone by the time
  -- the cron runs, and re-deriving it from the stored order would give
  -- a *different* message than the merchant previewed — e.g. tracking
  -- that has since changed. Resolved body params, not raw context, so
  -- a template edit mid-sequence can't shift variables under us.
  body_params         jsonb NOT NULL DEFAULT '[]'::jsonb,

  -- The suffix to send for a dynamic URL button, and which button in
  -- the template's `buttons` array it belongs to. Meta keys button
  -- components by that index, so it has to be frozen alongside the
  -- value: looking the button up again at send time could land on a
  -- different one if the template was edited mid-sequence.
  url_button_param    text,
  url_button_index    integer,

  template_name       text NOT NULL,
  template_language   text NOT NULL DEFAULT 'en_US',

  send_at             timestamptz NOT NULL,
  status              text NOT NULL DEFAULT 'pending'
                      CHECK (status IN ('pending', 'sending', 'sent', 'failed', 'cancelled', 'skipped')),

  -- The no-double-send guarantee. Unique, and derived from
  -- (event, step, entity) rather than a random id, so a webhook retry
  -- that re-schedules the same sequence collides instead of queueing a
  -- second copy. Claiming for send is a conditional UPDATE from
  -- 'pending' to 'sending', so two overlapping cron runs can't both win.
  dedupe_key          text NOT NULL UNIQUE,

  attempts            integer NOT NULL DEFAULT 0,
  claimed_at          timestamptz,
  sent_at             timestamptz,
  whatsapp_message_id text,
  detail              text,

  created_at          timestamptz NOT NULL DEFAULT now(),
  updated_at          timestamptz NOT NULL DEFAULT now()
);

-- The cron's only query: what is due and still pending?
CREATE INDEX IF NOT EXISTS shopify_scheduled_due_idx
  ON shopify_scheduled_messages (send_at)
  WHERE status = 'pending';

-- Cancellation when an order arrives: "every pending step for this
-- checkout", and the phone fallback for carts that had no token.
CREATE INDEX IF NOT EXISTS shopify_scheduled_checkout_idx
  ON shopify_scheduled_messages (store_id, checkout_token)
  WHERE status = 'pending';

CREATE INDEX IF NOT EXISTS shopify_scheduled_phone_idx
  ON shopify_scheduled_messages (account_id, phone)
  WHERE status = 'pending';

-- Per-step analytics in Settings reads this by (event, step).
CREATE INDEX IF NOT EXISTS shopify_scheduled_stats_idx
  ON shopify_scheduled_messages (account_id, event, step_order, status);

-- Links a sent step to its WhatsApp message so delivered/read/clicked
-- can be joined from `messages` for the per-step stats.
CREATE INDEX IF NOT EXISTS shopify_scheduled_wamid_idx
  ON shopify_scheduled_messages (whatsapp_message_id)
  WHERE whatsapp_message_id IS NOT NULL;

ALTER TABLE shopify_scheduled_messages ENABLE ROW LEVEL SECURITY;
-- No policies: the queue is written by webhook handlers and read by the
-- cron, both service-role. The UI reads aggregates through an API route
-- that scopes by the caller's account. Same posture as shopify_events.

-- ------------------------------------------------------------
-- 3. Attributing recovered revenue to a step
-- ------------------------------------------------------------

-- "Orders recovered" per step = orders whose checkout had a step sent
-- before the order arrived. Recording which scheduled message was the
-- last one sent to that checkout makes it a single join instead of a
-- time-window guess.
ALTER TABLE shopify_orders
  ADD COLUMN IF NOT EXISTS recovered_from_scheduled_id uuid
  REFERENCES shopify_scheduled_messages(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS shopify_orders_recovered_idx
  ON shopify_orders (recovered_from_scheduled_id)
  WHERE recovered_from_scheduled_id IS NOT NULL;
