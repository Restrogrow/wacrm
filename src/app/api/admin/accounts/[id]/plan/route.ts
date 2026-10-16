import { NextResponse } from 'next/server';
import { requirePlatformAdmin } from '@/lib/auth/platform-admin';
import { supabaseAdmin } from '@/lib/flows/admin-client';

/**
 * PATCH /api/admin/accounts/[id]/plan — platform admin only.
 *
 * { plan, trial_ends_at?, plan_expires_at?, billing_note? }
 *
 * No payment gateway yet: when a business pays (UPI / bank transfer),
 * support sets their plan and paid-until date here. Dates are ISO
 * strings or null (null paid-until = no end date).
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
  await requirePlatformAdmin();
  const { id } = await params;

  const body = (await request.json().catch(() => null)) as {
    plan?: unknown;
    trial_ends_at?: unknown;
    plan_expires_at?: unknown;
    billing_note?: unknown;
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
  return NextResponse.json({ ok: true });
}
