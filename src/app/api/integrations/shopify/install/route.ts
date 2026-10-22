// ============================================================
// GET /api/integrations/shopify/install?shop=<store>
//
// "Connect Shopify": send the merchant to Shopify's OAuth consent screen
// for Repeat Grow's app. A random `state` nonce goes in a short-lived
// httpOnly cookie and is checked on /callback.
//
// Two ways in:
//   - From Settings → Shopify: a signed-in admin types their store.
//   - From the Shopify App Store / admin: Shopify opens this URL with a
//     signed query (shop, timestamp, hmac). The merchant may not have a
//     Repeat Grow login yet, but Shopify's review requires OAuth to start
//     immediately, so we verify the signature and go straight to consent;
//     /callback parks the connection until they sign in (see ../claim).
// ============================================================

import { randomBytes } from 'node:crypto';
import { NextResponse } from 'next/server';

import { requireRole, UnauthorizedError } from '@/lib/auth/account';
import {
  OAUTH_CALLBACK_PATH,
  SHOPIFY_SCOPES,
  appBaseUrl,
  shopifyAppCredentials,
} from '@/lib/shopify/config';
import { normalizeShopDomain, verifyShopifyOAuthQuery } from '@/lib/shopify/verify';

// Read back by ../callback/route.ts.
const STATE_COOKIE = 'shopify_oauth_state';

function backToSettings(error: string) {
  const url = new URL('/integrations/shopify', appBaseUrl());
  url.searchParams.set('shopify_error', error);
  return NextResponse.redirect(url);
}

export async function GET(request: Request) {
  const creds = shopifyAppCredentials();
  const params = new URL(request.url).searchParams;
  // Signed by Shopify (App Store / Shopify admin install): start OAuth
  // right away, signed in or not.
  const fromShopify = !!creds && verifyShopifyOAuthQuery(params, creds.clientSecret);

  if (!fromShopify) {
    try {
      await requireRole('admin');
    } catch (err) {
      if (!(err instanceof UnauthorizedError)) {
        return backToSettings('Only an owner or admin can connect Shopify.');
      }
      // Unsigned request and no session: sign in first, then come back
      // here; `next` survives login, signup, Google and email links.
      const login = new URL('/login', appBaseUrl());
      login.searchParams.set('next', `/api/integrations/shopify/install?${params}`);
      return NextResponse.redirect(login);
    }
  }

  if (!creds)
    return backToSettings('Shopify app is not configured on this server.');

  const shop = normalizeShopDomain(params.get('shop'));
  if (!shop)
    return backToSettings(
      'Enter your store address, e.g. mystore.myshopify.com'
    );

  const state = randomBytes(16).toString('hex');
  const authorize = new URL(`https://${shop}/admin/oauth/authorize`);
  authorize.searchParams.set('client_id', creds.clientId);
  authorize.searchParams.set('scope', SHOPIFY_SCOPES);
  authorize.searchParams.set(
    'redirect_uri',
    `${appBaseUrl()}${OAUTH_CALLBACK_PATH}`
  );
  authorize.searchParams.set('state', state);

  const response = NextResponse.redirect(authorize);
  response.cookies.set(STATE_COOKIE, state, {
    httpOnly: true,
    secure: appBaseUrl().startsWith('https://'),
    sameSite: 'lax',
    path: '/api/integrations/shopify',
    maxAge: 600,
  });
  return response;
}
