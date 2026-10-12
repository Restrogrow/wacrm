// ============================================================
// POST /api/v1/connect/token — exchange a Connect code for an API key.
//
// Called server to server by a partner app (e.g. RestroGrow) after the
// account owner clicked Allow on /connect/[client]. No API key on this
// route: the partner authenticates with its client secret.
//
// Body:
//   { "client_id", "client_secret", "code", "redirect_uri" }
//
// Response (200), the key is returned exactly once and never stored:
//   { "data": { "api_key": "wacrm_live_…", "account": { "id", "name" },
//               "phone_number": "+91 98765 43210" | null,
//               "scopes": ["messages:send", …] } }
//
// Errors: 400 invalid_request / invalid_grant, 401 invalid_client,
// 429 rate_limited. Contract: docs/RESTROGROW_CONNECT.md §3.4.
// ============================================================

import { ok, fail, rateLimited, toApiErrorResponse } from '@/lib/api/v1/respond';
import { getAccountName } from '@/lib/api-keys/store';
import { ConnectError, exchangeConnectCode, parseExchangeInput } from '@/lib/connect/exchange';
import {
  consumeConnectCode,
  findConnectClient,
  findWhatsAppConfig,
  insertClientApiKey,
} from '@/lib/connect/store';
import { decrypt } from '@/lib/whatsapp/encryption';
import { verifyPhoneNumber } from '@/lib/whatsapp/meta-api';
import { checkRateLimit, RATE_LIMITS } from '@/lib/rate-limit';

function getClientIp(request: Request): string {
  const xff = request.headers.get('x-forwarded-for');
  if (xff) return xff.split(',')[0].trim();
  const xri = request.headers.get('x-real-ip');
  if (xri) return xri.trim();
  return 'unknown';
}

/** The connected number in display form (Graph API), or null. */
async function getPhoneNumber(accountId: string): Promise<string | null> {
  const config = await findWhatsAppConfig(accountId);
  if (!config?.phone_number_id || !config.access_token) return null;
  const info = await verifyPhoneNumber({
    phoneNumberId: config.phone_number_id,
    accessToken: decrypt(config.access_token),
  });
  return info.display_phone_number ?? null;
}

export async function POST(request: Request) {
  try {
    const ipLimit = checkRateLimit(`connectToken:ip:${getClientIp(request)}`, RATE_LIMITS.connectToken);
    if (!ipLimit.success) throw rateLimited(ipLimit);

    const input = parseExchangeInput(await request.json().catch(() => null));

    const clientLimit = checkRateLimit(`connectToken:client:${input.client_id}`, RATE_LIMITS.connectToken);
    if (!clientLimit.success) throw rateLimited(clientLimit);

    const result = await exchangeConnectCode(input, {
      findClient: (id) => findConnectClient(id),
      consumeCode: (hash, clientId, redirectUri) => consumeConnectCode(hash, clientId, redirectUri),
      insertKey: (row) => insertClientApiKey(row),
      getAccountName,
      getPhoneNumber,
    });

    return ok(result);
  } catch (err) {
    if (err instanceof ConnectError) return fail(err.code, err.message, err.status);
    return toApiErrorResponse(err);
  }
}
