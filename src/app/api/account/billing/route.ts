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
    const monthStart = new Date();
    monthStart.setUTCDate(1);
    monthStart.setUTCHours(0, 0, 0, 0);

    const [
      contacts,
      broadcasts,
      flows,
      automations,
      customFields,
      members,
      invites,
    ] = await Promise.all([
      count('contacts'),
      count('broadcasts', (q) => q.gte('created_at', monthStart.toISOString())),
      count('flows'),
      count('automations'),
      count('custom_fields'),
      count('profiles'),
      count('account_invitations', (q) =>
        q.is('accepted_at', null).gt('expires_at', new Date().toISOString())
      ),
    ]);

    const effective = effectivePlan(account as AccountBilling);
    const usage: Record<LimitKey, number> = {
      contacts,
      broadcasts_per_month: broadcasts,
      automation_flows: flows + automations,
      custom_fields: customFields,
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
    });
  } catch (err) {
    return toErrorResponse(err);
  }
}
