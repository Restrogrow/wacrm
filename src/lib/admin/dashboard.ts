// ============================================================
// Platform admin dashboard data — server-only (service role).
//
// One pass over accounts, owners' profiles, auth users, WhatsApp
// configs, conversations and message counts, shaped into KPI tiles,
// a 30-day sign-up series, breakdowns, a funnel, and the accounts
// table. Every optional source (billing columns, integrations tables)
// degrades to "unknown" instead of failing the page.
// ============================================================

import { supabaseAdmin } from '@/lib/flows/admin-client';
import {
  isBusinessProfileComplete,
  signupProviderLabel,
} from '@/lib/auth/business-profile';
import {
  EFFECTIVE_PLAN_LABELS,
  effectivePlan,
  type AccountBilling,
  type EffectivePlan,
} from '@/lib/billing/plans';

import {
  countBetween,
  dailyCounts,
  istDaysAgo,
  istStartOfDay,
  type DayCount,
} from './time';

export interface AdminAccountRow {
  id: string;
  name: string;
  createdAt: string;
  ownerEmail: string | null;
  ownerName: string | null;
  ownerMobile: string | null;
  natureOfBusiness: string | null;
  teamSize: string | null;
  signupMethod: string;
  profileComplete: boolean;
  plan: EffectivePlan | null;
  memberCount: number;
  whatsappStatus: string;
  /** Daily WhatsApp number health (migration 049); null if never checked. */
  numberHealth: { quality: string | null; limit: string | null; canSend: string | null } | null;
  lastActivityAt: string | null;
  lastSignInAt: string | null;
}

export interface Breakdown {
  label: string;
  count: number;
}

export interface AdminDashboard {
  generatedAt: string;
  signups: {
    today: number;
    yesterday: number;
    last7: number;
    prev7: number;
    last30: number;
    prev30: number;
    total: number;
    usersToday: number;
    usersTotal: number;
  };
  daily: DayCount[];
  accounts: {
    whatsappConnected: number;
    active7: number;
    loggedInToday: number;
    paying: number;
    trial: number;
    expired: number;
    billingEnabled: boolean;
    shopify: number | null;
    calendly: number | null;
  };
  messagesToday: { inbound: number; outbound: number };
  breakdowns: {
    plan: Breakdown[];
    signupMethod: Breakdown[];
    business: Breakdown[];
    teamSize: Breakdown[];
  };
  funnel: Breakdown[];
  rows: AdminAccountRow[];
}

function tally(
  values: (string | null | undefined)[],
  fallback = 'Not set'
): Breakdown[] {
  const counts = new Map<string, number>();
  for (const v of values) {
    const key = v && v.trim() ? v : fallback;
    counts.set(key, (counts.get(key) ?? 0) + 1);
  }
  return [...counts]
    .map(([label, count]) => ({ label, count }))
    .sort((a, b) => b.count - a.count);
}

async function listAllUsers(db: ReturnType<typeof supabaseAdmin>) {
  const users: {
    id: string;
    created_at: string;
    last_sign_in_at: string | null;
    provider: string | undefined;
  }[] = [];
  for (let page = 1; ; page++) {
    const { data, error } = await db.auth.admin.listUsers({
      page,
      perPage: 1000,
    });
    if (error) {
      console.error('[admin/dashboard] listUsers failed:', error.message);
      break;
    }
    for (const u of data.users) {
      users.push({
        id: u.id,
        created_at: u.created_at,
        last_sign_in_at: u.last_sign_in_at ?? null,
        provider: u.app_metadata?.provider,
      });
    }
    if (data.users.length < 1000) break;
  }
  return users;
}

