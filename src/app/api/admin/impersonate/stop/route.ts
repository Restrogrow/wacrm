import { NextResponse } from 'next/server';

import { stopImpersonation } from '@/lib/auth/impersonation';

/**
 * POST /api/admin/impersonate/stop
 *
 * Ends an impersonation and signs the browser back in as the admin who
 * started it.
 *
 * Deliberately NOT behind `requirePlatformAdmin`: by the time this is
 * called the session belongs to the impersonated *customer*, who is not
 * a platform admin, so that guard would 404 every legitimate call.
 * Authorisation comes instead from the httpOnly token cookie matching a
 * live `impersonation_sessions` row whose `admin_user_id` STILL has
 * platform access — checked inside stopImpersonation, because this is
 * the one place a cookie turns into "become user X".
 *
 * No audit row here: the only thing being restored is the admin's own
 * session, and `impersonation_sessions.ended_at` already records when.
 */
export async function POST() {
  try {
    await stopImpersonation();
  } catch (err) {
    console.error('[admin/impersonate/stop] failed:', err);
    return NextResponse.json(
      {
        error:
          err instanceof Error ? err.message : 'Could not stop impersonating',
      },
      { status: 400 }
    );
  }

  return NextResponse.json({ ok: true, redirectTo: '/admin' });
}
