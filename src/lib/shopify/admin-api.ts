// ============================================================
// Shopify Admin API — OAuth token handling + webhook registration.
// Server-only.
//
// New Shopify apps must use EXPIRING offline tokens (`expiring=1`):
// the access token lasts ~1 hour and is renewed with a 90-day refresh
// token. We only call the Admin API at connect time (register webhooks,
// read the shop name) and on reconnect, so tokens are refreshed lazily
// in getAccessToken().
// https://shopify.dev/docs/apps/build/authentication-authorization/access-tokens/authorization-code-grant
// ============================================================

import { decrypt, encrypt } from '@/lib/whatsapp/encryption';
import { supabaseAdmin } from '@/lib/flows/admin-client';

import {
  OAUTH_WEBHOOK_PATH,
  SHOPIFY_API_VERSION,
  appBaseUrl,
  shopifyAppCredentials,
} from './config';
import { SHOPIFY_TOPICS } from './events';

export interface ShopifyTokenSet {
  accessToken: string;
  refreshToken: string | null;
  expiresAt: string | null;
  scope: string | null;
}

interface TokenResponse {
  access_token?: string;
  refresh_token?: string;
  expires_in?: number;
  scope?: string;
  error?: string;
  error_description?: string;
}

function toTokenSet(json: TokenResponse): ShopifyTokenSet {
  if (!json.access_token) {
    throw new Error(
      json.error_description || json.error || 'Shopify returned no access token'
    );
  }
  return {
    accessToken: json.access_token,
    refreshToken: json.refresh_token ?? null,
    expiresAt: json.expires_in
      ? new Date(Date.now() + json.expires_in * 1000).toISOString()
      : null,
    scope: json.scope ?? null,
  };
}

async function requestToken(
  shop: string,
  body: Record<string, string>
): Promise<ShopifyTokenSet> {
  const res = await fetch(`https://${shop}/admin/oauth/access_token`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/x-www-form-urlencoded',
      Accept: 'application/json',
    },
    body: new URLSearchParams(body).toString(),
  });
  const json = (await res.json().catch(() => ({}))) as TokenResponse;
  if (!res.ok) {
    throw new Error(
      `Shopify token request failed (${res.status}): ${json.error_description || json.error || 'unknown error'}`
    );
  }
  return toTokenSet(json);
}

export async function exchangeCodeForToken(
  shop: string,
  code: string
): Promise<ShopifyTokenSet> {
  const creds = shopifyAppCredentials();
  if (!creds) throw new Error('Shopify app is not configured');
  return requestToken(shop, {
    client_id: creds.clientId,
    client_secret: creds.clientSecret,
    code,
    expiring: '1',
  });
}

/** Encrypted columns for shopify_stores. */
export function tokenColumns(tokens: ShopifyTokenSet) {
  return {
    access_token: encrypt(tokens.accessToken),
    refresh_token: tokens.refreshToken ? encrypt(tokens.refreshToken) : null,
    access_token_expires_at: tokens.expiresAt,
    scopes: tokens.scope,
  };
}

export interface OAuthStoreRow {
  id: string;
  shop_domain: string;
  access_token: string | null;
  refresh_token: string | null;
  access_token_expires_at: string | null;
}

/** A usable access token for the store, refreshing it first when it's (nearly) expired. */
export async function getAccessToken(store: OAuthStoreRow): Promise<string> {
  if (!store.access_token) throw new Error('Store has no Shopify access token');
  const expiresAt = store.access_token_expires_at
    ? Date.parse(store.access_token_expires_at)
    : null;
  if (!expiresAt || expiresAt - Date.now() > 60_000)
    return decrypt(store.access_token);

  const creds = shopifyAppCredentials();
  if (!creds || !store.refresh_token) {
    throw new Error('Shopify access expired — reconnect the store');
  }
  const tokens = await requestToken(store.shop_domain, {
    client_id: creds.clientId,
    client_secret: creds.clientSecret,
    grant_type: 'refresh_token',
    refresh_token: decrypt(store.refresh_token),
  });
  await supabaseAdmin()
    .from('shopify_stores')
    .update({ ...tokenColumns(tokens), updated_at: new Date().toISOString() })
    .eq('id', store.id);
  return tokens.accessToken;
}

export async function shopifyGraphql<T>(
  shop: string,
  accessToken: string,
  query: string,
  variables?: Record<string, unknown>
): Promise<T> {
  const res = await fetch(
    `https://${shop}/admin/api/${SHOPIFY_API_VERSION}/graphql.json`,
    {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'X-Shopify-Access-Token': accessToken,
      },
      body: JSON.stringify({ query, variables }),
    }
  );
  const json = (await res.json().catch(() => ({}))) as {
    data?: T;
    errors?: { message: string }[] | string;
  };
  if (!res.ok || json.errors) {
    const message = Array.isArray(json.errors)
      ? json.errors.map((e) => e.message).join('; ')
      : json.errors || `HTTP ${res.status}`;
    throw new Error(`Shopify API error: ${message}`);
  }
  return json.data as T;
}

export async function fetchShopName(
  shop: string,
  accessToken: string
): Promise<string | null> {
  const data = await shopifyGraphql<{ shop?: { name?: string } }>(
    shop,
    accessToken,
    '{ shop { name } }'
  );
  return data.shop?.name ?? null;
}

const CREATE_SUBSCRIPTION = `
mutation webhookSubscriptionCreate($topic: WebhookSubscriptionTopic!, $webhookSubscription: WebhookSubscriptionInput!) {
  webhookSubscriptionCreate(topic: $topic, webhookSubscription: $webhookSubscription) {
    webhookSubscription { id }
    userErrors { field message }
  }
}`;

/**
 * Subscribe the shop to every topic we use (plus app/uninstalled),
 * delivered to /api/integrations/shopify/webhooks and signed with the
 * app's client secret. Re-running is safe: "already taken" counts as done.
 */
export async function registerWebhooks(
  shop: string,
  accessToken: string
): Promise<void> {
  const uri = `${appBaseUrl()}${OAUTH_WEBHOOK_PATH}`;
  const topics = [...SHOPIFY_TOPICS.map((t) => t.topic), 'app/uninstalled'];
  const failures: string[] = [];

  for (const topic of topics) {
    const data = await shopifyGraphql<{
      webhookSubscriptionCreate: { userErrors: { message: string }[] };
    }>(shop, accessToken, CREATE_SUBSCRIPTION, {
      topic: topic.toUpperCase().replace('/', '_'),
      webhookSubscription: { uri },
    });
    const errors = data.webhookSubscriptionCreate.userErrors.filter(
      (e) => !/already been taken|already exists/i.test(e.message)
    );
    if (errors.length > 0)
      failures.push(`${topic}: ${errors.map((e) => e.message).join('; ')}`);
  }

  if (failures.length > 0) {
    throw new Error(
      `Could not register Shopify webhooks — ${failures.join(' | ')}`
    );
  }
}
