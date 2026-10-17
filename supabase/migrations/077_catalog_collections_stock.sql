-- ============================================================
-- 077_catalog_collections_stock.sql — catalog part 2
--
--   * optional WooCommerce REST API keys (encrypted) for product sync
--   * catalog_collections / catalog_collection_items: named product lists
--     ("Best sellers") that can be sent from the inbox in one click
--   * product_stock_movements: ledger of stock changes caused by orders
--   * apply_order_stock(): atomic, idempotent stock update for an order,
--     fired by a trigger when a WhatsApp order becomes PAID (sale) or is
--     cancelled / refunded (restock)
--   * 'low_stock' notification type
--
-- Depends on migration 076 (the `products` table with stock_qty,
-- availability, retailer_id…). Nothing here creates a foreign key to
-- `products`, so this file also applies cleanly BEFORE 076; the stock
-- function checks at run time that `products` exists and the order trigger
-- never blocks an order update (any problem becomes a WARNING).
--
-- RLS: members read their account's rows; every write goes through API
-- routes using the service role (same as payment_links).
-- ============================================================

-- ---------- 1. optional WooCommerce API keys ---------------------
ALTER TABLE woocommerce_stores
  ADD COLUMN IF NOT EXISTS api_consumer_key    TEXT,   -- encrypted
  ADD COLUMN IF NOT EXISTS api_consumer_secret TEXT;   -- encrypted

