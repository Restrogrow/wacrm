import { NextResponse } from 'next/server';

import { recordAudit } from '@/lib/audit';
import { isPlatformAdmin, requirePlatformAdmin } from '@/lib/auth/platform-admin';
import { startImpersonation } from '@/lib/auth/impersonation';
import { supabaseAdmin } from '@/lib/flows/admin-client';
import { checkRateLimit, rateLimitResponse, RATE_LIMITS } from '@/lib/rate-limit';

/**
 * POST /api/admin/accounts/[id]/members/[userId]/impersonate — platform
 * admin only.
 *
 * Replaces the caller's session with a real session for the member, so
 * support can reproduce a customer's issue from inside their account
 * without asking for a password. See lib/auth/impersonation.ts for the
 * mechanics and migration 094 for the return path.
 *
 * Responds with the path to send the browser to rather than issuing a
 * redirect: the caller is a fetch() from the admin table, and a 3xx
 * there would be followed by fetch itself, so the new session cookies
 * would land on a response the page never navigates to.
 */
export async function POST(
  request: Request,
  { params }: { params: Promise<{ id: string; userId: string }> }
) {
  const admin = await requirePlatformAdmin();
  const { id, userId } = await params;

  const limit = checkRateLimit(
    `admin:impersonate:${admin.userId}`,
    RATE_LIMITS.adminAction
  );
  if (!limit.success) return rateLimitResponse(limit);

  // Impersonating yourself would overwrite your session with an
  // identical one and leave a pointless row behind.
  if (userId === admin.userId) {
    return NextResponse.json(
      { error: 'You are already signed in as this user' },
      { status: 400 }
    );
  }

  const db = supabaseAdmin();

  // The target must really be a member of the account on screen. Not a
  // security boundary on its own — a platform admin could impersonate
  // any user by opening that user's own account — but it stops a stale
  // page or a mistyped id from logging support into a different
  // customer than the one they are looking at.
  const { data: member } = await db
    .from('profiles')
    .select('user_id, email, full_name')
    .eq('user_id', userId)
    .eq('account_id', id)
    .maybeSingle<{ user_id: string; email: string; full_name: string | null }>();
  if (!member) {
    return NextResponse.json(
      { error: 'User is not a member of this account' },
      { status: 404 }
    );
  }

  // Refuse admin-on-admin. The exit path restores whoever started the
  // session, so nesting (A becomes B, B becomes C) would give one
  // cookie two valid ways back and make the trail ambiguous about who
  // was actually at the keyboard.
  if (await isPlatformAdmin(userId)) {
    return NextResponse.json(
      { error: 'Cannot impersonate another platform admin' },
      { status: 403 }
    );
  }

  // Audit BEFORE the swap: once startImpersonation returns, the request
  // is no longer authenticated as the admin, and recordAudit would
  // attribute the entry to the customer.
  await recordAudit(
    {
      accountId: id,
      actorUserId: admin.userId,
      action: 'member.impersonation_started',
      targetType: 'user',
      targetId: userId,
      metadata: { email: member.email ?? null, by: 'platform_admin' },
    },
    request
  );

  try {
    await startImpersonation({
      adminUserId: admin.userId,
      targetUserId: userId,
      accountId: id,
    });
  } catch (err) {
    console.error('[admin/impersonate] failed:', err);
    return NextResponse.json(
      { error: err instanceof Error ? err.message : 'Could not sign in as this user' },
      { status: 500 }
    );
  }

  return NextResponse.json({ ok: true, redirectTo: '/dashboard' });
}
