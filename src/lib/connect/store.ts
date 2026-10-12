// ============================================================
// "Connect RepeatGrow" — data access (service role).
//
// connect_clients / connect_codes have RLS on with no policies, so
// every read/write goes through the service-role client. Callers
// (the consent server action and the token route) do their own
// authorization before calling in.
// ============================================================

import type { SupabaseClient } from '@supabase/supabase-js';

import { supabaseAdmin } from '@/lib/flows/admin-client';
import type { ConnectClient, ConnectCodeRow } from './connect';

const CLIENT_COLUMNS = 'id, name, secret_hash, redirect_uris, allowed_scopes';

export async function findConnectClient(
  id: string,
  db: SupabaseClient = supabaseAdmin()
): Promise<ConnectClient | null> {
  if (!id || id.length > 64) return null;
  const { data, error } = await db
    .from('connect_clients')
    .select(CLIENT_COLUMNS)
    .eq('id', id)
    .maybeSingle();
  if (error) {
    console.error('[connect/store] client lookup error:', error.message);
    return null;
  }
  return (data as ConnectClient | null) ?? null;
}

export async function insertConnectCode(
  row: Omit<ConnectCodeRow, 'used_at'>,
  db: SupabaseClient = supabaseAdmin()
): Promise<void> {
  const { error } = await db.from('connect_codes').insert(row);
  if (error) throw new Error(`Could not store connect code: ${error.message}`);
}

/**
 * Atomically redeem a code: marks it used only if it is unused,
 * unexpired, and issued to this client for this redirect URI, and
 * returns the row. Returns null otherwise — a mismatched attempt does
 * not burn a code that someone else could still legitimately redeem.
 */
export async function consumeConnectCode(
  codeHash: string,
  clientId: string,
  redirectUri: string,
  db: SupabaseClient = supabaseAdmin()
): Promise<ConnectCodeRow | null> {
  const now = new Date().toISOString();
  const { data, error } = await db
    .from('connect_codes')
    .update({ used_at: now })
    .eq('code_hash', codeHash)
    .eq('client_id', clientId)
    .eq('redirect_uri', redirectUri)
    .is('used_at', null)
    .gt('expires_at', now)
    .select('*')
    .maybeSingle();
  if (error) {
    console.error('[connect/store] code consume error:', error.message);
    return null;
  }
  return (data as ConnectCodeRow | null) ?? null;
}

export async function insertClientApiKey(
  row: {
    account_id: string;
    created_by: string;
    name: string;
    key_prefix: string;
    key_hash: string;
    scopes: string[];
    client_id: string;
  },
  db: SupabaseClient = supabaseAdmin()
): Promise<{ id: string }> {
  const { data, error } = await db.from('api_keys').insert(row).select('id').single();
  if (error || !data) throw new Error(`Could not create API key: ${error?.message ?? 'no row'}`);
  return data as { id: string };
}

/** The account's WhatsApp credentials, if a number is connected. */
export async function findWhatsAppConfig(
  accountId: string,
  db: SupabaseClient = supabaseAdmin()
): Promise<{ phone_number_id: string; access_token: string; status: string | null } | null> {
  const { data } = await db
    .from('whatsapp_config')
    .select('phone_number_id, access_token, status')
    .eq('account_id', accountId)
    .maybeSingle();
  return (data as { phone_number_id: string; access_token: string; status: string | null } | null) ?? null;
}
