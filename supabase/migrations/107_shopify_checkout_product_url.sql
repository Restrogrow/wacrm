-- ============================================================
-- 107_shopify_checkout_product_url.sql
--
-- "Product link" (lib/shopify/events.ts: product_url) for the
-- abandoned-cart sequence. Every other event resolves it inline, from
-- the live webhook payload's line_items, at enqueue time. Abandoned
-- carts can't: onCheckout() stores the checkout, then the cron
-- (processDueCheckouts) enqueues the sequence minutes to hours later,
-- by which point the raw webhook payload — and its line_items — is
-- long gone, same reason `items` below is a pre-formatted string
-- rather than the raw array.
--
-- So it has to be resolved once, at onCheckout() time, and carried on
-- the row for the cron to read back.
-- ============================================================

ALTER TABLE shopify_checkouts
  ADD COLUMN IF NOT EXISTS product_url text;
