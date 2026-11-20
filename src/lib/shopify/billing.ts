// ============================================================
// Shopify Billing API — recurring AppSubscription for App Store
// accounts. Server-only.
//
// Shopify App Store requirement 1.2.1: an app distributed through the
// App Store must charge App Store merchants through Shopify's Billing
// API, not a side channel. `install-source.ts` decides *which*
// accounts that applies to; this is what actually charges them.
//
// Flow:
//   1. POST /api/account/billing/shopify — createAppSubscription(),
//      account.shopify_pending_plan/cycle set, merchant redirected to
//      the returned confirmationUrl.
//   2. Merchant approves on Shopify's own page.
//   3. Shopify fires APP_SUBSCRIPTIONS_UPDATE → onAppSubscriptionUpdate()
//      flips accounts.plan when the subscription is ACTIVE, or marks
//      the plan expired (reusing the existing plan_expires_at mechanism
//      — see plans.ts effectivePlan()) on CANCELLED/EXPIRED/FROZEN.
//
// replacementBehavior: STANDARD on create means switching plans does
// not need us to cancel the previous subscription by hand — Shopify
// retires it the moment the new one activates, so a merchant is never
// billed for two plans at once.
// ============================================================

import type { SupabaseClient } from '@supabase/supabase-js';

import { recordAudit } from '@/lib/audit';
import {
  PLAN_INFO,
  type BillingCycle,
  type PaidPlan,
} from '@/lib/billing/plans';

import { shopifyGraphql } from './admin-api';
import { appBaseUrl } from './config';
import type { ShopifyStore } from './store';

const SUBSCRIPTION_CURRENCY = 'INR';

function pricingInterval(cycle: BillingCycle): 'EVERY_30_DAYS' | 'ANNUAL' {
  return cycle === 'yearly' ? 'ANNUAL' : 'EVERY_30_DAYS';
}

export function returnUrl(): string {
  return `${appBaseUrl()}/settings?tab=billing`;
}

const SUBSCRIPTION_CREATE = `
mutation RepeatGrowSubscriptionCreate(
  $name: String!
  $returnUrl: URL!
  $test: Boolean!
  $lineItems: [AppSubscriptionLineItemInput!]!
) {
  appSubscriptionCreate(
    name: $name
    returnUrl: $returnUrl
    test: $test
    lineItems: $lineItems
    replacementBehavior: STANDARD
  ) {
    appSubscription { id }
    confirmationUrl
    userErrors { field message }
  }
}`;

export interface CreateSubscriptionResult {
  subscriptionId: string;
  confirmationUrl: string;
}

/**
 * Create (or replace) the shop's AppSubscription for `plan`/`cycle`.
 * `test` should be true outside production so dev/staging never moves
 * real money — Shopify marks the charge as a test and it settles
 * nothing.
 */
export async function createAppSubscription(args: {
  shop: string;
  accessToken: string;
  plan: PaidPlan;
  cycle: BillingCycle;
  test: boolean;
}): Promise<CreateSubscriptionResult> {
  const price = PLAN_INFO[args.plan].prices?.[args.cycle];
  if (price == null) {
    throw new Error(
      `${PLAN_INFO[args.plan].label} has no fixed price for self-serve billing — contact us instead.`
    );
  }

  const data = await shopifyGraphql<{
    appSubscriptionCreate: {
      appSubscription: { id: string } | null;
      confirmationUrl: string | null;
      userErrors: { field: string[]; message: string }[];
    };
  }>(args.shop, args.accessToken, SUBSCRIPTION_CREATE, {
    name: `Repeat Grow — ${PLAN_INFO[args.plan].label}`,
    returnUrl: returnUrl(),
    test: args.test,
    lineItems: [
      {
        plan: {
          appRecurringPricingDetails: {
            price: { amount: price, currencyCode: SUBSCRIPTION_CURRENCY },
            interval: pricingInterval(args.cycle),
          },
        },
      },
    ],
  });

  const result = data.appSubscriptionCreate;
  if (result.userErrors.length > 0) {
    throw new Error(result.userErrors.map((e) => e.message).join('; '));
  }
  if (!result.appSubscription || !result.confirmationUrl) {
    throw new Error('Shopify did not return a subscription to approve');
  }
  return {
    subscriptionId: result.appSubscription.id,
    confirmationUrl: result.confirmationUrl,
  };
}

const SUBSCRIPTION_CANCEL = `
mutation RepeatGrowSubscriptionCancel($id: ID!) {
  appSubscriptionCancel(id: $id) {
    appSubscription { id status }
    userErrors { field message }
  }
}`;

/** Cancel a subscription outright (merchant-initiated, not a plan switch). */
export async function cancelAppSubscription(args: {
  shop: string;
  accessToken: string;
  subscriptionId: string;
}): Promise<void> {
  const data = await shopifyGraphql<{
    appSubscriptionCancel: {
      userErrors: { field: string[]; message: string }[];
    };
  }>(args.shop, args.accessToken, SUBSCRIPTION_CANCEL, {
    id: args.subscriptionId,
  });
  const errors = data.appSubscriptionCancel.userErrors.filter(
    // Already gone counts as cancelled.
    (e) => !/not found|already been cancelled/i.test(e.message)
  );
  if (errors.length > 0) {
    throw new Error(errors.map((e) => e.message).join('; '));
  }
}

