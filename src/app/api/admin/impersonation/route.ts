import { cookies } from 'next/headers';
import { NextResponse } from 'next/server';

import { recordAudit } from '@/lib/audit';
import {
  IMPERSONATION_COOKIE,
  IMPERSONATION_COOKIE_OPTIONS,
  decodeImpersonation,
} from '@/lib/auth/impersonation';
import { createClient } from '@/lib/supabase/server';

/**
 * GET  /api/admin/impersonation — is this browser currently signed in as
 *      a customer via /admin, and if so on whose behalf?
 * DELETE /api/admin/impersonation — end it: sign the customer session
 *      out and drop the marker, so the admin can sign back in as
 *      themselves.
 *
 * Neither verb can require `requirePlatformAdmin`: while impersonating,
 * the session belongs to the *customer*, so that guard would 404. The
 * signed cookie is all these need — it grants no access of its own, and
 * signing out is never a privileged act.
 */
export async function GET() {
  const store = await cookies();
  const state = decodeImpersonation(store.get(IMPERSONATION_COOKIE)?.value);
  if (!state) return NextResponse.json({ impersonating: false });

  return NextResponse.json({
    impersonating: true,
    admin_email: state.adminEmail,
    account_name: state.accountName,
    account_id: state.accountId,
    member_email: state.memberEmail,
    started_at: state.startedAt,
  });
}

export async function DELETE(request: Request) {
  const store = await cookies();
  const state = decodeImpersonation(store.get(IMPERSONATION_COOKIE)?.value);

  if (state) {
    await recordAudit(
      {
        accountId: state.accountId,
        actorUserId: state.adminUserId,
        action: 'account.impersonation_ended',
        targetType: 'account',
        targetId: state.accountId,
        metadata: {
          by: state.adminEmail ?? 'platform_admin',
          started_at: state.startedAt,
        },
      },
      request,
    );
  }

  const supabase = await createClient();
  await supabase.auth.signOut();

  // Clear by overwriting with the same attributes — a bare delete()
  // can miss when path/secure don't match what was set.
  store.set(IMPERSONATION_COOKIE, '', { ...IMPERSONATION_COOKIE_OPTIONS, maxAge: 0 });

  return NextResponse.json({ ok: true });
}
