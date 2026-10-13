// ============================================================
// Daily email summary — server-only.
//
// processDailySummaries() runs from the every-minute automations cron:
// for each account that switched it on (migration 044) and whose
// chosen IST hour is now, it claims today's send (summary_last_sent_on)
// and emails the numbers to the chosen recipients (or the owner).
// sendSummaryNow() powers "Send me a test now" in Settings.
// ============================================================

import { supabaseAdmin } from '@/lib/flows/admin-client';
import { publicOrigin } from '@/lib/public-origin';
import { isEmailConfigured, sendEmail } from '@/lib/email/mailer';
import { formatCurrency } from '@/lib/currency';
import { istDayKey } from '@/lib/admin/time';

import {
  renderSummaryEmail,
  summaryWindow,
  type SummaryStats,
  type SummaryWindow,
} from './report';

type Db = ReturnType<typeof supabaseAdmin>;

async function countRows(
  query: PromiseLike<{ count: number | null; error: unknown }>
): Promise<number> {
  const { count, error } = await query;
  return error ? 0 : (count ?? 0);
}

export async function computeSummaryStats(
  db: Db,
  accountId: string,
  window: SummaryWindow,
  currency: string
): Promise<SummaryStats> {
  const from = window.from.toISOString();
  const to = window.to.toISOString();
  const head = { count: 'exact' as const, head: true };

  const [
    messagesReceived,
    messagesSent,
    newContacts,
    newConversations,
    awaitingReply,
    broadcastsSent,
    dealsCreated,
    optOuts,
    { data: wonDeals },
  ] = await Promise.all([
    countRows(
      db
        .from('messages')
        .select('id, conversations!inner(account_id)', head)
        .eq('conversations.account_id', accountId)
        .eq('sender_type', 'customer')
        .gte('created_at', from)
        .lt('created_at', to)
    ),
    countRows(
      db
        .from('messages')
        .select('id, conversations!inner(account_id)', head)
        .eq('conversations.account_id', accountId)
        .neq('sender_type', 'customer')
        .gte('created_at', from)
        .lt('created_at', to)
    ),
    countRows(
      db
        .from('contacts')
        .select('id', head)
        .eq('account_id', accountId)
        .gte('created_at', from)
        .lt('created_at', to)
    ),
    countRows(
      db
        .from('conversations')
        .select('id', head)
        .eq('account_id', accountId)
        .gte('created_at', from)
        .lt('created_at', to)
    ),
    countRows(
      db
        .from('conversations')
        .select('id', head)
        .eq('account_id', accountId)
        .gt('unread_count', 0)
    ),
    countRows(
      db
        .from('broadcasts')
        .select('id', head)
        .eq('account_id', accountId)
        .in('status', ['sending', 'sent'])
        .gte('created_at', from)
        .lt('created_at', to)
    ),
    countRows(
      db
        .from('deals')
        .select('id', head)
        .eq('account_id', accountId)
        .gte('created_at', from)
        .lt('created_at', to)
    ),
    countRows(
      db
        .from('contacts')
        .select('id', head)
        .eq('account_id', accountId)
        .gte('opted_out_at', from)
        .lt('opted_out_at', to)
    ),
    db
      .from('deals')
      .select('value')
      .eq('account_id', accountId)
      .eq('status', 'won')
      .gte('updated_at', from)
      .lt('updated_at', to),
  ]);

  const won = (wonDeals ?? []) as { value: number | string | null }[];
  const wonValue = won.reduce((sum, d) => sum + (Number(d.value) || 0), 0);

  return {
    messagesReceived,
    messagesSent,
    newContacts,
    newConversations,
    awaitingReply,
    broadcastsSent,
    dealsCreated,
    dealsWon: won.length,
    dealsWonValue: won.length > 0 ? formatCurrency(wonValue, currency) : null,
    optOuts,
  };
}

interface SummaryAccount {
  id: string;
  name: string;
  owner_user_id: string;
  default_currency: string | null;
  summary_hour: number;
  summary_emails: string[] | null;
}

const ACCOUNT_COLUMNS =
  'id, name, owner_user_id, default_currency, summary_hour, summary_emails';

async function recipientsFor(
  db: Db,
  account: SummaryAccount
): Promise<string[]> {
  const chosen = (account.summary_emails ?? []).filter(Boolean);
  if (chosen.length > 0) return chosen;
  const { data } = await db
    .from('profiles')
    .select('email')
    .eq('user_id', account.owner_user_id)
    .maybeSingle();
  return data?.email ? [data.email] : [];
}

async function sendFor(db: Db, account: SummaryAccount, hourIst: number) {
  const to = await recipientsFor(db, account);
  if (to.length === 0)
    throw new Error('No email address to send the summary to');
  const window = summaryWindow(hourIst);
  const stats = await computeSummaryStats(
    db,
    account.id,
    window,
    account.default_currency || 'INR'
  );
  const email = renderSummaryEmail({
    accountName: account.name,
    window,
    stats,
    appUrl: publicOrigin(),
  });
  await sendEmail({ to, ...email });
  return to;
}

/** Settings → "Send me a test now". Returns who it went to. */
export async function sendSummaryNow(accountId: string): Promise<string[]> {
  const db = supabaseAdmin();
  const { data: account, error } = await db
    .from('accounts')
    .select(ACCOUNT_COLUMNS)
    .eq('id', accountId)
    .maybeSingle<SummaryAccount>();
  if (error || !account)
    throw new Error('Daily summary is not set up (run migration 044)');
  return sendFor(db, account, account.summary_hour);
}

/** Cron: send every summary that's due this hour (IST). Returns how many went out. */
export async function processDailySummaries(): Promise<number> {
  if (!isEmailConfigured()) return 0;
  const db = supabaseAdmin();
  const now = Date.now();
  const hourIst = new Date(now + 5.5 * 3600_000).getUTCHours();
  const todayIst = istDayKey(now);

  const { data: due, error } = await db
    .from('accounts')
    .select(ACCOUNT_COLUMNS)
    .eq('summary_enabled', true)
    .eq('summary_hour', hourIst)
    .or(`summary_last_sent_on.is.null,summary_last_sent_on.lt.${todayIst}`)
    .limit(50);
  if (error || !due) return 0; // migration 044 missing, or nothing due

  let sent = 0;
  for (const account of due as SummaryAccount[]) {
    // Claim today's send first so an overlapping cron run can't repeat it.
    const { data: claimed } = await db
      .from('accounts')
      .update({ summary_last_sent_on: todayIst })
      .eq('id', account.id)
      .or(`summary_last_sent_on.is.null,summary_last_sent_on.lt.${todayIst}`)
      .select('id')
      .maybeSingle();
    if (!claimed) continue;
    try {
      await sendFor(db, account, hourIst);
      sent++;
    } catch (err) {
      console.error(
        `[daily-summary] ${account.id} failed:`,
        err instanceof Error ? err.message : err
      );
    }
  }
  return sent;
}
