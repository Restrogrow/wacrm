import { NextResponse } from 'next/server';

import { requirePlatformAdmin } from '@/lib/auth/platform-admin';
import { formatInr } from '@/lib/partners/program';
import { payOutPending } from '@/lib/partners/server';

/**
 * POST /api/admin/partners/[id]/payouts — platform admin only.
 *
 * { method?, reference?, note? }. Call after sending the money: records
 * one payout for everything pending, marks those commissions paid and
 * emails the partner.
 */
const text = (v: unknown, max: number) =>
  typeof v === 'string' && v.trim() ? v.trim().slice(0, max) : null;

export async function POST(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const admin = await requirePlatformAdmin();
  const { id } = await params;
  const body = ((await request.json().catch(() => null)) ?? {}) as Record<string, unknown>;

  try {
    const result = await payOutPending({
      partnerId: id,
      method: text(body.method, 60),
      reference: text(body.reference, 120),
      note: text(body.note, 300),
      adminUserId: admin.userId,
    });
    if (!result) return NextResponse.json({ error: 'Nothing pending to pay' }, { status: 409 });
    return NextResponse.json({ ok: true, ...result, label: formatInr(result.amount) });
  } catch (err) {
    console.error('[admin/partners] payout failed:', err);
    return NextResponse.json({ error: 'Could not record the payout' }, { status: 500 });
  }
}
