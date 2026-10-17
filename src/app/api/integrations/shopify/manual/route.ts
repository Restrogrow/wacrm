// ============================================================
// POST /api/integrations/shopify/manual — Admin+.
//
// Connect a store with the webhook option: { shop_domain, webhook_secret }.
// The secret is the signing key Shopify admin shows under Settings →
// Notifications → Webhooks ("Your webhooks will be signed with …").
// Returns the unique webhook URL to paste into each Shopify webhook.
// Re-posting updates the key and keeps the same URL.
// ============================================================

import { randomBytes } from 'node:crypto';
import { recordAudit } from '@/lib/audit';
import { NextResponse } from 'next/server';

import { requireRole, toErrorResponse } from '@/lib/auth/account';
import { supabaseAdmin } from '@/lib/flows/admin-client';
import { encrypt } from '@/lib/whatsapp/encryption';
import { manualWebhookUrl } from '@/lib/shopify/config';
import { normalizeShopDomain } from '@/lib/shopify/verify';

export async function POST(request: Request) {
  try {
    const ctx = await requireRole('admin');
    const body = (await request.json().catch(() => null)) as {
      shop_domain?: unknown;
      webhook_secret?: unknown;
    } | null;

    const shop = normalizeShopDomain(
      typeof body?.shop_domain === 'string' ? body.shop_domain : null
    );
    if (!shop) {
      return NextResponse.json(
        { error: 'Enter your store address, e.g. mystore.myshopify.com' },
        { status: 400 }
      );
    }
    const secret =
      typeof body?.webhook_secret === 'string'
        ? body.webhook_secret.trim()
        : '';
    if (secret.length < 16 || secret.length > 256 || /\s/.test(secret)) {
      return NextResponse.json(
        {
          error:
            'Paste the full signing key from Shopify → Settings → Notifications → Webhooks',
        },
        { status: 400 }
      );
    }

    const db = supabaseAdmin();
    const { data: existing } = await db
      .from('shopify_stores')
      .select('ingest_token')
      .eq('account_id', ctx.accountId)
      .maybeSingle();
    const ingestToken =
      existing?.ingest_token ?? randomBytes(24).toString('base64url');

    const { error } = await db.from('shopify_stores').upsert(
      {
        account_id: ctx.accountId,
        shop_domain: shop,
        connection_type: 'webhook',
        ingest_token: ingestToken,
        webhook_secret: encrypt(secret),
        access_token: null,
        refresh_token: null,
        access_token_expires_at: null,
        scopes: null,
        status: 'active',
        connected_by: ctx.userId,
        updated_at: new Date().toISOString(),
      },
      { onConflict: 'account_id' }
    );
    if (error) {
      console.error('[shopify/manual] save failed:', error.message);
      return NextResponse.json(
        { error: 'Failed to save the store' },
        { status: 500 }
      );
    }

    await recordAudit({ accountId: ctx.accountId, actorUserId: ctx.userId, action: 'integration.connected', targetType: 'integration', targetId: 'shopify' }, request)
    return NextResponse.json({ webhook_url: manualWebhookUrl(ingestToken) });
  } catch (err) {
    return toErrorResponse(err);
  }
}
