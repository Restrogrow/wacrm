'use server';

// ============================================================
// Server actions for the Connect consent page (/connect/[client]).
//
// Every input arrives from a form the browser controls, so each action
// re-validates the whole request against the registered client before
// redirecting anywhere — a tampered redirect_uri throws instead of
// redirecting. Next's built-in Origin/Host check covers CSRF.
// ============================================================

import { redirect } from 'next/navigation';

import { requireRole } from '@/lib/auth/account';
import {
  buildRedirectUrl,
  CODE_TTL_MS,
  generateConnectCode,
  validateConnectRequest,
  type ConnectRequestParams,
} from '@/lib/connect/connect';
import { findConnectClient, insertConnectCode } from '@/lib/connect/store';

function readForm(formData: FormData): { routeClient: string; params: ConnectRequestParams } {
  const get = (k: string) => {
    const v = formData.get(k);
    return typeof v === 'string' ? v : null;
  };
  return {
    routeClient: get('route_client') ?? '',
    params: {
      client_id: get('client_id'),
      redirect_uri: get('redirect_uri'),
      state: get('state'),
      scopes: get('scopes'),
      restaurant: get('restaurant'),
    },
  };
}

async function validated(formData: FormData) {
  const { routeClient, params } = readForm(formData);
  const client = await findConnectClient(routeClient);
  const result = validateConnectRequest(routeClient, client, params);
  if (!result.ok) throw new Error(result.error);
  return result.request;
}

/** Allow: issue a one-time code and send the owner back to the app. */
export async function allowConnect(formData: FormData): Promise<void> {
  const request = await validated(formData);
  // Same bar as minting an API key by hand.
  const ctx = await requireRole('admin');

  const { code, hash } = generateConnectCode();
  await insertConnectCode({
    code_hash: hash,
    client_id: request.client.id,
    account_id: ctx.accountId,
    user_id: ctx.userId,
    scopes: request.scopes,
    redirect_uri: request.redirectUri,
    label: request.label,
    expires_at: new Date(Date.now() + CODE_TTL_MS).toISOString(),
  });

  redirect(buildRedirectUrl(request.redirectUri, { code, state: request.state }));
}

/** Cancel: tell the app the owner said no. */
export async function cancelConnect(formData: FormData): Promise<void> {
  const request = await validated(formData);
  redirect(buildRedirectUrl(request.redirectUri, { error: 'access_denied', state: request.state }));
}
