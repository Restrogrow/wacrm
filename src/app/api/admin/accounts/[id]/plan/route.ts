import { NextResponse } from 'next/server';
import { recordAudit } from '@/lib/audit';
import { requirePlatformAdmin } from '@/lib/auth/platform-admin';
import { supabaseAdmin } from '@/lib/flows/admin-client';
import { recordPaymentCommission } from '@/lib/partners/server';

/**
 * PATCH /api/admin/accounts/[id]/plan — platform admin only.
 *
 * { plan, trial_ends_at?, plan_expires_at?, billing_note?, amount_received? }
 *
 * No payment gateway yet: when a business pays (UPI / bank transfer),
 * support sets their plan and paid-until date here. Dates are ISO
 * strings or null (null paid-until = no end date). `amount_received` (₹)
 * records the payment for the partner program: if a partner referred
 * this account, their commission is added (lib/partners/server.ts).
 */
const PLANS = new Set(['trial', 'starter', 'growth', 'pro', 'enterprise']);

function parseDate(value: unknown): string | null | undefined {
  if (value === undefined) return undefined;
  if (value === null || value === '') return null;
  if (typeof value !== 'string' || Number.isNaN(Date.parse(value)))
    return undefined;
  return new Date(value).toISOString();
}

export async function PATCH(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const admin = await requirePlatformAdmin();
  const { id } = await params;

  const body = (await request.json().catch(() => null)) as {
    plan?: unknown;
    trial_ends_at?: unknown;
    plan_expires_at?: unknown;
    billing_note?: unknown;
    amount_received?: unknown;
  } | null;

  if (typeof body?.plan !== 'string' || !PLANS.has(body.plan)) {
    return NextResponse.json({ error: 'Choose a valid plan' }, { status: 400 });
  }
  const trialEndsAt = parseDate(body.trial_ends_at);
  const planExpiresAt = parseDate(body.plan_expires_at);
  if (
    (body.trial_ends_at !== undefined && trialEndsAt === undefined) ||
    (body.plan_expires_at !== undefined && planExpiresAt === undefined)
  ) {
    return NextResponse.json({ error: 'Invalid date' }, { status: 400 });
  }
  const amountReceived =
    body.amount_received === undefined || body.amount_received === null || body.amount_received === ''
      ? 0
      : Number(body.amount_received);
  if (!Number.isFinite(amountReceived) || amountReceived < 0 || amountReceived > 10_000_000) {
    return NextResponse.json({ error: 'Invalid amount received' }, { status: 400 });
  }
  const note =
    typeof body.billing_note === 'string'
      ? body.billing_note.trim().slice(0, 500)
      : undefined;

  const updates: Record<string, string | null> = { plan: body.plan };
  if (trialEndsAt !== undefined) updates.trial_ends_at = trialEndsAt;
  if (planExpiresAt !== undefined) updates.plan_expires_at = planExpiresAt;
  if (note !== undefined) updates.billing_note = note || null;

  const { error } = await supabaseAdmin()
    .from('accounts')
    .update(updates)
    .eq('id', id);
  if (error) {
    console.error('[admin/plan] update failed:', error.message);
    return NextResponse.json(
      { error: 'Failed to update plan' },
      { status: 500 }
    );
  }
  await recordAudit(
    { accountId: id, actorUserId: admin.userId, action: 'plan.changed', targetType: 'account', targetId: id, metadata: { plan: body.plan, trial_ends_at: trialEndsAt ?? null, plan_expires_at: planExpiresAt ?? null, by: 'platform_admin' } },
    request
  );

  // The plan is saved either way; a failed commission is reported so it
  // can be added by hand from /admin/partners.
  let commission: { partnerName: string; amount: number } | null = null;
  let commissionError = false;
  if (amountReceived > 0) {
    try {
      commission = await recordPaymentCommission({
        accountId: id,
        paymentAmount: Math.round(amountReceived * 100) / 100,
        description: `${body.plan} plan payment${note ? ` — ${note}` : ''}`.slice(0, 300),
        adminUserId: admin.userId,
      });
    } catch (err) {
      console.error('[admin/plan] commission failed:', err);
      commissionError = true;
    }
  }
  return NextResponse.json({ ok: true, commission, commissionError });
}
