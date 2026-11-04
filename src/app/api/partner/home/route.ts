import { NextResponse } from 'next/server';

import { createClient } from '@/lib/supabase/server';
import { getPartnerByUser } from '@/lib/partners/server';

/**
 * GET /api/partner/home → { redirectTo }
 *
 * Where the signed-in user belongs after login. Almost everyone gets
 * `/dashboard`; a live partner gets `/agent`, because their login has
 * no `accounts` row behind it and the customer dashboard would be an
 * empty shell full of things they can't open.
 *
 * Answers for the caller's own session only, so there's nothing here
 * another user could learn about them.
 */
export async function GET() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) {
    return NextResponse.json({ redirectTo: '/login' }, { status: 401 });
  }

  try {
    const partner = await getPartnerByUser(user.id);
    const isLivePartner =
      partner?.status === 'approved' || partner?.status === 'suspended';
    return NextResponse.json({
      redirectTo: isLivePartner ? '/agent' : '/dashboard',
    });
  } catch (err) {
    // Table missing (migration 092/095 not applied) or DB hiccup: the
    // dashboard is the right default for everyone else.
    console.error('[partner/home] lookup failed:', err);
    return NextResponse.json({ redirectTo: '/dashboard' });
  }
}
