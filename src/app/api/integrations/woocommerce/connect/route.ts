// ============================================================
// POST /api/integrations/woocommerce/connect - Admin+.
//
//   { store_url, rotate_secret? }
//
// Creates (or updates) the account's WooCommerce connection. Repeat Grow
// generates the signing secret and the unguessable webhook URL; the
// merchant pastes both into WooCommerce -> Settings -> Advanced ->
// Webhooks. The secret is returned here and again from
// /credentials (admins only); it is stored encrypted.
// Re-posting keeps the same URL and secret unless rotate_secret is true.
// ============================================================

import { randomBytes } from 'node:crypto';
import { recordAudit } from '@/lib/audit';
import { NextResponse } from 'next/server';

import { requireRole, toErrorResponse } from '@/lib/auth/account';
import { supabaseAdmin } from '@/lib/flows/admin-client';
import { decrypt, encrypt } from '@/lib/whatsapp/encryption';
import { wooWebhookUrl } from '@/lib/woocommerce/config';
import { normalizeStoreUrl } from '@/lib/woocommerce/verify';
import { checkRateLimit, rateLimitResponse, RATE_LIMITS } from '@/lib/rate-limit';

export async function POST(request: Request) {
  try {
    const ctx = await requireRole('admin');
    const limit = checkRateLimit(`woocommerce:connect:${ctx.userId}`, RATE_LIMITS.adminAction);
    if (!limit.success) return rateLimitResponse(limit);

    const body = (await request.json().catch(() => null)) as {
      store_url?: unknown;
      rotate_secret?: unknown;
    } | null;

    const storeUrl = normalizeStoreUrl(
      typeof body?.store_url === 'string' ? body.store_url : null
    );
    if (!storeUrl) {
      return NextResponse.json(
        { error: 'Enter your store address, e.g. https://shop.example.com' },
        { status: 400 }
      );
    }

    const db = supabaseAdmin();
    const { data: existing } = await db
      .from('woocommerce_stores')
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

    const { error } = await db.from('woocommerce_stores').upsert(
      {
        account_id: ctx.accountId,
        store_url: storeUrl,
        store_name: new URL(storeUrl).hostname,
        ingest_token: ingestToken,
        webhook_secret: encrypt(secret),
        status: 'active',
        connected_by: ctx.userId,
        updated_at: new Date().toISOString(),
      },
      { onConflict: 'account_id' }
    );
    if (error) {
      console.error('[woocommerce/connect] save failed:', error.message);
      return NextResponse.json({ error: 'Failed to save the store' }, { status: 500 });
    }

    await recordAudit({ accountId: ctx.accountId, actorUserId: ctx.userId, action: 'integration.connected', targetType: 'integration', targetId: 'woocommerce' }, request)

    return NextResponse.json({
      webhook_url: wooWebhookUrl(ingestToken),
      secret,
    });
  } catch (err) {
    return toErrorResponse(err);
  }
}
