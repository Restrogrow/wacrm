// ============================================================
// POST /api/integrations/calcom/connect - Admin+.
//
//   { booking_page?, rotate_secret? }
//
// Creates (or refreshes) the account's Cal.com connection. Repeat Grow
// generates the signing secret and the unguessable delivery URL; the
// merchant pastes both into Cal.com > Settings > Developer > Webhooks. The
// secret is stored encrypted and returned here and from /credentials
// (admins only). Re-posting keeps the same URL and secret unless
// rotate_secret is true.
// ============================================================

import { randomBytes } from 'node:crypto';
import { NextResponse } from 'next/server';

import { recordAudit } from '@/lib/audit';
import { requireRole, toErrorResponse } from '@/lib/auth/account';
import { calcomWebhookUrl } from '@/lib/calcom/config';
import { normalizeBookingHost } from '@/lib/calcom/verify';
import { supabaseAdmin } from '@/lib/flows/admin-client';
import { checkRateLimit, rateLimitResponse, RATE_LIMITS } from '@/lib/rate-limit';
import { decrypt, encrypt } from '@/lib/whatsapp/encryption';

export async function POST(request: Request) {
  try {
    const ctx = await requireRole('admin');
    const limit = checkRateLimit(`calcom:connect:${ctx.userId}`, RATE_LIMITS.adminAction);
    if (!limit.success) return rateLimitResponse(limit);

    const body = (await request.json().catch(() => null)) as {
      booking_page?: unknown;
      rotate_secret?: unknown;
    } | null;

    const rawHost = typeof body?.booking_page === 'string' ? body.booking_page : '';
    const bookingPage = rawHost.trim() ? normalizeBookingHost(rawHost) : 'https://cal.com';
    if (!bookingPage) {
      return NextResponse.json({ error: 'Enter your Cal.com address, e.g. https://cal.com' }, { status: 400 });
    }

    const db = supabaseAdmin();
    const { data: existing } = await db
      .from('calcom_connections')
      .select('ingest_token, webhook_secret')
      .eq('account_id', ctx.accountId)
      .maybeSingle();

    const ingestToken = existing?.ingest_token ?? randomBytes(24).toString('base64url');
    let secret: string | null = null;
    if (existing && body?.rotate_secret !== true) {
      try {
        secret = decrypt(existing.webhook_secret);
      } catch {
        secret = null;
      }
    }
    if (!secret) secret = randomBytes(32).toString('base64url');

    const { error } = await db.from('calcom_connections').upsert(
      {
        account_id: ctx.accountId,
        ingest_token: ingestToken,
        webhook_secret: encrypt(secret),
        booking_page: bookingPage,
        status: 'active',
        connected_by: ctx.userId,
        updated_at: new Date().toISOString(),
      },
      { onConflict: 'account_id' }
    );
    if (error) {
      console.error('[calcom/connect] save failed:', error.message);
      return NextResponse.json({ error: 'Failed to save' }, { status: 500 });
    }

    await recordAudit(
      {
        accountId: ctx.accountId,
        actorUserId: ctx.userId,
        action: 'integration.connected',
        targetType: 'integration',
        targetId: 'calcom',
      },
      request
    );

    return NextResponse.json({ webhook_url: calcomWebhookUrl(ingestToken), secret });
  } catch (err) {
    return toErrorResponse(err);
  }
}
