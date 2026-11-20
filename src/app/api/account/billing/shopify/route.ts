// ============================================================
// /api/account/billing/shopify — self-serve plan changes for accounts
// that must be billed through Shopify's Billing API (requirement
// 1.2.1; see lib/billing/install-source.ts).
//
// POST   { plan, cycle }  create/replace the AppSubscription, return
//                         the confirmationUrl the merchant approves it
//                         at. The plan only takes effect once Shopify
//                         confirms it ACTIVE — see the webhook handler
//                         in lib/shopify/billing.ts.
// DELETE                  cancel the current subscription outright.
// ============================================================

import { NextResponse } from 'next/server';

import { recordAudit } from '@/lib/audit';
import { requireRole, toErrorResponse } from '@/lib/auth/account';
import {
  PLANS,
  SHOPIFY_BILLABLE_CYCLES,
  type BillingCycle,
  type PaidPlan,
} from '@/lib/billing/plans';
import { billsThroughShopify } from '@/lib/billing/install-source';
import { supabaseAdmin } from '@/lib/flows/admin-client';
import { getAccessToken } from '@/lib/shopify/admin-api';
import { cancelAppSubscription, createAppSubscription } from '@/lib/shopify/billing';

async function loadStore(accountId: string, db: ReturnType<typeof supabaseAdmin>) {
  return db
    .from('shopify_stores')
    .select('id, shop_domain, access_token, refresh_token, access_token_expires_at')
    .eq('account_id', accountId)
    .eq('connection_type', 'oauth')
    .eq('status', 'active')
    .maybeSingle();
}

export async function POST(request: Request) {
  try {
    const ctx = await requireRole('admin');
    const db = supabaseAdmin();

    const body = (await request.json().catch(() => null)) as {
      plan?: unknown;
      cycle?: unknown;
    } | null;
    if (
      typeof body?.plan !== 'string' ||
      !(PLANS as readonly string[]).includes(body.plan)
    ) {
      return NextResponse.json({ error: 'Choose a valid plan' }, { status: 400 });
    }
    if (
      typeof body?.cycle !== 'string' ||
      !SHOPIFY_BILLABLE_CYCLES.includes(body.cycle as BillingCycle)
    ) {
      return NextResponse.json(
        { error: 'Shopify billing supports monthly or yearly only' },
        { status: 400 }
      );
    }
    const plan = body.plan as PaidPlan;
    const cycle = body.cycle as BillingCycle;

    const { data: account } = await db
      .from('accounts')
      .select('install_source')
      .eq('id', ctx.accountId)
      .maybeSingle();
    if (!account || !billsThroughShopify(account.install_source)) {
      return NextResponse.json(
        { error: "This account isn't billed through the Shopify App Store" },
        { status: 400 }
      );
    }

    const { data: store } = await loadStore(ctx.accountId, db);
    if (!store) {
      return NextResponse.json(
        { error: 'Connect Shopify first in Settings → Shopify' },
        { status: 400 }
      );
    }

    let accessToken: string;
    try {
      accessToken = await getAccessToken(store);
    } catch (err) {
      return NextResponse.json(
        {
          error:
            err instanceof Error
              ? err.message
              : 'Shopify access expired — reconnect the store',
        },
        { status: 400 }
      );
    }

    let result;
    try {
      result = await createAppSubscription({
        shop: store.shop_domain,
        accessToken,
        plan,
        cycle,
        test: process.env.NODE_ENV !== 'production',
      });
    } catch (err) {
      console.error('[billing/shopify] appSubscriptionCreate failed:', err);
      return NextResponse.json(
        { error: err instanceof Error ? err.message : 'Shopify rejected the request' },
        { status: 502 }
      );
    }

    const { error: updateErr } = await db
      .from('accounts')
      .update({
        shopify_subscription_id: result.subscriptionId,
        shopify_pending_plan: plan,
        shopify_pending_cycle: cycle,
      })
      .eq('id', ctx.accountId);
    if (updateErr) {
      console.error('[billing/shopify] failed to record pending plan:', updateErr.message);
      return NextResponse.json({ error: 'Could not save the request' }, { status: 500 });
    }

    await recordAudit(
      {
        accountId: ctx.accountId,
        actorUserId: ctx.userId,
        action: 'plan.changed',
        targetType: 'account',
        targetId: ctx.accountId,
        metadata: { plan, cycle, via: 'shopify_billing', status: 'requested' },
      },
      request
    );

    return NextResponse.json({ confirmationUrl: result.confirmationUrl });
  } catch (err) {
    return toErrorResponse(err);
  }
}

export async function DELETE(request: Request) {
  try {
    const ctx = await requireRole('admin');
    const db = supabaseAdmin();

    const { data: account } = await db
      .from('accounts')
      .select('shopify_subscription_id')
      .eq('id', ctx.accountId)
      .maybeSingle();
    if (!account?.shopify_subscription_id) {
      return NextResponse.json({ error: 'No Shopify subscription to cancel' }, { status: 400 });
    }

    const { data: store } = await loadStore(ctx.accountId, db);
    if (store) {
      try {
        const accessToken = await getAccessToken(store);
        await cancelAppSubscription({
          shop: store.shop_domain,
          accessToken,
          subscriptionId: account.shopify_subscription_id,
        });
      } catch (err) {
        console.error('[billing/shopify] appSubscriptionCancel failed:', err);
        return NextResponse.json(
          { error: err instanceof Error ? err.message : 'Could not reach Shopify' },
          { status: 502 }
        );
      }
    }

    await db
      .from('accounts')
      .update({
        plan_expires_at: new Date().toISOString(),
        shopify_subscription_id: null,
        shopify_pending_plan: null,
        shopify_pending_cycle: null,
      })
      .eq('id', ctx.accountId);

    await recordAudit(
      {
        accountId: ctx.accountId,
        actorUserId: ctx.userId,
        action: 'plan.changed',
        targetType: 'account',
        targetId: ctx.accountId,
        metadata: { via: 'shopify_billing', status: 'cancelled_by_merchant' },
      },
      request
    );

    return NextResponse.json({ ok: true });
  } catch (err) {
    return toErrorResponse(err);
  }
}
