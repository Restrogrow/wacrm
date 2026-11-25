// ============================================================
// GET /api/account/billing — the caller's plan, trial / paid-until
// dates, limits and current usage. Any member (drives the trial banner
// and Settings → Plan & billing).
// ============================================================

import { NextResponse } from 'next/server';

import { getCurrentAccount, toErrorResponse } from '@/lib/auth/account';
import { supabaseAdmin } from '@/lib/flows/admin-client';
import {
  PLAN_LIMITS,
  effectivePlan,
  type AccountBilling,
  type LimitKey,
} from '@/lib/billing/plans';
import { billsThroughShopify } from '@/lib/billing/install-source';

export async function GET() {
  try {
    const ctx = await getCurrentAccount();
    const db = supabaseAdmin();
    const accountId = ctx.accountId;

    const { data: account, error } = await db
      .from('accounts')
      .select('plan, trial_ends_at, plan_expires_at')
      .eq('id', accountId)
      .maybeSingle();
    if (error || !account) {
      // Billing columns missing (migration 041 not applied): no banner.
      return NextResponse.json({ enabled: false });
    }

    // Best-effort: migration 102 may not be pasted into every
    // environment yet, and that must not take down the plan/usage
    // response above for accounts that don't need it.
    const { data: shopifyBilling } = await db
      .from('accounts')
      .select('install_source, shopify_pending_plan, shopify_pending_cycle')
      .eq('id', accountId)
      .maybeSingle();

    // Supabase's filter-builder generics don't survive a callback param.
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    type Query = any;
    const count = async (table: string, extra?: (q: Query) => Query) => {
      let query = db
        .from(table)
        .select('id', { count: 'exact', head: true })
        .eq('account_id', accountId);
      if (extra) query = extra(query);
      const { count: n } = await query;
      return n ?? 0;
    };
    const [flows, members, invites] = await Promise.all([
      count('flows'),
      count('profiles'),
      count('account_invitations', (q) =>
        q.is('accepted_at', null).gt('expires_at', new Date().toISOString())
      ),
    ]);

    const effective = effectivePlan(account as AccountBilling);
    const usage: Record<LimitKey, number> = {
      chatbot_flows: flows,
      team_members: members + invites,
    };

    return NextResponse.json({
      enabled: true,
      plan: account.plan,
      effective_plan: effective,
      trial_ends_at: account.trial_ends_at,
      plan_expires_at: account.plan_expires_at,
      limits: PLAN_LIMITS[effective],
      usage,
      role: ctx.role,
      bills_through_shopify: billsThroughShopify(shopifyBilling?.install_source),
      shopify_pending_plan: shopifyBilling?.shopify_pending_plan ?? null,
      shopify_pending_cycle: shopifyBilling?.shopify_pending_cycle ?? null,
    });
  } catch (err) {
    return toErrorResponse(err);
  }
}
