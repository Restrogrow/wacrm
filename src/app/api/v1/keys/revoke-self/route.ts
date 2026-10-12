// ============================================================
// POST /api/v1/keys/revoke-self — a key revokes itself.
//
// Any valid key, no scope needed. Used by partner apps for
// "Disconnect" (docs/RESTROGROW_CONNECT.md §3.7). Revocation is
// effective immediately: the next request with this key gets a 401.
//
// Response (200): { "data": { "revoked": true } }
// ============================================================

import { requireApiKey } from '@/lib/auth/api-context';
import { ok, toApiErrorResponse } from '@/lib/api/v1/respond';

export async function POST(request: Request) {
  try {
    const ctx = await requireApiKey(request);
    const { error } = await ctx.supabase
      .from('api_keys')
      .update({ revoked_at: new Date().toISOString() })
      .eq('id', ctx.keyId)
      .eq('account_id', ctx.accountId)
      .is('revoked_at', null);
    if (error) throw error;
    return ok({ revoked: true });
  } catch (err) {
    return toApiErrorResponse(err);
  }
}
