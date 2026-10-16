// ============================================================
// Google Sheets app configuration.
//
//   GOOGLE_CLIENT_ID      - OAuth client ID (type: Web application)
//   GOOGLE_CLIENT_SECRET  - OAuth client secret
//
// Redirect URI to register in Google Cloud:
//   <site origin>/api/integrations/google-sheets/callback
// ============================================================

import { publicOrigin } from '@/lib/public-origin';

export const GOOGLE_SCOPES = [
  'openid',
  'email',
  'https://www.googleapis.com/auth/spreadsheets',
].join(' ');

export const CONTACTS_TAB = 'Contacts';
export const MESSAGES_TAB = 'Messages';
export const CONTACTS_HEADER = ['Name', 'Phone', 'Email', 'Company', 'Added on'];
export const MESSAGES_HEADER = ['Time', 'Direction', 'Contact', 'Phone', 'Type', 'Message'];

export const CALLBACK_PATH = '/api/integrations/google-sheets/callback';

export function googleCredentials(): { clientId: string; clientSecret: string } | null {
  const clientId = process.env.GOOGLE_CLIENT_ID;
  const clientSecret = process.env.GOOGLE_CLIENT_SECRET;
  return clientId && clientSecret ? { clientId, clientSecret } : null;
}

export function redirectUri(): string {
  return `${publicOrigin()}${CALLBACK_PATH}`;
}
