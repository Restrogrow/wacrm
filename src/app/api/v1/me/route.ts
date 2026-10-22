// ============================================================
// GET /api/v1/me — public API identity probe.
//
// The reference endpoint for the public API: it requires nothing
// but a valid key (no scope), and returns the account the key is
// bound to plus the scopes it carries. Integrators use it to verify
// their key works and to discover what it's allowed to do before
// wiring up real calls.
//
// It also exercises the entire public-API stack end to end — bearer
// parse → hash lookup → liveness → rate limit → envelope — so a
// green response here means the plumbing every future endpoint
// depends on is sound.
//
// phone_number is the account's WhatsApp number right now, so a
// partner app (RestroGrow) can notice when the owner switched numbers.
// ============================================================

import { requireApiKey } from '@/lib/auth/api-context';
import { getAccountName } from '@/lib/api-keys/store';
import { ok, toApiErrorResponse } from '@/lib/api/v1/respond';
import { getConnectedPhoneNumber } from '@/lib/connect/phone';

/** How long /me waits for Meta's answer about the connected number. */
const PHONE_LOOKUP_MS = 4000;

export async function GET(request: Request) {
  try {
    const ctx = await requireApiKey(request);
    const [name, phone] = await Promise.all([
      getAccountName(ctx.accountId),
      // Meta being slow or down must not break (or stall) the identity probe:
      // give it a few seconds, then answer without the number
      Promise.race([
        getConnectedPhoneNumber(ctx.accountId).catch(() => undefined),
        new Promise<undefined>((resolve) => setTimeout(() => resolve(undefined), PHONE_LOOKUP_MS)),
      ]),
    ]);
    return ok({
      account: { id: ctx.accountId, name },
      // null: no number connected; undefined (left out): could not check
      ...(phone !== undefined ? { phone_number: phone } : {}),
      key: { id: ctx.keyId, scopes: ctx.scopes },
    });
  } catch (err) {
    return toApiErrorResponse(err);
  }
}
