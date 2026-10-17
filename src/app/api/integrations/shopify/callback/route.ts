// ============================================================
// GET /api/integrations/shopify/callback
//
// Shopify redirects here after the merchant approves the app. Verify
// the request (HMAC, state nonce, shop domain), exchange the code for
// an expiring offline token, save the store on the admin's account,
// register our webhooks, and return to Settings → Shopify.
// ============================================================

import { randomBytes } from 'node:crypto';
import { recordAudit } from '@/lib/audit';
import { cookies } from 'next/headers';
import { NextResponse } from 'next/server';

import { requireRole } from '@/lib/auth/account';
import { supabaseAdmin } from '@/lib/flows/admin-client';
import {
  exchangeCodeForToken,
  fetchShopName,
  registerWebhooks,
  tokenColumns,
} from '@/lib/shopify/admin-api';
import { appBaseUrl, shopifyAppCredentials } from '@/lib/shopify/config';
import {
  isValidShopDomain,
  verifyShopifyOAuthQuery,
} from '@/lib/shopify/verify';

const STATE_COOKIE = 'shopify_oauth_state';

function backToSettings(params: Record<string, string>) {
  const url = new URL('/integrations/shopify', appBaseUrl());
  for (const [key, value] of Object.entries(params))
    url.searchParams.set(key, value);
  const response = NextResponse.redirect(url);
  response.cookies.delete({
    name: STATE_COOKIE,
    path: '/api/integrations/shopify',
  });
  return response;
}

export async function GET(request: Request) {
  const creds = shopifyAppCredentials();
  if (!creds)
    return backToSettings({ shopify_error: 'Shopify app is not configured.' });

  const params = new URL(request.url).searchParams;
  const shop = params.get('shop');
  const code = params.get('code');
  const state = params.get('state');
  const cookieState = (await cookies()).get(STATE_COOKIE)?.value;

  if (
    !verifyShopifyOAuthQuery(params, creds.clientSecret) ||
    !isValidShopDomain(shop) ||
    !code
  ) {
    return backToSettings({
      shopify_error: 'Invalid response from Shopify. Please try again.',
    });
  }
  if (!state || !cookieState || state !== cookieState) {
    return backToSettings({
      shopify_error: 'Connection expired. Please click Connect again.',
    });
  }

  let ctx;
  try {
    ctx = await requireRole('admin');
  } catch {
    return NextResponse.redirect(new URL('/login', appBaseUrl()));
  }

  const db = supabaseAdmin();

  // An OAuth-connected shop can belong to only one Repeat Grow account.
  const { data: taken } = await db
    .from('shopify_stores')
    .select('account_id')
    .eq('shop_domain', shop)
    .eq('connection_type', 'oauth')
    .eq('status', 'active')
    .neq('account_id', ctx.accountId)
    .maybeSingle();
  if (taken) {
    return backToSettings({
      shopify_error: `${shop} is already connected to another Repeat Grow account. Disconnect it there first.`,
    });
  }

  try {
    const tokens = await exchangeCodeForToken(shop, code);
    const shopName = await fetchShopName(shop, tokens.accessToken).catch(
      () => null
    );

    const { data: existing } = await db
      .from('shopify_stores')
      .select('ingest_token')
      .eq('account_id', ctx.accountId)
      .maybeSingle();

    const { error: saveErr } = await db.from('shopify_stores').upsert(
      {
        account_id: ctx.accountId,
        shop_domain: shop,
        shop_name: shopName,
        connection_type: 'oauth',
        ingest_token:
          existing?.ingest_token ?? randomBytes(24).toString('base64url'),
        webhook_secret: null,
        ...tokenColumns(tokens),
        status: 'active',
        connected_by: ctx.userId,
        updated_at: new Date().toISOString(),
      },
      { onConflict: 'account_id' }
    );
    if (saveErr) throw new Error(saveErr.message);

    await registerWebhooks(shop, tokens.accessToken);
    await recordAudit({ accountId: ctx.accountId, actorUserId: ctx.userId, action: 'integration.connected', targetType: 'integration', targetId: 'shopify' }, request)
  } catch (err) {
    const message =
      err instanceof Error ? err.message : 'Could not connect the store';
    console.error('[shopify/callback]', message);
    return backToSettings({ shopify_error: message });
  }

  return backToSettings({ shopify: 'connected' });
}
