// ============================================================
// POST /api/integrations/woocommerce/webhooks/<ingest_token>
//
// Webhooks the merchant created in WooCommerce (Settings -> Advanced ->
// Webhooks). The unguessable token identifies the store; the delivery is
// verified with X-WC-Webhook-Signature, the base64 HMAC-SHA256 of the raw
// body using the secret Repeat Grow generated for that store.
//
// Abuse handling: IPs that keep sending unknown tokens or bad signatures
// are blocked (webhookBlocked / recordWebhookRejection), and each
// X-WC-Webhook-Delivery-ID is processed once, so a captured request
// cannot be replayed to resend messages.
// ============================================================

import { NextResponse, after } from 'next/server';

import { supabaseAdmin } from '@/lib/flows/admin-client';
import { recordWebhookRejection, webhookBlocked } from '@/lib/rate-limit';
import { decrypt } from '@/lib/whatsapp/encryption';
import { verifyWooCommerceWebhook } from '@/lib/woocommerce/verify';
import {
  WOO_STORE_COLUMNS,
  handleWooWebhook,
  type WooStore,
} from '@/lib/woocommerce/process';

export const maxDuration = 60;

export async function POST(
  request: Request,
  { params }: { params: Promise<{ token: string }> }
) {
  const blocked = webhookBlocked(request, 'woocommerce');
  if (blocked) return blocked;

  const { token } = await params;
  const rawBody = await request.text();

  const { data: row } = await supabaseAdmin()
    .from('woocommerce_stores')
    .select(`${WOO_STORE_COLUMNS}, webhook_secret`)
    .eq('ingest_token', token)
    .maybeSingle<WooStore & { webhook_secret: string }>();

  if (!row) {
    recordWebhookRejection(request, 'woocommerce');
    return NextResponse.json({ error: 'Unknown webhook URL' }, { status: 404 });
  }

  let secret: string;
  try {
    secret = decrypt(row.webhook_secret);
  } catch {
    return NextResponse.json({ error: 'Store misconfigured' }, { status: 500 });
  }
  if (
    !verifyWooCommerceWebhook(
      rawBody,
      request.headers.get('x-wc-webhook-signature'),
      secret
    )
  ) {
    recordWebhookRejection(request, 'woocommerce');
    return NextResponse.json({ error: 'Invalid signature' }, { status: 401 });
  }

  // Disconnected in Repeat Grow but the webhook still exists in
  // WooCommerce: acknowledge and ignore.
  if (row.status !== 'active') return NextResponse.json({ ok: true });

  // WooCommerce sends a form-encoded "webhook_id=<n>" ping (also signed)
  // when a webhook is created or re-enabled. Acknowledge it.
  if (rawBody.startsWith('webhook_id=')) return NextResponse.json({ ok: true });

  let payload: Record<string, unknown>;
  try {
    payload = JSON.parse(rawBody);
  } catch {
    return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 });
  }

  const { webhook_secret: _secret, ...store } = row;
  void _secret;
  const topic = request.headers.get('x-wc-webhook-topic') ?? '';
  const deliveryId = request.headers.get('x-wc-webhook-delivery-id');

  after(() => handleWooWebhook(store, topic, deliveryId, payload));
  return NextResponse.json({ ok: true });
}
