-- ============================================================
-- 076_products_catalog.sql — product library for the WhatsApp catalog
--
-- `products` is the account's own product list. Agents manage it from
-- /catalog, can import/export CSV, and sync it to the Meta (WhatsApp)
-- catalog set in Settings > Orders & payments (commerce_settings.catalog_id).
-- Other features read it too (inbox product picker, store sync).
--
-- Access: members can read their account's rows (RLS). Every write goes
-- through the /api/catalog/* routes with the service role after a role
-- check, so no client write policies are defined.
-- ============================================================

CREATE TABLE IF NOT EXISTS products (
  id                    UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  account_id            UUID NOT NULL REFERENCES accounts(id) ON DELETE CASCADE,
  -- Meta "content id" / SKU. Unique per account.
  retailer_id           TEXT NOT NULL,
  title                 TEXT NOT NULL,
  description           TEXT NOT NULL DEFAULT '',
  price_paise           INTEGER NOT NULL CHECK (price_paise >= 0),
  sale_price_paise      INTEGER CHECK (sale_price_paise IS NULL OR sale_price_paise >= 0),
  currency              TEXT NOT NULL DEFAULT 'INR',
  image_url             TEXT,
  additional_image_urls TEXT[] NOT NULL DEFAULT '{}',
  product_url           TEXT,
  brand                 TEXT,
  category              TEXT,
  availability          TEXT NOT NULL DEFAULT 'in stock'
                        CHECK (availability IN ('in stock', 'out of stock')),
  -- NULL = stock is not tracked.
  stock_qty             INTEGER,
  source                TEXT NOT NULL DEFAULT 'manual'
                        CHECK (source IN ('manual', 'csv', 'shopify', 'woocommerce')),
  source_id             TEXT,
  status                TEXT NOT NULL DEFAULT 'active'
                        CHECK (status IN ('active', 'draft', 'archived')),
  meta_sync_status      TEXT NOT NULL DEFAULT 'pending'
                        CHECK (meta_sync_status IN ('pending', 'synced', 'error', 'skipped')),
  meta_sync_error       TEXT,
  meta_synced_at        TIMESTAMPTZ,
  created_at            TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at            TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (account_id, retailer_id)
);

CREATE INDEX IF NOT EXISTS products_account_status_idx ON products (account_id, status);
CREATE INDEX IF NOT EXISTS products_account_updated_idx ON products (account_id, updated_at DESC);
CREATE UNIQUE INDEX IF NOT EXISTS products_account_source_idx
  ON products (account_id, source, source_id) WHERE source_id IS NOT NULL;

ALTER TABLE products ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Members can view products" ON products;
CREATE POLICY "Members can view products" ON products
  FOR SELECT USING (is_account_member(account_id, 'viewer'));
-- No client write policies: writes go through /api/catalog/* (service role).

-- ------------------------------------------------------------
-- Public bucket for product photos (uploaded by the server).
-- Paths are `<account_id>/<random>.<ext>`, so they are unguessable.
-- ------------------------------------------------------------
INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES (
  'catalog-media',
  'catalog-media',
  TRUE,
  5242880, -- 5 MB
  ARRAY['image/png', 'image/jpeg', 'image/webp']
)
ON CONFLICT (id) DO UPDATE
SET
  public = EXCLUDED.public,
  file_size_limit = EXCLUDED.file_size_limit,
  allowed_mime_types = EXCLUDED.allowed_mime_types;

DROP POLICY IF EXISTS "Catalog media is publicly readable" ON storage.objects;
CREATE POLICY "Catalog media is publicly readable"
  ON storage.objects FOR SELECT
  USING (bucket_id = 'catalog-media');
