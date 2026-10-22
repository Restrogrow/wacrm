// ============================================================
// GET /api/integrations/shopify/callback
//
// Shopify redirects here after the merchant approves the app. Verify
// the request (HMAC, state nonce, shop domain), exchange the code for
// an expiring offline token, save the store on the admin's account,
// register our webhooks, and return to Settings → Shopify. A merchant
// who installed from the App Store without a session yet is sent to
// sign in / sign up, and ../claim finishes the connection.
// ============================================================

import { cookies } from 'next/headers';
import { NextResponse } from 'next/server';

import { requireRole, UnauthorizedError } from '@/lib/auth/account';
import {
  exchangeCodeForToken,
  fetchShopName,
  tokenColumns,
} from '@/lib/shopify/admin-api';
import {
  PENDING_INSTALL_COOKIE,
  createPendingInstall,
  saveOAuthConnection,
} from '@/lib/shopify/connect';
import { appBaseUrl, shopifyAppCredentials } from '@/lib/shopify/config';
import {
  isValidShopDomain,
  verifyShopifyOAuthQuery,
} from '@/lib/shopify/verify';

const STATE_COOKIE = 'shopify_oauth_state';
const CLAIM_PATH = '/api/integrations/shopify/claim';

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
  } catch (err) {
    if (!(err instanceof UnauthorizedError)) {
      return backToSettings({
        shopify_error: 'Only an owner or admin can connect Shopify.',
      });
    }
    // Installed from the App Store before signing in: exchange the code
    // now (it expires within minutes), park the connection, and finish
    // it on /claim once they sign in or sign up.
    try {
      const tokens = await exchangeCodeForToken(shop, code);
      const { claimToken, maxAge } = await createPendingInstall(shop, tokens);
      const login = new URL('/login', appBaseUrl());
      login.searchParams.set('next', CLAIM_PATH);
      const response = NextResponse.redirect(login);
      response.cookies.delete({ name: STATE_COOKIE, path: '/api/integrations/shopify' });
      response.cookies.set(PENDING_INSTALL_COOKIE, claimToken, {
        httpOnly: true,
        secure: appBaseUrl().startsWith('https://'),
        sameSite: 'lax',
        path: '/api/integrations/shopify',
        maxAge,
      });
      return response;
    } catch (parkErr) {
      console.error('[shopify/callback] could not park install:', parkErr);
      return backToSettings({
        shopify_error: 'Could not finish connecting. Please sign in and click Connect again.',
      });
    }
  }

  try {
    const tokens = await exchangeCodeForToken(shop, code);
    const shopName = await fetchShopName(shop, tokens.accessToken).catch(
      () => null
    );
    await saveOAuthConnection({
      accountId: ctx.accountId,
      userId: ctx.userId,
      shop,
      shopName,
      columns: tokenColumns(tokens),
      request,
    });
  } catch (err) {
    const message =
      err instanceof Error ? err.message : 'Could not connect the store';
    console.error('[shopify/callback]', message);
    return backToSettings({ shopify_error: message });
  }

  return backToSettings({ shopify: 'connected' });
}
