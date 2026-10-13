// ============================================================
// GET /api/integrations/shopify/install?shop=<store>
//
// "Connect Shopify": send an admin to Shopify's OAuth consent screen
// for Repeat Grow's app. A random `state` nonce goes in a short-lived
// httpOnly cookie and is checked on /callback.
// ============================================================

import { randomBytes } from 'node:crypto';
import { NextResponse } from 'next/server';

import { requireRole } from '@/lib/auth/account';
import {
  OAUTH_CALLBACK_PATH,
  SHOPIFY_SCOPES,
  appBaseUrl,
  shopifyAppCredentials,
} from '@/lib/shopify/config';
import { normalizeShopDomain } from '@/lib/shopify/verify';

// Read back by ../callback/route.ts.
const STATE_COOKIE = 'shopify_oauth_state';

function backToSettings(error: string) {
  const url = new URL('/settings', appBaseUrl());
  url.searchParams.set('tab', 'shopify');
  url.searchParams.set('shopify_error', error);
  return NextResponse.redirect(url);
}

export async function GET(request: Request) {
  try {
    await requireRole('admin');
  } catch {
    // Not signed in — typically a merchant arriving from the Shopify App
    // Store. Sign in (or sign up) first, then come straight back here
    // to finish connecting; `next` survives login, signup, Google and
    // the email-confirmation link.
    const { search } = new URL(request.url);
    const login = new URL('/login', appBaseUrl());
    login.searchParams.set('next', `/api/integrations/shopify/install${search}`);
    return NextResponse.redirect(login);
  }

  const creds = shopifyAppCredentials();
  if (!creds)
    return backToSettings('Shopify app is not configured on this server.');

  const shop = normalizeShopDomain(
    new URL(request.url).searchParams.get('shop')
  );
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
