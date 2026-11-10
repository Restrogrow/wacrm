-- ============================================================
-- 099_install_source.sql — where an account came from.
--
-- Shopify App Store requirement 1.2.1: an app distributed through the
-- App Store must bill merchants through Shopify's Billing API. Split
-- billing is allowed — merchants who arrive any other way can keep
-- paying us directly — but only if we can tell the two apart, and
-- today nothing on `accounts` records it.
--
-- `install_source`:
--   'website'            the default, and what every existing account
--                        gets. They all predate App Store publication,
--                        so this is also the grandfather clause: no
--                        separate cut-off date is needed.
--   'shopify_app_store'  the account arrived through Shopify's own
--                        signed entry point (App Store listing or the
--                        Shopify admin). Must be billed via the
--                        Billing API.
--
-- Set once, when a Shopify install completes, and never downgraded.
-- The decision itself lives in lib/billing/install-source.ts so it can
-- be tested; see the note there about a paying website customer who
-- later installs from the Shopify admin — that case is deliberately
-- NOT flipped automatically.
--
-- `shopify_pending_installs.from_app_store` carries the signal across
-- the gap between approving the app and signing up: at approval time
-- there is no account yet to write it to.
-- ============================================================

ALTER TABLE accounts
  ADD COLUMN IF NOT EXISTS install_source text NOT NULL DEFAULT 'website'
    CHECK (install_source IN ('website', 'shopify_app_store')),
  -- When it stopped being the default. NULL on every grandfathered
  -- account, which is also how we evidence "this one predates the
  -- listing" if Shopify ever asks.
  ADD COLUMN IF NOT EXISTS install_source_set_at timestamptz;

-- Billing code asks "which accounts must use Shopify billing?" when
-- reconciling; tiny table today, but the partial index keeps that from
-- becoming a scan as the App Store side grows.
CREATE INDEX IF NOT EXISTS accounts_shopify_billed_idx
  ON accounts (id)
  WHERE install_source = 'shopify_app_store';

ALTER TABLE shopify_pending_installs
  ADD COLUMN IF NOT EXISTS from_app_store boolean NOT NULL DEFAULT false;
