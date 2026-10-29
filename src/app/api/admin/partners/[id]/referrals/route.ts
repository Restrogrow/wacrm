import { NextResponse } from 'next/server';

import { requirePlatformAdmin } from '@/lib/auth/platform-admin';
import { supabaseAdmin } from '@/lib/flows/admin-client';

/**
 * Platform admin: credit an account to this partner by hand, or remove it.
 *
 *   POST   { account } — account id, or the owner's email
 *   DELETE ?account_id=…
 */
const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

async function findAccountId(raw: string): Promise<string | null> {
  const db = supabaseAdmin();
  if (UUID_RE.test(raw)) {
    const { data } = await db.from('accounts').select('id').eq('id', raw).maybeSingle();
    return data?.id ?? null;
  }
  const { data } = await db
    .from('profiles')
    .select('account_id, account_role')
    .ilike('email', raw)
    .limit(5);
  const owner = (data ?? []).find((p) => p.account_role === 'owner') ?? data?.[0];
  return owner?.account_id ?? null;
}

export async function POST(request: Request, { params }: { params: Promise<{ id: string }> }) {
  await requirePlatformAdmin();
  const { id } = await params;
  const body = (await request.json().catch(() => null)) as { account?: unknown } | null;
  const raw = typeof body?.account === 'string' ? body.account.trim() : '';
  if (!raw) return NextResponse.json({ error: 'Enter an account id or owner email' }, { status: 400 });

  const accountId = await findAccountId(raw);
  if (!accountId) return NextResponse.json({ error: 'No account found' }, { status: 404 });

  const db = supabaseAdmin();
  const { data: existing } = await db
    .from('partner_referrals')
    .select('partner:partners(name)')
    .eq('account_id', accountId)
    .maybeSingle();
  if (existing) {
    const p = Array.isArray(existing.partner) ? existing.partner[0] : existing.partner;
    return NextResponse.json(
      { error: `This account is already credited to ${(p as { name?: string } | null)?.name ?? 'another partner'}` },
      { status: 409 }
    );
  }

  const { error } = await db
    .from('partner_referrals')
    .insert({ partner_id: id, account_id: accountId, source: 'admin' });
  if (error) {
    console.error('[admin/partners] referral insert failed:', error.message);
    return NextResponse.json({ error: 'Could not add' }, { status: 500 });
  }
  return NextResponse.json({ ok: true });
}

export async function DELETE(request: Request, { params }: { params: Promise<{ id: string }> }) {
  await requirePlatformAdmin();
  const { id } = await params;
  const accountId = new URL(request.url).searchParams.get('account_id') ?? '';
  if (!UUID_RE.test(accountId)) return NextResponse.json({ error: 'Invalid account' }, { status: 400 });

  const { error } = await supabaseAdmin()
    .from('partner_referrals')
    .delete()
    .eq('partner_id', id)
    .eq('account_id', accountId);
  if (error) {
    console.error('[admin/partners] referral delete failed:', error.message);
    return NextResponse.json({ error: 'Could not remove' }, { status: 500 });
  }
  return NextResponse.json({ ok: true });
}