export async function loadAdminDashboard(
  now = Date.now()
): Promise<AdminDashboard> {
  const db = supabaseAdmin();
  const today = istStartOfDay(now);
  const since7 = istDaysAgo(6, now);
  const since30 = istDaysAgo(29, now);
  const nowIso = new Date(now).toISOString();

  const [
    { data: accountRows, error: accountsErr },
    { data: profiles },
    users,
    { data: waConfigs },
    { data: billingRows, error: billingErr },
    { data: activeConvs },
    { count: inboundToday },
    { count: outboundToday },
    shopify,
    calendly,
    { data: healthRows },
  ] = await Promise.all([
    db
      .from('accounts')
      .select(
        'id, name, created_at, owner_user_id, nature_of_business, team_size'
      )
      .order('created_at', { ascending: false }),
    db
      .from('profiles')
      .select('user_id, email, full_name, mobile_number, account_id'),
    listAllUsers(db),
    db.from('whatsapp_config').select('account_id, status'),
    db.from('accounts').select('id, plan, trial_ends_at, plan_expires_at'),
    db
      .from('conversations')
      .select('account_id, last_message_at')
      .not('last_message_at', 'is', null)
      .order('last_message_at', { ascending: false })
      .limit(20000),
    db
      .from('messages')
      .select('id', { count: 'exact', head: true })
      .eq('sender_type', 'customer')
      .gte('created_at', today.toISOString()),
    db
      .from('messages')
      .select('id', { count: 'exact', head: true })
      .neq('sender_type', 'customer')
      .gte('created_at', today.toISOString()),
    db
      .from('shopify_stores')
      .select('id', { count: 'exact', head: true })
      .eq('status', 'active'),
    db
      .from('calendly_connections')
      .select('id', { count: 'exact', head: true }),
    // Fails soft (null data) until migration 049 is run.
    db
      .from('whatsapp_number_health')
      .select('account_id, quality_rating, messaging_limit, can_send'),
  ]);

  if (accountsErr)
    console.error('[admin/dashboard] accounts:', accountsErr.message);
  const accounts = accountRows ?? [];

  const profileByUser = new Map(
    (profiles ?? []).map((p) => [p.user_id as string, p])
  );
  const memberCount = new Map<string, number>();
  for (const p of profiles ?? []) {
    if (p.account_id)
      memberCount.set(p.account_id, (memberCount.get(p.account_id) ?? 0) + 1);
  }
  const userById = new Map(users.map((u) => [u.id, u]));
  const waByAccount = new Map(
    (waConfigs ?? []).map((w) => [w.account_id as string, w.status as string])
  );
  const healthByAccount = new Map(
    (healthRows ?? []).map((h) => [
      h.account_id as string,
      {
        quality: (h.quality_rating as string | null) ?? null,
        limit: (h.messaging_limit as string | null) ?? null,
        canSend: (h.can_send as string | null) ?? null,
      },
    ])
  );
  const billingEnabled = !billingErr && !!billingRows;
  const planByAccount = new Map<string, EffectivePlan>(
    (billingRows ?? []).map((b) => [
      b.id as string,
      effectivePlan(b as AccountBilling, now),
    ])
  );
  const lastActivity = new Map<string, string>();
  for (const c of activeConvs ?? []) {
    const prev = lastActivity.get(c.account_id);
    if (c.last_message_at && (!prev || c.last_message_at > prev)) {
      lastActivity.set(c.account_id, c.last_message_at);
    }
  }

  const rows: AdminAccountRow[] = accounts.map((a) => {
    const owner = profileByUser.get(a.owner_user_id);
    const authUser = userById.get(a.owner_user_id);
    return {
      id: a.id,
      name: a.name,
      createdAt: a.created_at,
      ownerEmail: owner?.email ?? null,
      ownerName: owner?.full_name ?? null,
      ownerMobile: owner?.mobile_number ?? null,
      natureOfBusiness: a.nature_of_business,
      teamSize: a.team_size,
      signupMethod: signupProviderLabel(authUser?.provider),
      profileComplete: isBusinessProfileComplete({
        natureOfBusiness: a.nature_of_business,
        teamSize: a.team_size,
        mobileNumber: owner?.mobile_number ?? null,
      }),
      plan: planByAccount.get(a.id) ?? null,
      memberCount: memberCount.get(a.id) ?? 0,
      whatsappStatus: waByAccount.get(a.id) ?? 'not set up',
      numberHealth: healthByAccount.get(a.id) ?? null,
      lastActivityAt: lastActivity.get(a.id) ?? null,
      lastSignInAt: authUser?.last_sign_in_at ?? null,
    };
  });

  const created = accounts.map((a) => a.created_at as string);
  const yesterday = istDaysAgo(1, now);
  const connected = rows.filter((r) => r.whatsappStatus === 'connected').length;
  const active7 = rows.filter(
    (r) => r.lastActivityAt && Date.parse(r.lastActivityAt) >= since7.getTime()
  ).length;
  const plans = rows.map((r) => r.plan).filter((p): p is EffectivePlan => !!p);
  const paying = plans.filter(
    (p) => p === 'starter' || p === 'growth' || p === 'pro' || p === 'enterprise'
  ).length;
  const profileComplete = rows.filter((r) => r.profileComplete).length;

  return {
    generatedAt: nowIso,
    signups: {
      today: countBetween(created, today),
      yesterday: countBetween(created, yesterday, today),
      last7: countBetween(created, since7),
      prev7: countBetween(created, istDaysAgo(13, now), since7),
      last30: countBetween(created, since30),
      prev30: countBetween(created, istDaysAgo(59, now), since30),
      total: accounts.length,
      usersToday: countBetween(
        users.map((u) => u.created_at),
        today
      ),
      usersTotal: users.length,
    },
    daily: dailyCounts(created, 30, now),
    accounts: {
      whatsappConnected: connected,
      active7,
      loggedInToday: countBetween(
        users.map((u) => u.last_sign_in_at),
        today
      ),
      paying,
      trial: plans.filter((p) => p === 'trial').length,
      expired: plans.filter((p) => p === 'expired').length,
      billingEnabled,
      shopify: shopify.error ? null : (shopify.count ?? 0),
      calendly: calendly.error ? null : (calendly.count ?? 0),
    },
    messagesToday: { inbound: inboundToday ?? 0, outbound: outboundToday ?? 0 },
    breakdowns: {
      plan: billingEnabled
        ? tally(plans.map((p) => EFFECTIVE_PLAN_LABELS[p]))
        : [],
      signupMethod: tally(
        rows.map((r) => r.signupMethod),
        'Unknown'
      ),
      business: tally(rows.map((r) => r.natureOfBusiness)),
      teamSize: tally(rows.map((r) => r.teamSize)),
    },
    funnel: [
      { label: 'Signed up', count: rows.length },
      { label: 'Business details complete', count: profileComplete },
      { label: 'WhatsApp connected', count: connected },
      { label: 'Active in last 7 days', count: active7 },
      ...(billingEnabled ? [{ label: 'Paying', count: paying }] : []),
    ],
    rows,
  };
}
