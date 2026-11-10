// ============================================================
// "Your AI credits are running low" — run from /api/automations/cron.
//
// Credit enforcement is on for every account, so a balance reaching
// zero silences the AI. Without this the first sign would be the
// chatbot going quiet, which looks like an outage and arrives with no
// chance to top up first.
//
// Warned once per descent, not once per spend: `low_warned_at` is
// stamped when the notification goes out and cleared by credit_add(),
// so topping up re-arms it and a quiet month does not nag.
//
// Runs from the cron rather than inside spendCredits() because that is
// the hot path — every chatbot reply goes through it, and none of them
// should pay for a balance sweep.
// ============================================================

import { effectivePlan, type AccountPlan } from '@/lib/billing/plans';
import { supabaseAdmin } from '@/lib/flows/admin-client';

import { balanceWarning, balanceWarningMessage, planMonthlyCredits } from './credits';

/** Accounts warned per run. Far above the real count; a cap, not a plan. */
const MAX_PER_RUN = 100;

interface Row {
  account_id: string;
  balance: number;
  accounts: {
    credits_enforced: boolean;
    plan: AccountPlan;
    trial_ends_at: string | null;
    plan_expires_at: string | null;
  } | null;
}

/** Returns how many accounts were warned. */
export async function processLowBalanceWarnings(): Promise<number> {
  const db = supabaseAdmin();

  // Only rows that can still produce a warning — `low_warned_at` is
  // the "already told them" marker, and the partial index in migration
  // 101 covers exactly this.
  const { data, error } = await db
    .from('account_credits')
    .select(
      'account_id, balance, accounts!inner(credits_enforced, plan, trial_ends_at, plan_expires_at)'
    )
    .is('low_warned_at', null)
    .order('balance', { ascending: true })
    .limit(MAX_PER_RUN);
  if (error || !data || data.length === 0) {
    // Migration 100/101 not applied: nothing to do, quietly.
    return 0;
  }

  const now = Date.now();
  const rows = data as unknown as Row[];
  const due: { accountId: string; balance: number; warning: 'low' | 'out' }[] = [];

  for (const row of rows) {
    const account = row.accounts;
    // With enforcement off the balance can go negative and means
    // nothing — warning about it would be noise about a limit that is
    // not being applied.
    if (!account?.credits_enforced) continue;

    const plan = effectivePlan(
      {
        plan: account.plan,
        trial_ends_at: account.trial_ends_at,
        plan_expires_at: account.plan_expires_at,
      },
      now
    );
    // An ended plan already has every AI daily cap at zero, so its AI is
    // off for a reason that has nothing to do with credits. Telling them
    // to top up would point at the wrong thing.
    if (plan === 'expired') continue;

    const warning = balanceWarning(Number(row.balance), planMonthlyCredits(plan));
    if (warning === 'none') continue;
    due.push({ accountId: row.account_id, balance: Number(row.balance), warning });
  }
  if (due.length === 0) return 0;

  // Who to tell: whoever can act on it.
  const { data: admins } = await db
    .from('profiles')
    .select('user_id, account_id')
    .in('account_id', due.map((d) => d.accountId))
    .in('account_role', ['owner', 'admin']);

  const byAccount = new Map<string, string[]>();
  for (const p of admins ?? []) {
    const key = (p as { account_id: string }).account_id;
    const list = byAccount.get(key) ?? [];
    list.push((p as { user_id: string }).user_id);
    byAccount.set(key, list);
  }

  let warned = 0;
  for (const item of due) {
    const recipients = byAccount.get(item.accountId) ?? [];
    if (recipients.length === 0) continue;

    // Claim before notifying, guarded on the marker still being unset,
    // so two overlapping cron runs cannot both warn.
    const { data: claimed, error: claimErr } = await db
      .from('account_credits')
      .update({ low_warned_at: new Date().toISOString() })
      .eq('account_id', item.accountId)
      .is('low_warned_at', null)
      .select('account_id')
      .maybeSingle();
    if (claimErr || !claimed) continue;

    const { title, body } = balanceWarningMessage(item.warning, item.balance);
    const { error: notifyErr } = await db.from('notifications').insert(
      recipients.map((userId) => ({
        account_id: item.accountId,
        user_id: userId,
        type: 'credits_low',
        title,
        body,
      }))
    );
    if (notifyErr) {
      // Put the marker back. The claim has to happen before the insert
      // to keep two cron runs from both warning, but leaving it set
      // after a failed insert would mark the account as warned when
      // nobody was told — and it would never be warned again.
      //
      // Reachable: migration 101 widens the `notifications` type
      // constraint, and until it is applied every insert here fails the
      // CHECK (23514). Without this the first sweep would silently burn
      // the one warning each account gets.
      console.error('[credits] low-balance notification failed:', notifyErr.message);
      await db
        .from('account_credits')
        .update({ low_warned_at: null })
        .eq('account_id', item.accountId);
      continue;
    }
    warned++;
  }
  return warned;
}
