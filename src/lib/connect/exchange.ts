// ============================================================
// "Connect RepeatGrow" — code → API key exchange.
//
// The business logic behind POST /api/v1/connect/token, with its I/O
// injected so the security checks (wrong secret, reused / expired /
// mismatched code) are unit-testable.
// ============================================================

import { generateApiKey } from '@/lib/api-keys/keys';
import {
  connectedKeyName,
  isCodeRedeemable,
  sha256Hex,
  verifyClientSecret,
  type ConnectClient,
  type ConnectCodeRow,
} from './connect';

export interface ExchangeInput {
  client_id: string;
  client_secret: string;
  code: string;
  redirect_uri: string;
}

export interface ExchangeResult {
  api_key: string;
  account: { id: string; name: string | null };
  phone_number: string | null;
  scopes: string[];
}

export interface ExchangeDeps {
  findClient: (id: string) => Promise<ConnectClient | null>;
  consumeCode: (codeHash: string, clientId: string, redirectUri: string) => Promise<ConnectCodeRow | null>;
  insertKey: (row: {
    account_id: string;
    created_by: string;
    name: string;
    key_prefix: string;
    key_hash: string;
    scopes: string[];
    client_id: string;
  }) => Promise<{ id: string }>;
  getAccountName: (accountId: string) => Promise<string | null>;
  /** Display form of the account's connected WhatsApp number, or null. */
  getPhoneNumber: (accountId: string) => Promise<string | null>;
  now?: () => number;
}

/** Errors carry the wire code + HTTP status the route returns. */
export class ConnectError extends Error {
  constructor(
    readonly code: 'invalid_request' | 'invalid_client' | 'invalid_grant',
    message: string,
    readonly status: number
  ) {
    super(message);
    this.name = 'ConnectError';
  }
}

/** Shape-check the JSON body; throws `invalid_request` on anything off. */
export function parseExchangeInput(body: unknown): ExchangeInput {
  const b = (body && typeof body === 'object' ? body : {}) as Record<string, unknown>;
  const fields = ['client_id', 'client_secret', 'code', 'redirect_uri'] as const;
  const out = {} as ExchangeInput;
  for (const f of fields) {
    const v = b[f];
    if (typeof v !== 'string' || !v.trim() || v.length > 2048) {
      throw new ConnectError('invalid_request', `'${f}' is required`, 400);
    }
    out[f] = v.trim();
  }
  return out;
}

export async function exchangeConnectCode(
  input: ExchangeInput,
  deps: ExchangeDeps
): Promise<ExchangeResult> {
  const client = await deps.findClient(input.client_id);
  // Unknown client and wrong secret are indistinguishable on the wire.
  if (!client || !verifyClientSecret(client, input.client_secret)) {
    throw new ConnectError('invalid_client', 'Client authentication failed', 401);
  }

  const row = await deps.consumeCode(sha256Hex(input.code), client.id, input.redirect_uri);
  // The store only returns a row it just marked used, but re-check the
  // binding here so a store bug can't widen what a code is good for.
  if (!row || !isCodeRedeemable(row, client.id, input.redirect_uri, (deps.now ?? Date.now)())) {
    throw new ConnectError('invalid_grant', 'The code is invalid, expired, or already used', 400);
  }

  // Never grant more than the client is currently allowed, even if its
  // allowance shrank between consent and exchange.
  const scopes = row.scopes.filter((s) => client.allowed_scopes.includes(s));

  const { plaintext, hash, prefix } = generateApiKey();
  await deps.insertKey({
    account_id: row.account_id,
    created_by: row.user_id,
    name: connectedKeyName(client.name, row.label),
    key_prefix: prefix,
    key_hash: hash,
    scopes,
    client_id: client.id,
  });

  const [name, phone] = await Promise.all([
    deps.getAccountName(row.account_id),
    deps.getPhoneNumber(row.account_id).catch(() => null),
  ]);

  return {
    api_key: plaintext,
    account: { id: row.account_id, name },
    phone_number: phone,
    scopes,
  };
}
