-- ============================================================
-- 090: Shopify auto-sync every 30 minutes
--
-- The automations cron (lib/shopify/auto-sync.ts) pulls, per connected
-- store, at most every 30 minutes:
--   products   → products (catalog), same as Catalog → Sync from Shopify
--   customers  → contacts, tagged "Shopify" (needs read_customers)
--   orders     → shopify_orders rows for orders of the last 24 hours
--                whose webhook never arrived (records only, no messages)
--
--   last_synced_at          when the last run started (also the run lock)
--   last_sync_error         what failed in the last run, or NULL
--   last_sync_summary       counts per part, shown in Integrations → Shopify
--   customers_synced_until  newest customer updatedAt imported so far;
--                           the next run only asks for customers after it
--
-- Idempotent — safe to run multiple times.
-- ============================================================

ALTER TABLE shopify_stores
  ADD COLUMN IF NOT EXISTS last_synced_at         timestamptz,
  ADD COLUMN IF NOT EXISTS last_sync_error        text,
  ADD COLUMN IF NOT EXISTS last_sync_summary      jsonb,
  ADD COLUMN IF NOT EXISTS customers_synced_until timestamptz;

CREATE INDEX IF NOT EXISTS shopify_stores_due_sync_idx
  ON shopify_stores (last_synced_at NULLS FIRST)
  WHERE status = 'active';
