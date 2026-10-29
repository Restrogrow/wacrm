// ============================================================
// Partner program — database side (server only, service role).
// Rules live in ./program.ts; tables in migration 092.
// ============================================================

import { supabaseAdmin } from '@/lib/flows/admin-client';
import { isEmailConfigured, sendEmail } from '@/lib/email/mailer';
import { brandedEmailHtml, brandedEmailText, type BrandedEmailInput } from '@/lib/email/branded';
import { SITE_URL } from '@/lib/seo';
import {
  CLAIM_WINDOW_DAYS,
  commissionFor,
  earningsSummary,
  formatInr,
  suggestCode,
  withinCommissionWindow,
  type PartnerStatus,
} from './program';

export interface PartnerRow {
  id: string;
  user_id: string;
  code: string;
  status: PartnerStatus;
  name: string;
  email: string | null;
  phone: string | null;
  company: string | null;
  website: string | null;
  pitch: string | null;
  commission_rate: number;
  payout_method: string | null;
  payout_details: string | null;
  admin_note: string | null;
  clicks: number;
  created_at: string;
  approved_at: string | null;
}

export interface CommissionRow {
  id: string;
  partner_id: string;
  account_id: string | null;
  payment_amount: number | null;
  rate: number | null;
  amount: number;
  description: string | null;
  status: 'pending' | 'paid' | 'void';
  payout_id: string | null;
  created_at: string;
}

export interface PayoutRow {
  id: string;
  partner_id: string;
  amount: number;
  method: string | null;
  reference: string | null;
  note: string | null;
  paid_at: string;
}

export interface ReferralView {
  account_id: string;
  business: string;
  source: 'link' | 'admin';
  referred_at: string;
  plan: string;
  paying: boolean;
  earned: number;
}

const PARTNER_COLUMNS =
  'id, user_id, code, status, name, email, phone, company, website, pitch, commission_rate, payout_method, payout_details, admin_note, clicks, created_at, approved_at';

const num = (v: unknown) => Number(v) || 0;

function toPartner(row: Record<string, unknown>): PartnerRow {
  return { ...(row as unknown as PartnerRow), commission_rate: num(row.commission_rate), clicks: num(row.clicks) };
}

export async function getPartnerByUser(userId: string): Promise<PartnerRow | null> {
  const { data, error } = await supabaseAdmin()
    .from('partners')
    .select(PARTNER_COLUMNS)
    .eq('user_id', userId)
    .maybeSingle();
  if (error) throw new Error(`partner lookup failed: ${error.message}`);
  return data ? toPartner(data) : null;
}

export async function getPartner(id: string): Promise<PartnerRow | null> {
  const { data, error } = await supabaseAdmin()
    .from('partners')
    .select(PARTNER_COLUMNS)
    .eq('id', id)
    .maybeSingle();
  if (error) throw new Error(`partner lookup failed: ${error.message}`);
  return data ? toPartner(data) : null;
}

export interface Application {
  name: string;
  email: string | null;
  phone: string;
  company: string | null;
  website: string | null;
  pitch: string;
  payout_method: string | null;
  payout_details: string | null;
}

/** Creates the partner row with a free referral code (status pending). */
export async function createApplication(userId: string, app: Application): Promise<PartnerRow> {
  const db = supabaseAdmin();
  for (let attempt = 0; attempt < 5; attempt++) {
    const { data, error } = await db
      .from('partners')
      .insert({ user_id: userId, code: suggestCode(app.name), ...app })
      .select(PARTNER_COLUMNS)
      .single();
    if (!error) {
      void notifyTeamOfApplication(toPartner(data));
      return toPartner(data);
    }
    // 23505 on code: try another suffix. On user_id: they already applied.
    if (error.code !== '23505' || /user_id/.test(error.message)) {
      throw new Error(`partner apply failed: ${error.message}`);
    }
  }
  throw new Error('partner apply failed: no free referral code');
}

