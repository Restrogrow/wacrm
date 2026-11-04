import { NextResponse } from 'next/server';

import { getImpersonationState } from '@/lib/auth/impersonation';

/**
 * GET /api/admin/impersonate/status
 *
 * Feeds the "you are viewing as X" banner in the dashboard shell.
 *
 * Deliberately NOT behind `requirePlatformAdmin`: the session asking is
 * the impersonated *customer's*, who is not a platform admin, so that
 * guard would 404 every legitimate call. It's safe to leave open
 * because it reveals nothing to anyone who isn't already inside an
 * impersonation — `getImpersonationState` needs the httpOnly token
 * cookie AND a live session whose user matches the row's target, and
 * returns null otherwise.
 *
 * Returns `{ impersonation: null }` rather than a 404 for the normal
 * case: the banner polls this on every dashboard load and a 404 per
 * page view is noise in the logs.
 */
export async function GET() {
  try {
    const state = await getImpersonationState();
    return NextResponse.json(
      { impersonation: state },
      // Must never be cached — it is per-session and flips the moment
      // "Stop impersonating" is pressed.
      { headers: { 'Cache-Control': 'no-store' } }
    );
  } catch (err) {
    console.error('[admin/impersonate/status] failed:', err);
    return NextResponse.json({ impersonation: null });
  }
}
