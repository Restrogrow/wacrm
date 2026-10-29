import { NextResponse } from 'next/server';

import { requirePlatformAdmin } from '@/lib/auth/platform-admin';
import { supabaseAdmin } from '@/lib/flows/admin-client';

/**
 * Platform admin: commissions for one partner.
 *
 *   POST  { amount, description, account_id? } — add one by hand (bonus,
 *         correction, a payment recorded outside the plan editor)
 *   PATCH { commission_id, status: 'void' | 'pending' } — cancel one
 *         (refund) or restore it. Paid commissions can't be changed.
 */
export async function POST(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const admin = await requirePlatformAdmin();
  const { id } = await params;
  const body = ((await request.json().catch(() => null)) ?? {}) as Record<string, unknown>;

  const amount = Math.round(Number(body.amount) * 100) / 100;
  if (!(amount > 0) || amount > 10_000_000) {
    return NextResponse.json({ error: 'Enter an amount above ₹0' }, { status: 400 });
  }
  const description =
    typeof body.description === 'string' && body.description.trim()
      ? body.description.trim().slice(0, 300)
      : 'Added by Repeat Grow';
  const accountId = typeof body.account_id === 'string' && body.account_id ? body.account_id : null;

  const { error } = await supabaseAdmin().from('partner_commissions').insert({
    partner_id: id,
    account_id: accountId,
    amount,
    description,
    created_by: admin.userId,
  });
  if (error) {
    console.error('[admin/partners] commission insert failed:', error.message);
    return NextResponse.json({ error: 'Could not add' }, { status: 500 });
  }
  return NextResponse.json({ ok: true });
}

export async function PATCH(request: Request, { params }: { params: Promise<{ id: string }> }) {
  await requirePlatformAdmin();
  const { id } = await params;
  const body = ((await request.json().catch(() => null)) ?? {}) as Record<string, unknown>;
  const status = body.status;
  if ((status !== 'void' && status !== 'pending') || typeof body.commission_id !== 'string') {
    return NextResponse.json({ error: 'Invalid request' }, { status: 400 });
  }

  const { data, error } = await supabaseAdmin()
    .from('partner_commissions')
    .update({ status })
    .eq('id', body.commission_id)
    .eq('partner_id', id)
    .neq('status', 'paid')
    .select('id');
  if (error) {
    console.error('[admin/partners] commission update failed:', error.message);
    return NextResponse.json({ error: 'Could not save' }, { status: 500 });
  }
  if (!data?.length) return NextResponse.json({ error: 'Paid commissions cannot be changed' }, { status: 409 });
  return NextResponse.json({ ok: true });
}
