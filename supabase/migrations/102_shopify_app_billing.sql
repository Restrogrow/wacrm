-- ============================================================
-- 102_shopify_app_billing.sql — actually charge App Store merchants
-- through Shopify's Billing API.
--
-- Migration 099 added `install_source` so a Shopify App Store account
-- could be *distinguished*, but nothing ever created a real Shopify
-- AppSubscription — the flag alone doesn't satisfy requirement 1.2.1.
-- This adds what lib/shopify/billing.ts needs to run that subscription
-- end to end:
--
--   shopify_subscription_id    the AppSubscription GID currently on
--                              file for this account (one at a time —
--                              appSubscriptionCreate is called with
--                              replacementBehavior: STANDARD, so Shopify
--                              itself retires the previous one when a
--                              new one activates). Also doubles as the
--                              idempotency key for APP_SUBSCRIPTIONS_UPDATE:
--                              a webhook whose id no longer matches this
--                              column is stale (superseded or cancelled)
--                              and is ignored.
--   shopify_pending_plan/cycle the plan+cycle requested, waiting on the
--                              merchant's approval at Shopify's
--                              confirmation page. Applied to `plan` /
--                              `plan_expires_at` only once the webhook
--                              reports the subscription ACTIVE; cleared
--                              on activation, decline or cancellation.
-- ============================================================

ALTER TABLE accounts
  ADD COLUMN IF NOT EXISTS shopify_subscription_id text,
  ADD COLUMN IF NOT EXISTS shopify_pending_plan text
    CHECK (shopify_pending_plan IN ('starter', 'growth', 'pro', 'enterprise')),
  ADD COLUMN IF NOT EXISTS shopify_pending_cycle text
    CHECK (shopify_pending_cycle IN ('monthly', 'quarterly', 'yearly'));

-- A live AppSubscription belongs to exactly one account.
CREATE UNIQUE INDEX IF NOT EXISTS accounts_shopify_subscription_key
  ON accounts (shopify_subscription_id)
  WHERE shopify_subscription_id IS NOT NULL;
