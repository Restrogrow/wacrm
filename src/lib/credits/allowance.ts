// ============================================================
// The monthly plan allowance — run from /api/automations/cron.
//
// Each account gets its plan's included credits once per IST calendar
// month. Idempotent on (plan, month) in the ledger, so the cron can
// run every minute and only the first call in a month grants.
//
// Driven by the cron rather than by someone signing in: an account
// nobody logs into still has customers writing to it, and its chatbot
// should keep answering.
//
// A plan change mid-month grants the new plan's allowance too, because
// the key includes the plan. That is deliberate — an upgrade should
// take effect at once — and it is why the amounts are an *include*
// rather than a balance reset.
// ============================================================

import { effectivePlan, type AccountPlan } from '@/lib/billing/plans';
import { supabaseAdmin } from '@/lib/flows/admin-client';

import { allowanceKey, istMonthKey } from './credits';
import { grantMonthlyAllowance } from './server';

/** Accounts looked at per run. Idempotent, so a backlog just drains. */
const MAX_ACCOUNTS_PER_RUN = 200;

interface AccountRow {
  id: string;
  /**
   * What the column actually holds. 'expired' is never stored — it is
   * derived from the dates by effectivePlan().
   */
  plan: AccountPlan;
  trial_ends_at: string | null;
  plan_expires_at: string | null;
}

/** Returns how many accounts were granted credits. */
export async function processCreditAllowances(): Promise<number> {
  const db = supabaseAdmin();
  const { data, error } = await db
    .from('accounts')
    .select('id, plan, trial_ends_at, plan_expires_at')
    .order('created_at', { ascending: true })
    .limit(MAX_ACCOUNTS_PER_RUN);
  if (error || !data) {
    // Nothing to do rather than noisy: a missing column means the
    // billing migrations are not applied on this deployment.
    return 0;
  }

  const rows = data as AccountRow[];
  const monthKey = istMonthKey();
  const now = Date.now();

  const wanted = rows.map((row) => ({
    row,
    plan: effectivePlan(
      {
        plan: row.plan,
        trial_ends_at: row.trial_ends_at,
        plan_expires_at: row.plan_expires_at,
      },
      now
    ),
  }));

  // Which of them already have this month's allowance. credit_add is
  // idempotent, so skipping is not what makes this correct — it is what
  // keeps the run from firing 200 pointless RPCs a minute and reporting
  // "200 granted" in the heartbeat every time.
  const { data: existing } = await db
    .from('credit_ledger')
    .select('account_id, idempotency_key')
    .in(
      'account_id',
      rows.map((r) => r.id)
    )
    .like('idempotency_key', `allowance:%:${monthKey}`);
  const done = new Set(
    (existing ?? []).map(
      (e) =>
        `${(e as { account_id: string }).account_id}|${(e as { idempotency_key: string }).idempotency_key}`
    )
  );

  let granted = 0;
  for (const { row, plan } of wanted) {
    if (done.has(`${row.id}|${allowanceKey(plan, monthKey)}`)) continue;
    try {
      // Null means an expired plan (no allowance) or a failed write,
      // both already handled downstream.
      if ((await grantMonthlyAllowance(row.id, plan, monthKey)) !== null) {
        granted++;
      }
    } catch (err) {
      console.error(
        '[credits] allowance failed for',
        row.id,
        err instanceof Error ? err.message : err
      );
    }
  }
  return granted;
}