async function mail(to: string[], subject: string, body: Omit<BrandedEmailInput, 'reason'>) {
  if (!isEmailConfigured() || to.length === 0) return;
  const input: BrandedEmailInput = {
    ...body,
    reason: 'You get this email because you are part of the Repeat Grow partner program.',
  };
  try {
    await sendEmail({ to, subject, html: brandedEmailHtml(input), text: brandedEmailText(input) });
  } catch (err) {
    console.warn('[partners] email not sent:', err instanceof Error ? err.message : err);
  }
}

function teamRecipients(): string[] {
  return (process.env.PARTNER_TEAM_EMAIL || process.env.DEMO_REQUEST_EMAIL || 'sales@repeatgrow.com')
    .split(',')
    .map((s) => s.trim())
    .filter(Boolean);
}

async function notifyTeamOfApplication(p: PartnerRow) {
  await mail(teamRecipients(), `New partner application: ${p.name}`, {
    preheader: `${p.name} wants to join the partner program.`,
    eyebrow: 'Partner program',
    title: 'New partner application',
    intro: 'Review it and approve or reject in the admin panel.',
    rows: [
      { label: 'Name', value: p.name },
      { label: 'Company', value: p.company || '—' },
      { label: 'Phone', value: p.phone || '—' },
      { label: 'Email', value: p.email || '—' },
      { label: 'How they will find clients', value: p.pitch || '—' },
    ],
    buttons: [{ label: 'Review application', href: `${SITE_URL}/admin/partners/${p.id}` }],
  });
}

export async function notifyPartnerOfStatus(p: PartnerRow) {
  if (!p.email || (p.status !== 'approved' && p.status !== 'rejected')) return;
  const approved = p.status === 'approved';
  await mail([p.email], approved ? 'You are now a Repeat Grow partner' : 'Your Repeat Grow partner application', {
    preheader: approved ? 'Your referral link is ready.' : 'An update on your application.',
    eyebrow: 'Partner program',
    title: approved ? 'Welcome to the partner program' : 'About your application',
    intro: approved
      ? `You earn ${p.commission_rate}% of what your clients pay. Share your link and track every signup and payout from your partner page.`
      : 'Thank you for applying. We are not able to approve your application right now. Reply to this email if you have questions.',
    rows: approved ? [{ label: 'Your link', value: `${SITE_URL}/r/${p.code}` }] : undefined,
    buttons: approved ? [{ label: 'Open partner page', href: `${SITE_URL}/partner` }] : undefined,
  });
}

/**
 * Credits the signed-in user's account to the partner whose link they
 * came through. Only the owner of a new account (CLAIM_WINDOW_DAYS),
 * only once, never a partner's own account.
 */
export async function claimReferral(
  userId: string,
  code: string
): Promise<{ ok: boolean; reason?: string }> {
  const db = supabaseAdmin();
  const { data: partner } = await db
    .from('partners')
    .select('id, user_id, status')
    .eq('code', code)
    .maybeSingle();
  if (!partner || partner.status !== 'approved') return { ok: false, reason: 'unknown_code' };
  if (partner.user_id === userId) return { ok: false, reason: 'self' };

  const { data: account } = await db
    .from('accounts')
    .select('id, created_at')
    .eq('owner_user_id', userId)
    .maybeSingle();
  if (!account) return { ok: false, reason: 'not_owner' };
  const ageDays = (Date.now() - new Date(account.created_at).getTime()) / 86_400_000;
  if (ageDays > CLAIM_WINDOW_DAYS) return { ok: false, reason: 'too_old' };

  // The partner must not be a member of the account they're credited with.
  const { count } = await db
    .from('profiles')
    .select('user_id', { count: 'exact', head: true })
    .eq('account_id', account.id)
    .eq('user_id', partner.user_id);
  if ((count ?? 0) > 0) return { ok: false, reason: 'self' };

  const { error } = await db
    .from('partner_referrals')
    .insert({ partner_id: partner.id, account_id: account.id, source: 'link' });
  if (error) {
    if (error.code === '23505') return { ok: false, reason: 'already_referred' };
    throw new Error(`referral claim failed: ${error.message}`);
  }
  return { ok: true };
}

/**
 * Called when an admin records money received from an account. If the
 * account was referred by an active partner within the commission
 * window, records the partner's share. Returns what was recorded.
 */
