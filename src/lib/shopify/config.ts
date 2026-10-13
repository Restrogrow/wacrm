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

/** Orders + checkouts topics need read_orders; fulfillments need read_fulfillments. */
export const SHOPIFY_SCOPES = 'read_orders,read_fulfillments';

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
