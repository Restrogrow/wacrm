-- ============================================================
-- 105_shopify_balance_payment_link.sql — COD balance Razorpay links
--
-- Lets a Shopify automatic message's URL button be mapped to
-- "balance_payment_url": at send time (not enqueue time, unlike every
-- other dynamic URL variable — see lib/shopify/schedule.ts) a Razorpay
-- payment link is created for the order's outstanding balance, and its
-- short URL fills the button.
--
-- 1. shopify_scheduled_messages.url_button_variable — which
--    ShopifyVariable key a step's URL button is mapped to. Already had
--    the frozen *value* (url_button_param) for every other variable;
--    this one is new because "balance_payment_url" has no value yet at
--    enqueue time and must be resolved live by the cron.
--
-- 2. payment_links gets shopify_store_id / shopify_order_id so a link
--    created for a Shopify order can be told apart from the existing
--    in-chat ones, and so the Razorpay webhook knows which Shopify
--    order to mark paid + tag once the customer pays. Both nullable —
--    existing whatsapp_orders-only rows are untouched.
-- ============================================================

ALTER TABLE shopify_scheduled_messages
  ADD COLUMN IF NOT EXISTS url_button_variable text;

ALTER TABLE payment_links
  ADD COLUMN IF NOT EXISTS shopify_store_id uuid REFERENCES shopify_stores(id) ON DELETE CASCADE,
  ADD COLUMN IF NOT EXISTS shopify_order_id text;

CREATE INDEX IF NOT EXISTS payment_links_shopify_order_idx
  ON payment_links (shopify_store_id, shopify_order_id)
  WHERE shopify_store_id IS NOT NULL;