export async function recordPaymentCommission(args: {
  accountId: string;
  paymentAmount: number;
  description: string;
  adminUserId: string;
}): Promise<{ partnerName: string; amount: number } | null> {
  const db = supabaseAdmin();
  const { data: ref } = await db
    .from('partner_referrals')
    .select('created_at, partner:partners(id, name, status, commission_rate)')
    .eq('account_id', args.accountId)
    .maybeSingle();
  const partner = (Array.isArray(ref?.partner) ? ref?.partner[0] : ref?.partner) as
    | { id: string; name: string; status: string; commission_rate: number }
    | undefined;
  if (!ref || !partner || partner.status !== 'approved') return null;
  if (!withinCommissionWindow(ref.created_at)) return null;

  const rate = num(partner.commission_rate);
  const amount = commissionFor(args.paymentAmount, rate);
  if (amount <= 0) return null;

  const { error } = await db.from('partner_commissions').insert({
    partner_id: partner.id,
    account_id: args.accountId,
    payment_amount: args.paymentAmount,
    rate,
    amount,
    description: args.description,
    created_by: args.adminUserId,
  });
  if (error) throw new Error(`commission insert failed: ${error.message}`);
  return { partnerName: partner.name, amount };
}

/** Referrals with business name, plan and what each earned so far. */
export async function loadReferrals(partnerId: string, commissions: CommissionRow[]): Promise<ReferralView[]> {
  const db = supabaseAdmin();
  const { data: refs } = await db
    .from('partner_referrals')
    .select('account_id, source, created_at')
    .eq('partner_id', partnerId)
    .order('created_at', { ascending: false });
  if (!refs?.length) return [];

  const { data: accounts } = await db
    .from('accounts')
    .select('id, name, plan, plan_expires_at')
    .in('id', refs.map((r) => r.account_id));
  const byId = new Map((accounts ?? []).map((a) => [a.id, a]));

  const earned = new Map<string, number>();
  for (const c of commissions) {
    if (c.account_id && c.status !== 'void') earned.set(c.account_id, (earned.get(c.account_id) ?? 0) + num(c.amount));
  }

  return refs.map((r) => {
    const a = byId.get(r.account_id);
    const paying =
      !!a && a.plan !== 'trial' && (!a.plan_expires_at || new Date(a.plan_expires_at) > new Date());
    return {
      account_id: r.account_id,
      business: a?.name || 'Business',
      source: r.source,
      referred_at: r.created_at,
      plan: a ? (paying ? a.plan : a.plan === 'trial' ? 'trial' : 'expired') : 'deleted',
      paying,
      earned: Math.round((earned.get(r.account_id) ?? 0) * 100) / 100,
    };
  });
}

export async function loadPartnerLedger(partnerId: string) {
  const db = supabaseAdmin();
  const [{ data: commissions }, { data: payouts }] = await Promise.all([
    db
      .from('partner_commissions')
      .select('id, partner_id, account_id, payment_amount, rate, amount, description, status, payout_id, created_at')
      .eq('partner_id', partnerId)
      .order('created_at', { ascending: false })
      .limit(500),
    db
      .from('partner_payouts')
      .select('id, partner_id, amount, method, reference, note, paid_at')
      .eq('partner_id', partnerId)
      .order('paid_at', { ascending: false })
      .limit(200),
  ]);
  const c = (commissions ?? []).map((r) => ({
    ...r,
    amount: num(r.amount),
    payment_amount: r.payment_amount == null ? null : num(r.payment_amount),
    rate: r.rate == null ? null : num(r.rate),
  })) as CommissionRow[];
  const p = (payouts ?? []).map((r) => ({ ...r, amount: num(r.amount) })) as PayoutRow[];
  const referrals = await loadReferrals(partnerId, c);
  return {
    commissions: c,
    payouts: p,
    referrals,
    earnings: earningsSummary(c),
  };
}

