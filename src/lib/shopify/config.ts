// ============================================================
// Shopify app configuration.
//
// The "Connect Shopify" (OAuth) option needs Repeat Grow's own Shopify
// app, created once in the Shopify Dev Dashboard:
//   SHOPIFY_API_KEY     — the app's Client ID
//   SHOPIFY_API_SECRET  — the app's Client secret (also signs webhooks)
// Without them only the manual webhook option is offered.
// ============================================================

import { publicOrigin } from '@/lib/public-origin';

export const SHOPIFY_API_VERSION = '2026-10';

/**
 * Orders + checkouts topics need read_orders; fulfillments need
 * read_fulfillments. The 30-minute auto-sync (auto-sync.ts) reads
 * products and customers. Stores connected before those two were added
 * keep working; they sync products from the public feed and skip
 * customers until reconnected (see missingScopes).
 */
export const SHOPIFY_SCOPES = 'read_orders,read_fulfillments,read_products,read_customers';

/** Scopes from SHOPIFY_SCOPES the store's token was not granted (null scopes = unknown → none missing). */
export function missingScopes(granted: string | null): string[] {
  if (granted == null) return [];
  const have = new Set(granted.split(',').map((s) => s.trim()));
  // write_x implies read_x in Shopify.
  return SHOPIFY_SCOPES.split(',').filter(
    (s) => !have.has(s) && !have.has(s.replace(/^read_/, 'write_'))
  );
}

export function shopifyAppCredentials(): {
  clientId: string;
  clientSecret: string;
} | null {
  const clientId = process.env.SHOPIFY_API_KEY;
  const clientSecret = process.env.SHOPIFY_API_SECRET;
  return clientId && clientSecret ? { clientId, clientSecret } : null;
}

/** Public base URL for callbacks and webhook endpoints (Shopify requires HTTPS). */
export function appBaseUrl(): string {
  return publicOrigin();
}

export const OAUTH_CALLBACK_PATH = '/api/integrations/shopify/callback';
export const OAUTH_WEBHOOK_PATH = '/api/integrations/shopify/webhooks';

export function manualWebhookUrl(ingestToken: string): string {
  return `${appBaseUrl()}${OAUTH_WEBHOOK_PATH}/${ingestToken}`;
}
