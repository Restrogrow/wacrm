// ============================================================
// POST /api/integrations/shopify/webhooks/<ingest_token>
//
// Webhooks a merchant created by hand in Shopify admin (Settings →
// Notifications → Webhooks), for stores connected with the "webhook"
// option. The unguessable token identifies the store; the signature is
// checked with the signing key the merchant copied from that page.
// ============================================================

import { NextResponse, after } from 'next/server';

import { supabaseAdmin } from '@/lib/flows/admin-client';
import { decrypt } from '@/lib/whatsapp/encryption';
import {
  STORE_COLUMNS,
  handleShopifyWebhook,
  type ShopifyStore,
} from '@/lib/shopify/process';
import { verifyShopifyWebhook } from '@/lib/shopify/verify';

export const maxDuration = 60;

export async function POST(
  request: Request,
  { params }: { params: Promise<{ token: string }> }
) {
  const { token } = await params;
  const rawBody = await request.text();

  const { data: row } = await supabaseAdmin()
    .from('shopify_stores')
    .select(`${STORE_COLUMNS}, webhook_secret`)
    .eq('ingest_token', token)
    .eq('connection_type', 'webhook')
    .maybeSingle<ShopifyStore & { webhook_secret: string | null }>();

  if (!row || !row.webhook_secret) {
    return NextResponse.json({ error: 'Unknown webhook URL' }, { status: 404 });
  }

  let secret: string;
  try {
    secret = decrypt(row.webhook_secret);
  } catch {
    return NextResponse.json({ error: 'Store misconfigured' }, { status: 500 });
  }
  if (
    !verifyShopifyWebhook(
      rawBody,
      request.headers.get('x-shopify-hmac-sha256'),
      secret
    )
  ) {
    return NextResponse.json({ error: 'Invalid signature' }, { status: 401 });
  }

  // Disconnected in Repeat Grow but the webhook still exists in
  // Shopify: acknowledge and ignore.
  if (row.status !== 'active') return NextResponse.json({ ok: true });

  let payload: Record<string, unknown>;
  try {
    payload = JSON.parse(rawBody);
  } catch {
    return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 });
  }

  const { webhook_secret: _secret, ...store } = row;
  void _secret;
  const topic = request.headers.get('x-shopify-topic') ?? '';
  const webhookId = request.headers.get('x-shopify-webhook-id');

  after(() => handleShopifyWebhook(store, topic, webhookId, payload));
  return NextResponse.json({ ok: true });
}
