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

import { recordAudit } from '@/lib/audit';
import { NextResponse } from 'next/server';

import { requireRole, toErrorResponse } from '@/lib/auth/account';
import { supabaseAdmin } from '@/lib/flows/admin-client';
import { wooWebhookUrl } from '@/lib/woocommerce/config';
import { ensureWooStore } from '@/lib/woocommerce/store-connection';
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

    const saved = await ensureWooStore(supabaseAdmin(), {
      accountId: ctx.accountId,
      userId: ctx.userId,
      storeUrl,
      rotateSecret: body?.rotate_secret === true,
    });
    if (!saved.ok) return NextResponse.json({ error: saved.error }, { status: 500 });

    await recordAudit({ accountId: ctx.accountId, actorUserId: ctx.userId, action: 'integration.connected', targetType: 'integration', targetId: 'woocommerce' }, request)

    return NextResponse.json({
      webhook_url: wooWebhookUrl(saved.ingestToken),
      secret: saved.secret,
    });
  } catch (err) {
    return toErrorResponse(err);
  }
}
