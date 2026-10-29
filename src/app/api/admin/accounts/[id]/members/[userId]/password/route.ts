import { NextResponse } from 'next/server';
import { recordAudit } from '@/lib/audit';
import { isPlatformAdmin, requirePlatformAdmin } from '@/lib/auth/platform-admin';
import { supabaseAdmin } from '@/lib/flows/admin-client';

/**
 * POST /api/admin/accounts/[id]/members/[userId]/password — platform admin only.
 *
 * { password } — sets a new sign-in password for a member of the account
 * (a customer who is locked out and can't get the reset email). Works
 * for Google sign-ups too: they can then also sign in with email.
 *
 * The password is never logged or stored by us; the audit row only
 * records that it was reset, by whom. Another platform admin's password
 * can't be changed from here.
 */
const MIN_ADMIN_PASSWORD = 8;

export async function POST(
  request: Request,
  { params }: { params: Promise<{ id: string; userId: string }> }
) {
  const admin = await requirePlatformAdmin();
  const { id, userId } = await params;

  const body = (await request.json().catch(() => null)) as { password?: unknown } | null;
  const password = typeof body?.password === 'string' ? body.password : '';
  if (password.length < MIN_ADMIN_PASSWORD || password.length > 72) {
    return NextResponse.json(
      { error: `Password must be ${MIN_ADMIN_PASSWORD}–72 characters` },
      { status: 400 }
    );
  }

  const db = supabaseAdmin();
  // The user must be a member of this account (no resetting arbitrary ids).
  const { data: member } = await db
    .from('profiles')
    .select('user_id, email')
    .eq('user_id', userId)
    .eq('account_id', id)
    .maybeSingle();
  if (!member) {
    return NextResponse.json({ error: 'User is not a member of this account' }, { status: 404 });
  }
  if (userId !== admin.userId && (await isPlatformAdmin(userId))) {
    return NextResponse.json(
      { error: 'Another platform admin must change their own password' },
      { status: 403 }
    );
  }

  const { error } = await db.auth.admin.updateUserById(userId, { password });
  if (error) {
    console.error('[admin/password] reset failed:', error.message);
    return NextResponse.json({ error: error.message || 'Could not reset the password' }, { status: 400 });
  }

  await recordAudit(
    {
      accountId: id,
      actorUserId: admin.userId,
      action: 'member.password_reset',
      targetType: 'user',
      targetId: userId,
      metadata: { email: member.email ?? null, by: 'platform_admin' },
    },
    request
  );
  return NextResponse.json({ ok: true });
}
