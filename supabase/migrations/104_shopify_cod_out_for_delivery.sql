-- ============================================================
-- 105_shopify_cod_out_for_delivery.sql
--
-- "COD out for delivery" is a new automatic-message slot (events.ts),
-- same mechanism as "COD order placed" / "Order placed": at
-- fulfillments/update → out_for_delivery, a COD or partially-paid order
-- uses this slot's template instead of the plain "Out for delivery"
-- one (falling back to it when this slot is off or has no template).
--
-- fulfillments/update payloads carry no order financials — only
-- shopify_orders (written at orders/create) is available by then — so
-- what's needed to decide COD-ness and to fill the new "Amount due on
-- delivery" variable has to be persisted there:
--
--   financial_status    'pending' / 'partially_paid' / … — the COD check
--   total_outstanding   what's still owed; the variable's primary source
--   total_received      fallback when Shopify's payload omits
--                        total_outstanding: total - total_received
--
-- Stored as text, matching `total` (Shopify sends these as decimal
-- strings in REST webhook JSON, same shape).
-- ============================================================

ALTER TABLE shopify_orders
  ADD COLUMN IF NOT EXISTS financial_status text,
  ADD COLUMN IF NOT EXISTS total_outstanding text,
  ADD COLUMN IF NOT EXISTS total_received text;
