// ============================================================
// POST /api/integrations/shopify/webhooks
//
// Webhooks for stores connected through Repeat Grow's Shopify app
// (OAuth). Signed with the app's client secret; the store is found by
// the X-Shopify-Shop-Domain header. Also receives Shopify's mandatory
// privacy (GDPR) webhooks, configured in the app's settings.
//
// Respond 200 fast and process in after(): Shopify times out slow
// endpoints and retries, and eventually removes failing subscriptions.
// ============================================================

import { NextResponse, after } from 'next/server';

import { supabaseAdmin } from '@/lib/flows/admin-client';
import { shopifyAppCredentials } from '@/lib/shopify/config';
import {
  STORE_COLUMNS,
  handleShopifyWebhook,
  type ShopifyStore,
} from '@/lib/shopify/process';
import { isValidShopDomain, verifyShopifyWebhook } from '@/lib/shopify/verify';

export const maxDuration = 60;

const COMPLIANCE_TOPICS = new Set([
  'customers/data_request',
  'customers/redact',
  'shop/redact',
]);

export async function POST(request: Request) {
  const creds = shopifyAppCredentials();
  if (!creds) {
    return NextResponse.json(
      { error: 'Shopify app not configured' },
      { status: 404 }
    );
  }

  const rawBody = await request.text();
  if (
    !verifyShopifyWebhook(
      rawBody,
      request.headers.get('x-shopify-hmac-sha256'),
      creds.clientSecret
    )
  ) {
    return NextResponse.json({ error: 'Invalid signature' }, { status: 401 });
  }

  const topic = request.headers.get('x-shopify-topic') ?? '';
  const shop = request.headers.get('x-shopify-shop-domain');
  const webhookId = request.headers.get('x-shopify-webhook-id');

  let payload: Record<string, unknown>;
  try {
    payload = JSON.parse(rawBody);
  } catch {
    return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 });
  }
  if (!isValidShopDomain(shop)) {
    return NextResponse.json({ ok: true });
  }

  if (COMPLIANCE_TOPICS.has(topic)) {
    after(() => handleCompliance(topic, shop, payload));
    return NextResponse.json({ ok: true });
  }

  const { data: store } = await supabaseAdmin()
    .from('shopify_stores')
    .select(STORE_COLUMNS)
    .eq('shop_domain', shop)
    .eq('connection_type', 'oauth')
    .eq('status', 'active')
    .maybeSingle<ShopifyStore>();

  // Unknown or disconnected store: acknowledge so Shopify stops retrying.
  if (!store) return NextResponse.json({ ok: true });

  after(() => handleShopifyWebhook(store, topic, webhookId, payload));
  return NextResponse.json({ ok: true });
}

/**
 * Shopify's mandatory privacy webhooks.
 *   customers/data_request — we hold only order/checkout contact details,
 *                            visible to the merchant in Repeat Grow; ack.
 *   customers/redact       — delete that customer's stored orders/checkouts.
 *   shop/redact            — 48h after uninstall: delete everything for the shop.
 * Contacts and conversations belong to the merchant's CRM account and
 * are managed (and deletable) there.
 */
async function handleCompliance(
  topic: string,
  shop: string,
  payload: Record<string, unknown>
) {
  const db = supabaseAdmin();
  try {
    if (topic === 'shop/redact') {
      await db.from('shopify_stores').delete().eq('shop_domain', shop);
      return;
    }
    if (topic !== 'customers/redact') return;

    const { data: stores } = await db
      .from('shopify_stores')
      .select('id')
      .eq('shop_domain', shop);
    const storeIds = (stores ?? []).map((s) => s.id as string);
    if (storeIds.length === 0) return;

    const orderIds = Array.isArray(payload.orders_to_redact)
      ? payload.orders_to_redact.map(String)
      : [];
    if (orderIds.length > 0) {
      await db
        .from('shopify_orders')
        .delete()
        .in('store_id', storeIds)
        .in('shopify_order_id', orderIds);
    }
    const customer = (payload.customer ?? {}) as {
      email?: string;
      phone?: string;
    };
    if (customer.email) {
      await db
        .from('shopify_checkouts')
        .delete()
        .in('store_id', storeIds)
        .eq('email', customer.email);
      await db
        .from('shopify_orders')
        .delete()
        .in('store_id', storeIds)
        .eq('email', customer.email);
    }
    if (customer.phone) {
      await db
        .from('shopify_checkouts')
        .delete()
        .in('store_id', storeIds)
        .eq('phone', customer.phone);
      await db
        .from('shopify_orders')
        .delete()
        .in('store_id', storeIds)
        .eq('phone', customer.phone);
    }
  } catch (err) {
    console.error(`[shopify] compliance ${topic} failed for ${shop}:`, err);
  }
}
