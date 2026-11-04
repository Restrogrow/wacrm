// ============================================================
// Route guard for the /agent partner portal.
//
// Its own file rather than part of ./server.ts for two reasons: the
// static `redirect` import is what lets TypeScript see the calls below
// as unreachable-after (a dynamic import loses the `never` return and
// the narrowing with it), and it keeps `next/headers` out of
// ./server.ts, which a client component imports types from.
// ============================================================

import { redirect } from 'next/navigation';

import { createClient } from '@/lib/supabase/server';
import { getPartnerByUser, type PartnerRow } from './server';

/**
 * Returns the signed-in partner, or redirects:
 *
 *   signed out            → /login?next=/agent
 *   not a partner at all  → /partners (where becoming one happens)
 *   pending / rejected    → /partners (which tells them where they stand)
 *
 * `suspended` is let through on purpose. A paused partner's link stops
 * crediting new sign-ups, but commission they already earned is still
 * owed and still paid — locking them out of the page showing what
 * they're owed would be the wrong way to pause someone. The portal
 * itself explains the pause.
 */
export async function requirePartnerPortal(): Promise<PartnerRow> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect('/login?next=/agent');

  const partner = await getPartnerByUser(user.id);
  if (!partner || (partner.status !== 'approved' && partner.status !== 'suspended')) {
    redirect('/partners');
  }
  return partner;
}
