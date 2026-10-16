// ============================================================
// GET /api/integrations/google-sheets/install
//
// "Connect Google": send an admin to Google's consent screen. A random
// `state` nonce goes in a short-lived httpOnly cookie, checked on /callback.
// ============================================================

import { randomBytes } from 'node:crypto';
import { NextResponse } from 'next/server';

import { requireRole } from '@/lib/auth/account';
import { publicOrigin } from '@/lib/public-origin';
import { GOOGLE_SCOPES, googleCredentials, redirectUri } from '@/lib/google-sheets/config';

const STATE_COOKIE = 'google_sheets_oauth_state';

function backToSettings(error: string) {
  const url = new URL('/integrations/google-sheets', publicOrigin());
  url.searchParams.set('google_error', error);
  return NextResponse.redirect(url);
}

export async function GET() {
  try {
    await requireRole('admin');
  } catch {
    const login = new URL('/login', publicOrigin());
    login.searchParams.set('next', '/api/integrations/google-sheets/install');
    return NextResponse.redirect(login);
  }

  const creds = googleCredentials();
  if (!creds) return backToSettings('Google Sheets is not configured on this server.');

  const state = randomBytes(16).toString('hex');
  const authorize = new URL('https://accounts.google.com/o/oauth2/v2/auth');
  authorize.searchParams.set('client_id', creds.clientId);
  authorize.searchParams.set('redirect_uri', redirectUri());
  authorize.searchParams.set('response_type', 'code');
  authorize.searchParams.set('scope', GOOGLE_SCOPES);
  // offline + consent => Google always returns a refresh token.
  authorize.searchParams.set('access_type', 'offline');
  authorize.searchParams.set('prompt', 'consent');
  authorize.searchParams.set('state', state);

  const response = NextResponse.redirect(authorize);
  response.cookies.set(STATE_COOKIE, state, {
    httpOnly: true,
    secure: publicOrigin().startsWith('https://'),
    sameSite: 'lax',
    path: '/api/integrations/google-sheets',
    maxAge: 600,
  });
  return response;
}
