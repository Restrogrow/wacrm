// Thin wrapper over Google's OAuth + Sheets REST APIs (no SDK).

import { decrypt, encrypt } from '@/lib/whatsapp/encryption';
import { supabaseAdmin } from '@/lib/flows/admin-client';
import {
  CONTACTS_HEADER,
  CONTACTS_TAB,
  MESSAGES_HEADER,
  MESSAGES_TAB,
  googleCredentials,
  redirectUri,
} from './config';

const SHEETS = 'https://sheets.googleapis.com/v4/spreadsheets';

export interface GoogleTokens {
  accessToken: string;
  refreshToken: string | null;
  expiresAt: string;
  email: string | null;
}

async function tokenRequest(body: Record<string, string>) {
  const creds = googleCredentials();
  if (!creds) throw new Error('Google is not configured on this server.');
  const res = await fetch('https://oauth2.googleapis.com/token', {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      client_id: creds.clientId,
      client_secret: creds.clientSecret,
      ...body,
    }),
  });
  const json = (await res.json().catch(() => ({}))) as {
    access_token?: string;
    refresh_token?: string;
    expires_in?: number;
    id_token?: string;
    error_description?: string;
    error?: string;
  };
  if (!res.ok || !json.access_token) {
    throw new Error(json.error_description || json.error || `Google returned ${res.status}`);
  }
  return json;
}

function emailFromIdToken(idToken?: string): string | null {
  if (!idToken) return null;
  try {
    const payload = JSON.parse(Buffer.from(idToken.split('.')[1], 'base64url').toString('utf8'));
    return typeof payload.email === 'string' ? payload.email : null;
  } catch {
    return null;
  }
}

export async function exchangeCode(code: string): Promise<GoogleTokens> {
  const json = await tokenRequest({
    grant_type: 'authorization_code',
    code,
    redirect_uri: redirectUri(),
  });
  return {
    accessToken: json.access_token!,
    refreshToken: json.refresh_token ?? null,
    expiresAt: new Date(Date.now() + (json.expires_in ?? 3600) * 1000).toISOString(),
    email: emailFromIdToken(json.id_token),
  };
}

export interface Connection {
  account_id: string;
  access_token: string;
  refresh_token: string;
  token_expires_at: string;
  spreadsheet_id: string | null;
  sync_contacts: boolean;
  sync_messages: boolean;
  status: string;
}

/** A valid access token, refreshing (and persisting) it when about to expire. */
export async function getAccessToken(conn: Connection): Promise<string> {
  if (new Date(conn.token_expires_at).getTime() > Date.now() + 60_000) {
    return decrypt(conn.access_token);
  }
  const json = await tokenRequest({
    grant_type: 'refresh_token',
    refresh_token: decrypt(conn.refresh_token),
  });
  const expiresAt = new Date(Date.now() + (json.expires_in ?? 3600) * 1000).toISOString();
  await supabaseAdmin()
    .from('google_sheets_connections')
    .update({
      access_token: encrypt(json.access_token!),
      token_expires_at: expiresAt,
      updated_at: new Date().toISOString(),
    })
    .eq('account_id', conn.account_id);
  return json.access_token!;
}

async function sheetsFetch(token: string, url: string, init?: RequestInit) {
  const res = await fetch(url, {
    ...init,
    headers: {
      Authorization: `Bearer ${token}`,
      'Content-Type': 'application/json',
      ...(init?.headers ?? {}),
    },
  });
  const json = (await res.json().catch(() => ({}))) as { error?: { message?: string } } & Record<string, unknown>;
  if (!res.ok) throw new Error(json.error?.message || `Google Sheets returned ${res.status}`);
  return json;
}

/** Pull the spreadsheet ID out of a full URL (or accept a bare ID). */
export function parseSpreadsheetId(input: string): string | null {
  const m = input.match(/\/spreadsheets\/d\/([a-zA-Z0-9-_]+)/);
  if (m) return m[1];
  return /^[a-zA-Z0-9-_]{20,}$/.test(input.trim()) ? input.trim() : null;
}

export async function createSpreadsheet(token: string, title: string) {
  const json = (await sheetsFetch(token, SHEETS, {
    method: 'POST',
    body: JSON.stringify({
      properties: { title },
      sheets: [{ properties: { title: CONTACTS_TAB } }, { properties: { title: MESSAGES_TAB } }],
    }),
  })) as { spreadsheetId: string; spreadsheetUrl: string; properties: { title: string } };
  await writeHeaders(token, json.spreadsheetId);
  return { id: json.spreadsheetId, url: json.spreadsheetUrl, title: json.properties.title };
}

/** Open an existing spreadsheet, adding the Contacts / Messages tabs if missing. */
export async function prepareExistingSpreadsheet(token: string, id: string) {
  const meta = (await sheetsFetch(
    token,
    `${SHEETS}/${id}?fields=spreadsheetUrl,properties.title,sheets.properties.title`
  )) as { spreadsheetUrl: string; properties: { title: string }; sheets: { properties: { title: string } }[] };

  const have = new Set(meta.sheets.map((s) => s.properties.title));
  const missing = [CONTACTS_TAB, MESSAGES_TAB].filter((t) => !have.has(t));
  if (missing.length) {
    await sheetsFetch(token, `${SHEETS}/${id}:batchUpdate`, {
      method: 'POST',
      body: JSON.stringify({
        requests: missing.map((title) => ({ addSheet: { properties: { title } } })),
      }),
    });
  }
  await writeHeaders(token, id);
  return { id, url: meta.spreadsheetUrl, title: meta.properties.title };
}

async function writeHeaders(token: string, id: string) {
  for (const [tab, header] of [
    [CONTACTS_TAB, CONTACTS_HEADER],
    [MESSAGES_TAB, MESSAGES_HEADER],
  ] as const) {
    const existing = (await sheetsFetch(token, `${SHEETS}/${id}/values/${tab}!A1:A1`)) as { values?: string[][] };
    if (existing.values?.length) continue; // never clobber an existing header
    await sheetsFetch(token, `${SHEETS}/${id}/values/${tab}!A1?valueInputOption=RAW`, {
      method: 'PUT',
      body: JSON.stringify({ values: [header] }),
    });
  }
}

export async function appendRows(token: string, id: string, tab: string, rows: string[][]) {
  if (!rows.length) return;
  await sheetsFetch(
    token,
    `${SHEETS}/${id}/values/${tab}!A1:append?valueInputOption=RAW&insertDataOption=INSERT_ROWS`,
    { method: 'POST', body: JSON.stringify({ values: rows }) }
  );
}
