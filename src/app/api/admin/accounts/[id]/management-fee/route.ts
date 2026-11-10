import { NextResponse } from 'next/server';

import { recordAudit } from '@/lib/audit';
import { loadMonthlyFee } from '@/lib/billing/management-fee-server';
import { parseMonth } from '@/lib/billing/management-fee';
import { requirePlatformAdmin } from '@/lib/auth/platform-admin';
import { supabaseAdmin } from '@/lib/flows/admin-client';

/**
 * GET  /api/admin/accounts/[id]/management-fee?month=YYYY-MM
 *      The month's billable messages, what Meta is expected to bill at
 *      our rate card, and the fee on top.
 *
 * PATCH same path — platform admin only.
 *      { fee_percent } sets the account's fee, and/or
 *      { rates: { MARKETING: 0.78, … } } updates the PLATFORM-WIDE rate
 *      card for this account's currency (it is not per account; a
 *      per-account discount belongs in fee_percent).
 */
export async function GET(request: Request, { params }: { params: Promise<{ id: string }> }) {
  await requirePlatformAdmin();
  const { id } = await params;

  const url = new URL(request.url);
  const now = new Date();
  const parsed =
    parseMonth(url.searchParams.get('month')) ??
    { year: now.getUTCFullYear(), month: now.getUTCMonth() + 1 };

  const report = await loadMonthlyFee(id, parsed.year, parsed.month);
  if (!report) return NextResponse.json({ error: 'Account not found' }, { status: 404 });

  return NextResponse.json(report);
}

export async function PATCH(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const admin = await requirePlatformAdmin();
  const { id } = await params;

  const body = (await request.json().catch(() => null)) as {
    fee_percent?: unknown;
    rates?: unknown;
  } | null;

  const db = supabaseAdmin();

  const { data: account } = await db
    .from('accounts')
    .select('id, name, default_currency, management_fee_percent')
    .eq('id', id)
    .maybeSingle();
  if (!account) return NextResponse.json({ error: 'Account not found' }, { status: 404 });

  // --- the fee percentage ---
  if (body?.fee_percent !== undefined) {
    const pct = Number(body.fee_percent);
    if (!Number.isFinite(pct) || pct < 0 || pct > 100) {
      return NextResponse.json({ error: 'fee_percent must be between 0 and 100' }, { status: 400 });
    }
    const { error } = await db
      .from('accounts')
      .update({ management_fee_percent: pct })
      .eq('id', id);
    if (error) {
      return NextResponse.json(
        { error: `Could not save the fee (run migration 097?): ${error.message}` },
        { status: 400 },
      );
    }
    await recordAudit(
      {
        accountId: id,
        actorUserId: admin.userId,
        action: 'account.fee_changed',
        targetType: 'account',
        targetId: id,
        metadata: {
          by: admin.email ?? 'platform_admin',
          from: Number((account as { management_fee_percent?: number }).management_fee_percent ?? 0),
          to: pct,
        },
      },
      request,
    );
  }

  // --- the rate card (platform-wide, per currency) ---
  if (body?.rates !== undefined) {
    if (typeof body.rates !== 'object' || body.rates === null || Array.isArray(body.rates)) {
      return NextResponse.json({ error: 'rates must be an object' }, { status: 400 });
    }
    const currency = (account.default_currency as string | null) ?? 'INR';
    const rows: { currency: string; pricing_category: string; rate: number }[] = [];

    for (const [category, value] of Object.entries(body.rates as Record<string, unknown>)) {
      const rate = Number(value);
      if (!Number.isFinite(rate) || rate < 0) {
        return NextResponse.json({ error: `Rate for ${category} must be 0 or more` }, { status: 400 });
      }
      rows.push({ currency, pricing_category: category.toUpperCase(), rate });
    }

    if (rows.length > 0) {
      const { error } = await db
        .from('message_rates')
        .upsert(rows, { onConflict: 'currency,pricing_category' });
      if (error) {
        return NextResponse.json(
          { error: `Could not save the rate card (run migration 097?): ${error.message}` },
          { status: 400 },
        );
      }
    }
  }

  const now = new Date();
  const report = await loadMonthlyFee(id, now.getUTCFullYear(), now.getUTCMonth() + 1);
  return NextResponse.json(report ?? { ok: true });
}
