import { NextResponse } from 'next/server';

import { requirePlatformAdmin } from '@/lib/auth/platform-admin';
import { supabaseAdmin } from '@/lib/flows/admin-client';
import { normalizeCode, PARTNER_STATUSES, type PartnerStatus } from '@/lib/partners/program';
import { getPartner, notifyPartnerOfStatus } from '@/lib/partners/server';

/**
 * PATCH /api/admin/partners/[id] — platform admin only.
 *
 * { status?, commission_rate?, code?, admin_note? }
 *
 * Approving (or rejecting) emails the partner once, when the status
 * actually changes.
 */
export async function PATCH(request: Request, { params }: { params: Promise<{ id: string }> }) {
  await requirePlatformAdmin();
  const { id } = await params;
  const body = ((await request.json().catch(() => null)) ?? {}) as Record<string, unknown>;

  const before = await getPartner(id);
  if (!before) return NextResponse.json({ error: 'Partner not found' }, { status: 404 });

  const updates: Record<string, unknown> = { updated_at: new Date().toISOString() };
  if (body.status !== undefined) {
    if (typeof body.status !== 'string' || !(PARTNER_STATUSES as readonly string[]).includes(body.status)) {
      return NextResponse.json({ error: 'Choose a valid status' }, { status: 400 });
    }
    updates.status = body.status;
    if (body.status === 'approved' && !before.approved_at) updates.approved_at = new Date().toISOString();
  }
  if (body.commission_rate !== undefined) {
    const rate = Number(body.commission_rate);
    if (!Number.isFinite(rate) || rate < 0 || rate > 100) {
      return NextResponse.json({ error: 'Commission must be between 0 and 100%' }, { status: 400 });
    }
    updates.commission_rate = Math.round(rate * 100) / 100;
  }
  if (body.code !== undefined) {
    const code = normalizeCode(body.code);
    if (!code) {
      return NextResponse.json(
        { error: 'Code: 3–32 characters, lower-case letters, numbers and dashes' },
        { status: 400 }
      );
    }
    updates.code = code;
  }
  if (body.admin_note !== undefined) {
    updates.admin_note = typeof body.admin_note === 'string' ? body.admin_note.trim().slice(0, 1000) || null : null;
  }

  const { error } = await supabaseAdmin().from('partners').update(updates).eq('id', id);
  if (error) {
    if (error.code === '23505') return NextResponse.json({ error: 'That code is taken' }, { status: 409 });
    console.error('[admin/partners] update failed:', error.message);
    return NextResponse.json({ error: 'Could not save' }, { status: 500 });
  }

  if (updates.status && updates.status !== before.status) {
    const after = await getPartner(id);
    if (after) await notifyPartnerOfStatus({ ...after, status: updates.status as PartnerStatus });
  }
  return NextResponse.json({ ok: true });
}
