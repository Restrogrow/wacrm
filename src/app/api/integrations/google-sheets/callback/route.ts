// ============================================================
// GET /api/integrations/google-sheets/callback
//
// Google redirects here after consent. Check the state nonce, exchange
// the code for tokens, store them encrypted on the admin's account and
// return to the Google Sheets page.
// ============================================================

import { cookies } from 'next/headers';
import { NextResponse } from 'next/server';

import { requireRole } from '@/lib/auth/account';
import { supabaseAdmin } from '@/lib/flows/admin-client';
import { publicOrigin } from '@/lib/public-origin';
import { exchangeCode } from '@/lib/google-sheets/api';
import { googleCredentials } from '@/lib/google-sheets/config';
import { encrypt } from '@/lib/whatsapp/encryption';

const STATE_COOKIE = 'google_sheets_oauth_state';

function backToSettings(params: Record<string, string>) {
  const url = new URL('/integrations/google-sheets', publicOrigin());
  for (const [k, v] of Object.entries(params)) url.searchParams.set(k, v);
  const response = NextResponse.redirect(url);
  response.cookies.delete({ name: STATE_COOKIE, path: '/api/integrations/google-sheets' });
  return response;
}

export async function GET(request: Request) {
  if (!googleCredentials()) return backToSettings({ google_error: 'Google Sheets is not configured.' });

  const params = new URL(request.url).searchParams;
  if (params.get('error')) {
    return backToSettings({ google_error: 'Google sign-in was cancelled.' });
  }
  const code = params.get('code');
  const state = params.get('state');
  const cookieState = (await cookies()).get(STATE_COOKIE)?.value;
  if (!code || !state || !cookieState || state !== cookieState) {
    return backToSettings({ google_error: 'Connection expired. Please click Connect again.' });
  }

  let ctx;
  try {
    ctx = await requireRole('admin');
  } catch {
    return NextResponse.redirect(new URL('/login', publicOrigin()));
  }

  try {
    const tokens = await exchangeCode(code);
    const db = supabaseAdmin();

    const { data: existing } = await db
      .from('google_sheets_connections')
      .select('refresh_token')
      .eq('account_id', ctx.accountId)
      .maybeSingle();
    const refresh = tokens.refreshToken ? encrypt(tokens.refreshToken) : existing?.refresh_token;
    if (!refresh) throw new Error('Google did not return a refresh token. Remove Repeat Grow in your Google account permissions and try again.');

    const { error } = await db.from('google_sheets_connections').upsert(
      {
        account_id: ctx.accountId,
        google_email: tokens.email,
        access_token: encrypt(tokens.accessToken),
        refresh_token: refresh,
        token_expires_at: tokens.expiresAt,
        status: 'active',
        last_error: null,
        connected_by: ctx.userId,
        updated_at: new Date().toISOString(),
      },
      { onConflict: 'account_id' }
    );
    if (error) throw new Error(error.message);
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Could not connect Google';
    console.error('[google-sheets/callback]', message);
    return backToSettings({ google_error: message });
  }

  return backToSettings({ google: 'connected' });
}
