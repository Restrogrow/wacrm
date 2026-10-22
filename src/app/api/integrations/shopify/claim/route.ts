// ============================================================
// GET /api/integrations/shopify/claim
//
// Finishes a Shopify install that started on the Shopify App Store
// before the merchant had a Repeat Grow session: /callback parked the
// tokens (migration 082) and set an httpOnly claim cookie, then sent
// them to sign in / sign up with `next` pointing here. Attaches the
// store to the signed-in admin's account. Single use; expires in an hour.
// ============================================================

import { cookies } from 'next/headers';
import { NextResponse } from 'next/server';

import { requireRole, UnauthorizedError } from '@/lib/auth/account';
import { appBaseUrl } from '@/lib/shopify/config';
import {
  PENDING_INSTALL_COOKIE,
  saveOAuthConnection,
  takePendingInstall,
} from '@/lib/shopify/connect';

const CLAIM_PATH = '/api/integrations/shopify/claim';

function backToSettings(params: Record<string, string>) {
  const url = new URL('/integrations/shopify', appBaseUrl());
  for (const [key, value] of Object.entries(params)) url.searchParams.set(key, value);
  const response = NextResponse.redirect(url);
  response.cookies.delete({ name: PENDING_INSTALL_COOKIE, path: '/api/integrations/shopify' });
  return response;
}

export async function GET(request: Request) {
  let ctx;
  try {
    ctx = await requireRole('admin');
  } catch (err) {
    if (err instanceof UnauthorizedError) {
      const login = new URL('/login', appBaseUrl());
      login.searchParams.set('next', CLAIM_PATH);
      return NextResponse.redirect(login);
    }
    return backToSettings({ shopify_error: 'Only an owner or admin can connect Shopify.' });
  }

  const claimToken = (await cookies()).get(PENDING_INSTALL_COOKIE)?.value;
  const pending = claimToken ? await takePendingInstall(claimToken) : null;
  if (!pending) {
    return backToSettings({
      shopify_error: 'That Shopify install has expired. Enter your store below and click Connect Shopify.',
    });
  }

  try {
    await saveOAuthConnection({
      accountId: ctx.accountId,
      userId: ctx.userId,
      shop: pending.shop,
      shopName: pending.shopName,
      columns: pending.columns,
      request,
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Could not connect the store';
    console.error('[shopify/claim]', message);
    return backToSettings({ shopify_error: message });
  }
  return backToSettings({ shopify: 'connected' });
}
