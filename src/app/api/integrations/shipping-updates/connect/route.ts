// ============================================================
// POST /api/integrations/shipping-updates/connect - Admin+.
//
//   { rotate_secret? }
//
// Creates (or refreshes) the account's Shiprocket connection. Repeat Grow
// generates the unguessable delivery URL and the token Shiprocket sends in
// the x-api-key header; the merchant pastes both into Shiprocket >
// Settings > API > Webhooks. The token is stored encrypted and returned
// here and from /credentials (admins only). Re-posting keeps the same URL
// and token unless rotate_secret is true.
// ============================================================

import { randomBytes } from 'node:crypto';
import { NextResponse } from 'next/server';

import { recordAudit } from '@/lib/audit';
import { requireRole, toErrorResponse } from '@/lib/auth/account';
import { supabaseAdmin } from '@/lib/flows/admin-client';
import { checkRateLimit, rateLimitResponse, RATE_LIMITS } from '@/lib/rate-limit';
import { shippingWebhookUrl } from '@/lib/shiprocket/config';
import { decrypt, encrypt } from '@/lib/whatsapp/encryption';

export async function POST(request: Request) {
  try {
    const ctx = await requireRole('admin');
    const limit = checkRateLimit(`shiprocket:connect:${ctx.userId}`, RATE_LIMITS.adminAction);
    if (!limit.success) return rateLimitResponse(limit);

    const body = (await request.json().catch(() => null)) as { rotate_secret?: unknown } | null;

    const db = supabaseAdmin();
    const { data: existing } = await db
      .from('shiprocket_connections')
      .select('ingest_token, webhook_token')
      .eq('account_id', ctx.accountId)
      .maybeSingle();

    // Hex only: Shiprocket rejects URLs containing "sr" / "kr".
    const ingestToken = existing?.ingest_token ?? randomBytes(24).toString('hex');
    let token: string | null = null;
    if (existing && body?.rotate_secret !== true) {
      try {
        token = decrypt(existing.webhook_token);
      } catch {
        token = null;
      }
    }
    if (!token) token = randomBytes(32).toString('base64url');

    const { error } = await db.from('shiprocket_connections').upsert(
      {
        account_id: ctx.accountId,
        ingest_token: ingestToken,
        webhook_token: encrypt(token),
        status: 'active',
        connected_by: ctx.userId,
        updated_at: new Date().toISOString(),
      },
      { onConflict: 'account_id' }
    );
    if (error) {
      console.error('[shiprocket/connect] save failed:', error.message);
      return NextResponse.json({ error: 'Failed to save' }, { status: 500 });
    }

    await recordAudit(
      {
        accountId: ctx.accountId,
        actorUserId: ctx.userId,
        action: 'integration.connected',
        targetType: 'integration',
        targetId: 'shiprocket',
      },
      request
    );

    return NextResponse.json({ webhook_url: shippingWebhookUrl(ingestToken), secret: token });
  } catch (err) {
    return toErrorResponse(err);
  }
}