/** Marks every pending commission paid under one payout. */
export async function payOutPending(args: {
  partnerId: string;
  method: string | null;
  reference: string | null;
  note: string | null;
  adminUserId: string;
}): Promise<{ amount: number; count: number } | null> {
  const db = supabaseAdmin();
  const { data: pending, error } = await db
    .from('partner_commissions')
    .select('id, amount')
    .eq('partner_id', args.partnerId)
    .eq('status', 'pending');
  if (error) throw new Error(`payout load failed: ${error.message}`);
  if (!pending?.length) return null;

  const amount = Math.round(pending.reduce((s, r) => s + num(r.amount), 0) * 100) / 100;
  const { data: payout, error: payErr } = await db
    .from('partner_payouts')
    .insert({
      partner_id: args.partnerId,
      amount,
      method: args.method,
      reference: args.reference,
      note: args.note,
      created_by: args.adminUserId,
    })
    .select('id')
    .single();
  if (payErr) throw new Error(`payout insert failed: ${payErr.message}`);

  const { error: updErr } = await db
    .from('partner_commissions')
    .update({ status: 'paid', payout_id: payout.id })
    .in('id', pending.map((r) => r.id))
    .eq('status', 'pending');
  if (updErr) throw new Error(`payout mark failed: ${updErr.message}`);

  const partner = await getPartner(args.partnerId);
  if (partner?.email) {
    await mail([partner.email], `Payout sent: ${formatInr(amount)}`, {
      preheader: `We sent you ${formatInr(amount)}.`,
      eyebrow: 'Partner program',
      title: `${formatInr(amount)} is on its way`,
      intro: 'Thank you for bringing businesses to Repeat Grow.',
      rows: [
        { label: 'Amount', value: formatInr(amount) },
        { label: 'Method', value: args.method || '—' },
        { label: 'Reference', value: args.reference || '—' },
      ],
      buttons: [{ label: 'Open partner page', href: `${SITE_URL}/partner` }],
    });
  }
  return { amount, count: pending.length };
}

export interface PartnerListItem extends PartnerRow {
  referrals: number;
  paying: number;
  pending: number;
  paid: number;
}

/** Admin list: every partner with referral and money totals. */
export async function listPartners(): Promise<PartnerListItem[]> {
  const db = supabaseAdmin();
  const [{ data: partners }, { data: refs }, { data: comms }] = await Promise.all([
    db.from('partners').select(PARTNER_COLUMNS).order('created_at', { ascending: false }),
    db.from('partner_referrals').select('partner_id, account:accounts(plan, plan_expires_at)'),
    db.from('partner_commissions').select('partner_id, amount, status').neq('status', 'void'),
  ]);
  const now = new Date();
  const stats = new Map<string, { referrals: number; paying: number; pending: number; paid: number }>();
  const get = (id: string) => {
    let s = stats.get(id);
    if (!s) stats.set(id, (s = { referrals: 0, paying: 0, pending: 0, paid: 0 }));
    return s;
  };
  for (const r of refs ?? []) {
    const s = get(r.partner_id);
    s.referrals++;
    const a = (Array.isArray(r.account) ? r.account[0] : r.account) as
      | { plan: string; plan_expires_at: string | null }
      | undefined;
    if (a && a.plan !== 'trial' && (!a.plan_expires_at || new Date(a.plan_expires_at) > now)) s.paying++;
  }
  for (const c of comms ?? []) {
    const s = get(c.partner_id);
    if (c.status === 'pending') s.pending += num(c.amount);
    else s.paid += num(c.amount);
  }
  return (partners ?? []).map((p) => ({
    ...toPartner(p),
    ...(stats.get(p.id) ?? { referrals: 0, paying: 0, pending: 0, paid: 0 }),
  }));
}

/** Which partner referred an account (for the admin account page). */
export async function getReferrerOf(accountId: string): Promise<{ id: string; name: string; code: string } | null> {
  const { data } = await supabaseAdmin()
    .from('partner_referrals')
    .select('partner:partners(id, name, code)')
    .eq('account_id', accountId)
    .maybeSingle();
  const p = Array.isArray(data?.partner) ? data?.partner[0] : data?.partner;
  return (p as { id: string; name: string; code: string } | undefined) ?? null;
}
