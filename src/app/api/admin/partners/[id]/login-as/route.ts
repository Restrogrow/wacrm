import { cookies } from 'next/headers';
import { NextResponse } from 'next/server';

import { recordAudit } from '@/lib/audit';
import {
  IMPERSONATION_COOKIE,
  IMPERSONATION_COOKIE_OPTIONS,
  encodeImpersonation,
} from '@/lib/auth/impersonation';
import { requirePlatformAdmin } from '@/lib/auth/platform-admin';
import { supabaseAdmin } from '@/lib/flows/admin-client';
import { createClient } from '@/lib/supabase/server';
import { getPartner } from '@/lib/partners/server';

/**
 * POST /api/admin/partners/[id]/login-as — platform admin only.
 *
 * Same mechanism as the account version (see
 * api/admin/accounts/[id]/login-as) — a one-time magic-link token is
 * minted and redeemed server-side so the admin's own session is
 * replaced with the partner's. Simpler than the account version: a
 * partner is one auth user (migration 092), no "which member" step.
 */
export async function POST(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const admin = await requirePlatformAdmin();
  const { id: partnerId } = await params;

  const partner = await getPartner(partnerId);
  if (!partner) {
    return NextResponse.json({ error: 'Partner not found' }, { status: 404 });
  }
  if (!partner.email) {
    return NextResponse.json(
      { error: 'This partner has no email address to sign in as' },
      { status: 400 },
    );
  }

  // Audit BEFORE the handover: after verifyOtp the request's identity is
  // the partner's, and a failure to log must not be silent.
  await recordAudit(
    {
      accountId: null,
      actorUserId: admin.userId,
      action: 'partner.impersonated',
      targetType: 'partner',
      targetId: partner.id,
      metadata: {
        by: admin.email ?? 'platform_admin',
        partner_email: partner.email,
        partner_name: partner.name,
      },
    },
    request,
  );

  const db = supabaseAdmin();
  const { data: link, error: linkError } = await db.auth.admin.generateLink({
    type: 'magiclink',
    email: partner.email,
  });
  const tokenHash = link?.properties?.hashed_token;
  if (linkError || !tokenHash) {
    console.error('[admin/partners/login-as] generateLink failed:', linkError?.message);
    return NextResponse.json(
      { error: linkError?.message || 'Could not create a sign-in token for this partner' },
      { status: 400 },
    );
  }

  const supabase = await createClient();
  const { error: verifyError } = await supabase.auth.verifyOtp({
    type: 'magiclink',
    token_hash: tokenHash,
  });
  if (verifyError) {
    console.error('[admin/partners/login-as] verifyOtp failed:', verifyError.message);
    return NextResponse.json(
      { error: verifyError.message || 'Could not start the partner session' },
      { status: 400 },
    );
  }

  const store = await cookies();
  store.set(
    IMPERSONATION_COOKIE,
    encodeImpersonation({
      adminUserId: admin.userId,
      adminEmail: admin.email,
      kind: 'partner',
      targetId: partner.id,
      targetName: partner.name,
      targetEmail: partner.email,
      startedAt: new Date().toISOString(),
    }),
    IMPERSONATION_COOKIE_OPTIONS,
  );

  return NextResponse.json({ ok: true, partner: partner.name, email: partner.email });
}