// ------------------------------------------------------------
// Webhook (APP_SUBSCRIPTIONS_UPDATE)
// ------------------------------------------------------------

export type ShopifySubscriptionStatus =
  | 'ACTIVE'
  | 'CANCELLED'
  | 'EXPIRED'
  | 'FROZEN'
  | 'DECLINED'
  | 'PENDING';

/** Shopify delivers this REST-shaped, not a 1:1 copy of the GraphQL node. */
interface AppSubscriptionWebhookPayload {
  admin_graphql_api_id?: unknown;
  status?: unknown;
}

/**
 * Pure parse of the webhook body — Shopify nests it under
 * `app_subscription`, but defend against a flattened payload too since
 * nothing here is load-bearing enough to risk a silent miss.
 */
export function parseAppSubscriptionWebhook(
  payload: Record<string, unknown>
): { subscriptionId: string; status: ShopifySubscriptionStatus } | null {
  const node = (
    typeof payload.app_subscription === 'object' && payload.app_subscription
      ? payload.app_subscription
      : payload
  ) as AppSubscriptionWebhookPayload;
  const subscriptionId = node.admin_graphql_api_id;
  const status = node.status;
  if (typeof subscriptionId !== 'string' || typeof status !== 'string')
    return null;
  const upper = status.toUpperCase();
  const known: ShopifySubscriptionStatus[] = [
    'ACTIVE',
    'CANCELLED',
    'EXPIRED',
    'FROZEN',
    'DECLINED',
    'PENDING',
  ];
  if (!known.includes(upper as ShopifySubscriptionStatus)) return null;
  return { subscriptionId, status: upper as ShopifySubscriptionStatus };
}

/**
 * Terminal: this subscription object will never activate again. Clear
 * it from the account so a stray late delivery can't be mistaken for
 * the next one the merchant creates.
 */
const TERMINAL_STATUSES = new Set<ShopifySubscriptionStatus>(['CANCELLED', 'EXPIRED']);

/**
 * Apply an APP_SUBSCRIPTIONS_UPDATE delivery to the account it belongs
 * to. Never throws — same contract as the rest of the webhook handlers
 * in process.ts, which log and move on.
 */
export async function onAppSubscriptionUpdate(
  db: SupabaseClient,
  store: ShopifyStore,
  payload: Record<string, unknown>
): Promise<void> {
  const parsed = parseAppSubscriptionWebhook(payload);
  if (!parsed) return;

  const { data: account } = await db
    .from('accounts')
    .select('shopify_subscription_id, shopify_pending_plan')
    .eq('id', store.account_id)
    .maybeSingle();
  if (!account) return;

  // A delivery for a subscription this account has since replaced or
  // never had on file — stale, ignore it rather than clobber the
  // current (possibly newer) subscription's state.
  if (account.shopify_subscription_id !== parsed.subscriptionId) return;

  if (parsed.status === 'ACTIVE') {
    const plan = account.shopify_pending_plan;
    if (plan) {
      // The normal case: a new (or replacement) subscription just got
      // the merchant's approval.
      await db
        .from('accounts')
        .update({
          plan,
          plan_expires_at: null,
          shopify_pending_plan: null,
          shopify_pending_cycle: null,
        })
        .eq('id', store.account_id);
    } else {
      // No pending plan — this is the *same* subscription coming back
      // from FROZEN. `plan` itself never changed, only access was
      // paused; just lift the pause.
      await db
        .from('accounts')
        .update({ plan_expires_at: null })
        .eq('id', store.account_id);
    }
    await recordAudit({
      accountId: store.account_id,
      actorUserId: null,
      action: 'plan.changed',
      targetType: 'account',
      targetId: store.account_id,
      metadata: { plan: plan ?? undefined, via: 'shopify_billing', status: 'active' },
    });
    return;
  }

  if (parsed.status === 'DECLINED') {
    // A declined *request* — if there was already an active paid plan
    // running on a different (prior) subscription, this one never
    // replaced it, so leave `plan` alone. This GID will never activate,
    // so it's cleared along with the pending request.
    await db
      .from('accounts')
      .update({
        shopify_subscription_id: null,
        shopify_pending_plan: null,
        shopify_pending_cycle: null,
      })
      .eq('id', store.account_id);
    return;
  }

  if (parsed.status === 'FROZEN') {
    // Paused, not terminal — Shopify can unfreeze and send ACTIVE again
    // for this same subscription id, so it stays on file (see above).
    await db
      .from('accounts')
      .update({ plan_expires_at: new Date().toISOString() })
      .eq('id', store.account_id);
    await recordAudit({
      accountId: store.account_id,
      actorUserId: null,
      action: 'plan.changed',
      targetType: 'account',
      targetId: store.account_id,
      metadata: { via: 'shopify_billing', status: 'frozen' },
    });
    return;
  }

  if (TERMINAL_STATUSES.has(parsed.status)) {
    await db
      .from('accounts')
      .update({
        plan_expires_at: new Date().toISOString(),
        shopify_subscription_id: null,
        shopify_pending_plan: null,
        shopify_pending_cycle: null,
      })
      .eq('id', store.account_id);
    await recordAudit({
      accountId: store.account_id,
      actorUserId: null,
      action: 'plan.changed',
      targetType: 'account',
      targetId: store.account_id,
      metadata: { via: 'shopify_billing', status: parsed.status.toLowerCase() },
    });
  }
}
