-- ============================================================
-- 053: Catalog, orders and payments (India)
--
-- commerce_settings (one row per account):
--   catalog_id            Meta commerce catalog connected to the WABA —
--                         for "Share catalog", product messages and
--                         orders customers place from the catalog.
--   payment_mode          'whatsapp_pay' — native "Review and pay" via a
--                         payment configuration made in WhatsApp Manager
--                         (Razorpay / PayU / BillDesk / Zaakpay);
--                         'upi_id' — order summary with the business's
--                         UPI ID, marked paid by an agent;
--                         'none'.
-- whatsapp_orders: every order (created by an agent in a chat, or from a
--   customer's catalog cart), its items and amounts in paise, payment
--   and fulfilment status. WhatsApp Pay payment webhooks update it by
--   reference_id.
--
-- Members can read their account's rows (RLS); writes go through the
-- API routes / webhook with the service-role client.
-- ============================================================

CREATE TABLE IF NOT EXISTS commerce_settings (
  account_id            UUID PRIMARY KEY REFERENCES accounts(id) ON DELETE CASCADE,
  catalog_id            TEXT,
  payment_mode          TEXT NOT NULL DEFAULT 'none'
                        CHECK (payment_mode IN ('none', 'whatsapp_pay', 'upi_id')),
  payment_configuration TEXT,
  payment_gateway       TEXT CHECK (payment_gateway IS NULL OR payment_gateway IN ('razorpay', 'payu', 'billdesk', 'zaakpay')),
  upi_id                TEXT,
  upi_name              TEXT,
  goods_type            TEXT NOT NULL DEFAULT 'physical-goods'
                        CHECK (goods_type IN ('physical-goods', 'digital-goods')),
  updated_at            TIMESTAMPTZ NOT NULL DEFAULT now()
);

ALTER TABLE commerce_settings ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Members can view commerce settings" ON commerce_settings;
CREATE POLICY "Members can view commerce settings" ON commerce_settings
  FOR SELECT USING (is_account_member(account_id, 'viewer'));

CREATE TABLE IF NOT EXISTS whatsapp_orders (
  id               UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  account_id       UUID NOT NULL REFERENCES accounts(id) ON DELETE CASCADE,
  reference_id     TEXT NOT NULL,
  conversation_id  UUID REFERENCES conversations(id) ON DELETE SET NULL,
  contact_id       UUID REFERENCES contacts(id) ON DELETE SET NULL,
  source           TEXT NOT NULL DEFAULT 'agent' CHECK (source IN ('agent', 'catalog')),
  items            JSONB NOT NULL,          -- [{ name, retailer_id?, quantity, unit_price }] (paise)
  subtotal         INTEGER NOT NULL DEFAULT 0,
  tax              INTEGER NOT NULL DEFAULT 0,
  shipping         INTEGER NOT NULL DEFAULT 0,
  discount         INTEGER NOT NULL DEFAULT 0,
  total            INTEGER NOT NULL DEFAULT 0,
  currency         TEXT NOT NULL DEFAULT 'INR',
  status           TEXT NOT NULL DEFAULT 'pending'
                   CHECK (status IN ('pending', 'processing', 'shipped', 'completed', 'canceled')),
  payment_status   TEXT NOT NULL DEFAULT 'unpaid'
                   CHECK (payment_status IN ('unpaid', 'requested', 'pending', 'paid', 'failed', 'refunded')),
  payment_mode     TEXT,                    -- whatsapp_pay | upi_id | manual
  payment_method   TEXT,                    -- upi | card | netbanking | wallet
  payment_txn_id   TEXT,
  note             TEXT,
  message_id       TEXT,
  created_by       UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at       TIMESTAMPTZ NOT NULL DEFAULT now(),
  paid_at          TIMESTAMPTZ,
  updated_at       TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (account_id, reference_id)
);

CREATE INDEX IF NOT EXISTS whatsapp_orders_account_created_idx ON whatsapp_orders (account_id, created_at DESC);
CREATE INDEX IF NOT EXISTS whatsapp_orders_contact_idx ON whatsapp_orders (contact_id, created_at DESC);
CREATE INDEX IF NOT EXISTS whatsapp_orders_reference_idx ON whatsapp_orders (reference_id);

ALTER TABLE whatsapp_orders ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Members can view orders" ON whatsapp_orders;
CREATE POLICY "Members can view orders" ON whatsapp_orders
  FOR SELECT USING (is_account_member(account_id, 'viewer'));