-- ---------- 2. collections --------------------------------------
CREATE TABLE IF NOT EXISTS catalog_collections (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  account_id  UUID NOT NULL REFERENCES accounts(id) ON DELETE CASCADE,
  name        TEXT NOT NULL CHECK (char_length(btrim(name)) BETWEEN 1 AND 24),
  created_by  UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE UNIQUE INDEX IF NOT EXISTS catalog_collections_account_name_key
  ON catalog_collections (account_id, lower(btrim(name)));

CREATE TABLE IF NOT EXISTS catalog_collection_items (
  collection_id UUID NOT NULL REFERENCES catalog_collections(id) ON DELETE CASCADE,
  account_id    UUID NOT NULL REFERENCES accounts(id) ON DELETE CASCADE,
  retailer_id   TEXT NOT NULL CHECK (char_length(retailer_id) BETWEEN 1 AND 100),
  position      INTEGER NOT NULL DEFAULT 0,
  PRIMARY KEY (collection_id, retailer_id)
);

CREATE INDEX IF NOT EXISTS catalog_collection_items_account_idx
  ON catalog_collection_items (account_id, collection_id, position);

ALTER TABLE catalog_collections ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Members can view collections" ON catalog_collections;
CREATE POLICY "Members can view collections" ON catalog_collections
  FOR SELECT USING (is_account_member(account_id, 'viewer'));

ALTER TABLE catalog_collection_items ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Members can view collection items" ON catalog_collection_items;
CREATE POLICY "Members can view collection items" ON catalog_collection_items
  FOR SELECT USING (is_account_member(account_id, 'viewer'));

-- ---------- 3. stock ledger -------------------------------------
CREATE TABLE IF NOT EXISTS product_stock_movements (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  account_id  UUID NOT NULL REFERENCES accounts(id) ON DELETE CASCADE,
  product_id  UUID,                      -- products.id (no FK: see header)
  retailer_id TEXT NOT NULL,
  order_id    UUID NOT NULL REFERENCES whatsapp_orders(id) ON DELETE CASCADE,
  kind        TEXT NOT NULL CHECK (kind IN ('sale', 'restock')),
  qty         INTEGER NOT NULL CHECK (qty >= 0),  -- units actually moved
  stock_after INTEGER NOT NULL,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
  -- One sale and at most one restock per order+product: replays can never
  -- double-decrement or double-restock.
  UNIQUE (order_id, retailer_id, kind)
);

CREATE INDEX IF NOT EXISTS product_stock_movements_account_idx
  ON product_stock_movements (account_id, created_at DESC);

ALTER TABLE product_stock_movements ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Members can view stock movements" ON product_stock_movements;
CREATE POLICY "Members can view stock movements" ON product_stock_movements
  FOR SELECT USING (is_account_member(account_id, 'viewer'));

-- ---------- 4. 'low_stock' notification type ---------------------
-- Keeps whatever the constraint allows today (other migrations add types),
-- and only adds 'low_stock' if it is missing.
DO $$
DECLARE
  v_def TEXT;
  v_types TEXT[];
BEGIN
  SELECT pg_get_constraintdef(oid) INTO v_def
  FROM pg_constraint
  WHERE conrelid = 'public.notifications'::regclass
    AND conname = 'notifications_type_check';

  IF v_def IS NULL OR v_def LIKE '%''low_stock''%' THEN
    RETURN;
  END IF;

  SELECT array_agg(DISTINCT m[1]) INTO v_types
  FROM regexp_matches(v_def, '''([a-z_]+)''', 'g') AS m;
  v_types := array_append(COALESCE(v_types, ARRAY['conversation_assigned']), 'low_stock');

  ALTER TABLE notifications DROP CONSTRAINT notifications_type_check;
  EXECUTE format(
    'ALTER TABLE notifications ADD CONSTRAINT notifications_type_check CHECK (type IN (%s))',
    (SELECT string_agg(quote_literal(t), ', ') FROM (SELECT DISTINCT unnest(v_types) AS t) x)
  );
END $$;

-- ---------- 5. atomic, idempotent stock update --------------------
-- p_kind = 'sale'    : decrement tracked products (stock_qty IS NOT NULL)
-- p_kind = 'restock' : give back what a previous sale took (no-op when
--                      there was no sale or it was already restocked)
-- Returns the number of products changed. Untracked products (stock_qty
-- NULL) are never touched.
CREATE OR REPLACE FUNCTION public.apply_order_stock(
  p_order_id UUID,
  p_kind TEXT,
  p_low_threshold INTEGER DEFAULT 5
) RETURNS INTEGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  o          RECORD;
  it         JSONB;
  v_rid      TEXT;
  v_qty      INTEGER;
  p          RECORD;
  v_after    INTEGER;
  v_moved    INTEGER;
  v_sale_qty INTEGER;
  v_ledger   UUID;
  v_changed  INTEGER := 0;
BEGIN
  IF p_kind NOT IN ('sale', 'restock') THEN
    RAISE EXCEPTION 'invalid kind %', p_kind;
  END IF;

  -- Catalog part 1 (migration 076) may not be applied yet.
  IF to_regclass('public.products') IS NULL THEN
    RETURN 0;
  END IF;

  SELECT id, account_id, items INTO o FROM whatsapp_orders WHERE id = p_order_id;
  IF NOT FOUND THEN
    RETURN 0;
  END IF;

  FOR it IN SELECT * FROM jsonb_array_elements(COALESCE(o.items, '[]'::jsonb))
  LOOP
    v_rid := NULLIF(btrim(it->>'retailer_id'), '');
    v_qty := CASE
      WHEN jsonb_typeof(it->'quantity') = 'number' THEN GREATEST((it->>'quantity')::numeric::int, 0)
      ELSE 0
    END;
    CONTINUE WHEN v_rid IS NULL OR v_qty <= 0;

    -- Lock the product row so two orders paid at the same moment queue up.
    SELECT id, title, stock_qty, availability INTO p
    FROM products
    WHERE account_id = o.account_id AND retailer_id = v_rid AND stock_qty IS NOT NULL
    FOR UPDATE;
    CONTINUE WHEN NOT FOUND;

    IF p_kind = 'sale' THEN
      v_after := GREATEST(p.stock_qty - v_qty, 0);
      v_moved := p.stock_qty - v_after;

      INSERT INTO product_stock_movements (account_id, product_id, retailer_id, order_id, kind, qty, stock_after)
      VALUES (o.account_id, p.id, v_rid, o.id, 'sale', v_moved, v_after)
      ON CONFLICT (order_id, retailer_id, kind) DO NOTHING
      RETURNING id INTO v_ledger;
      CONTINUE WHEN v_ledger IS NULL;   -- already applied: replay is a no-op

      UPDATE products
      SET stock_qty = v_after,
          availability = CASE WHEN v_after = 0 THEN 'out of stock' ELSE availability END,
          meta_sync_status = CASE WHEN meta_sync_status = 'synced' THEN 'pending' ELSE meta_sync_status END,
          updated_at = now()
      WHERE id = p.id;
      v_changed := v_changed + 1;

      -- Crossing the threshold (or hitting zero) tells owners and admins once.
      IF p.stock_qty > p_low_threshold AND v_after <= p_low_threshold AND to_regclass('public.notifications') IS NOT NULL THEN
        INSERT INTO notifications (account_id, user_id, type, title, body)
        SELECT o.account_id, pr.user_id, 'low_stock',
               CASE WHEN v_after = 0 THEN 'Out of stock' ELSE 'Low stock' END,
               left(p.title, 80) || ' (' || v_rid || ') has ' || v_after || ' left.'
        FROM profiles pr
        WHERE pr.account_id = o.account_id AND pr.account_role IN ('owner', 'admin');
      END IF;
    ELSE
      SELECT qty INTO v_sale_qty
      FROM product_stock_movements
      WHERE order_id = o.id AND retailer_id = v_rid AND kind = 'sale';
      CONTINUE WHEN NOT FOUND OR v_sale_qty <= 0;

      v_after := p.stock_qty + v_sale_qty;
      INSERT INTO product_stock_movements (account_id, product_id, retailer_id, order_id, kind, qty, stock_after)
      VALUES (o.account_id, p.id, v_rid, o.id, 'restock', v_sale_qty, v_after)
      ON CONFLICT (order_id, retailer_id, kind) DO NOTHING
      RETURNING id INTO v_ledger;
      CONTINUE WHEN v_ledger IS NULL;

      UPDATE products
      SET stock_qty = v_after,
          availability = CASE WHEN availability = 'out of stock' AND v_after > 0 THEN 'in stock' ELSE availability END,
          meta_sync_status = CASE WHEN meta_sync_status = 'synced' THEN 'pending' ELSE meta_sync_status END,
          updated_at = now()
      WHERE id = p.id;
      v_changed := v_changed + 1;
    END IF;
  END LOOP;

  RETURN v_changed;
END;
$$;

REVOKE ALL ON FUNCTION public.apply_order_stock(UUID, TEXT, INTEGER) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.apply_order_stock(UUID, TEXT, INTEGER) TO service_role;

-- ---------- 6. trigger on whatsapp_orders -------------------------
-- Covers every path that marks an order paid (manual "mark paid",
-- Razorpay payment links, WhatsApp Pay webhooks) without touching them.
-- Stock problems must never block an order update, so everything inside
-- is wrapped: failures become WARNINGs.
CREATE OR REPLACE FUNCTION public.whatsapp_orders_stock_trigger()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  BEGIN
    IF NEW.payment_status = 'paid' AND OLD.payment_status IS DISTINCT FROM 'paid' THEN
      PERFORM public.apply_order_stock(NEW.id, 'sale');
    ELSIF (NEW.status = 'canceled' AND OLD.status IS DISTINCT FROM 'canceled')
       OR (NEW.payment_status = 'refunded' AND OLD.payment_status IS DISTINCT FROM 'refunded') THEN
      PERFORM public.apply_order_stock(NEW.id, 'restock');
    END IF;
  EXCEPTION WHEN OTHERS THEN
    RAISE WARNING 'order stock update skipped for order %: %', NEW.id, SQLERRM;
  END;
  RETURN NEW;
END;
$$;

REVOKE ALL ON FUNCTION public.whatsapp_orders_stock_trigger() FROM PUBLIC, anon, authenticated;

DROP TRIGGER IF EXISTS whatsapp_orders_stock ON whatsapp_orders;
CREATE TRIGGER whatsapp_orders_stock
  AFTER UPDATE OF payment_status, status ON whatsapp_orders
  FOR EACH ROW EXECUTE FUNCTION public.whatsapp_orders_stock_trigger();
