import { cookies } from 'next/headers';
import { NextResponse } from 'next/server';

import { recordAudit } from '@/lib/audit';
import {
  IMPERSONATION_COOKIE,
  IMPERSONATION_COOKIE_OPTIONS,
  encodeImpersonation,
} from '@/lib/auth/impersonation';
import { isPlatformAdmin, requirePlatformAdmin } from '@/lib/auth/platform-admin';
import { supabaseAdmin } from '@/lib/flows/admin-client';
import { createClient } from '@/lib/supabase/server';

/**
 * POST /api/admin/accounts/[id]/login-as — platform admin only.
 *
 * Replaces the caller's own session with a real session for this
 * account's owner, so the admin sees and can change exactly what the
 * customer can. Returns `{ ok: true }`; the caller then navigates to
 * /dashboard.
 *
 * How the session is handed over: `generateLink` mints a one-time
 * magic-link token for the member (it does NOT email anything), and
 * `verifyOtp` redeems it through the SSR client, which writes the sb-*
 * cookies for this browser. Doing both server-side in one request
 * avoids bouncing the browser through Supabase's verify endpoint and
 * needing its redirect allowlist.
 *
 * The admin's own session is replaced, not stacked — signing back in as
 * the admin is the way out, which the banner's Exit button does.
 */
export async function POST(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const admin = await requirePlatformAdmin();
  const { id: accountId } = await params;

  const db = supabaseAdmin();

  const { data: account } = await db
    .from('accounts')
    .select('id, name, owner_user_id')
    .eq('id', accountId)
    .maybeSingle();
  if (!account) {
    return NextResponse.json({ error: 'Account not found' }, { status: 404 });
  }

  // Prefer the owner; fall back to any member (an account whose owner
  // row was removed should still be supportable).
  const { data: members } = await db
    .from('profiles')
    .select('user_id, email, role')
    .eq('account_id', accountId);
  const target =
    members?.find((m) => m.user_id === account.owner_user_id) ?? members?.[0] ?? null;
  if (!target?.email) {
    return NextResponse.json(
      { error: 'This account has no member with an email address to sign in as' },
      { status: 400 },
    );
  }

  // Don't let one platform admin take over another's account.
  if (target.user_id !== admin.userId && (await isPlatformAdmin(target.user_id))) {
    return NextResponse.json(
      { error: 'That account belongs to another platform admin' },
      { status: 403 },
    );
  }

  // Audit BEFORE the handover: after verifyOtp the request's identity is
  // the customer's, and a failure to log must not be silent.
  await recordAudit(
    {
      accountId,
      actorUserId: admin.userId,
      action: 'account.impersonated',
      targetType: 'user',
      targetId: target.user_id,
      metadata: {
        by: admin.email ?? 'platform_admin',
        member_email: target.email,
        account_name: account.name,
      },
    },
    request,
  );

  const { data: link, error: linkError } = await db.auth.admin.generateLink({
    type: 'magiclink',
    email: target.email,
  });
  const tokenHash = link?.properties?.hashed_token;
  if (linkError || !tokenHash) {
    console.error('[admin/login-as] generateLink failed:', linkError?.message);
    return NextResponse.json(
      { error: linkError?.message || 'Could not create a sign-in token for this account' },
      { status: 400 },
    );
  }

  const supabase = await createClient();
  const { error: verifyError } = await supabase.auth.verifyOtp({
    type: 'magiclink',
    token_hash: tokenHash,
  });
  if (verifyError) {
    console.error('[admin/login-as] verifyOtp failed:', verifyError.message);
    return NextResponse.json(
      { error: verifyError.message || 'Could not start the customer session' },
      { status: 400 },
    );
  }

  const store = await cookies();
  store.set(
    IMPERSONATION_COOKIE,
    encodeImpersonation({
      adminUserId: admin.userId,
      adminEmail: admin.email,
      accountId,
      accountName: account.name,
      memberEmail: target.email,
      startedAt: new Date().toISOString(),
    }),
    IMPERSONATION_COOKIE_OPTIONS,
  );

  return NextResponse.json({ ok: true, account: account.name, email: target.email });
}
