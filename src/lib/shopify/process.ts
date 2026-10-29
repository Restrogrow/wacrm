// ============================================================
// Shopify webhook processing → WhatsApp template sends. Server-only.
//
// Both connection types (OAuth app, manual admin webhooks) end up in
// handleShopifyWebhook once the delivery is verified. Flow per topic:
//
//   orders/create         store the order, close its checkout, send
//                         "COD order placed" (if COD + enabled) or
//                         "Order placed"
//   orders/cancelled      send "Order cancelled"
//   fulfillments/create   store tracking, send "Order shipped"
//   fulfillments/update   carrier status out_for_delivery / delivered
//                         → "Out for delivery" / "Delivered"
//   checkouts/create|update  track the checkout; processDueCheckouts()
//                         (every-minute cron) sends "Abandoned cart"
//   app/uninstalled       mark the store disconnected
//
// Idempotency: Shopify retries deliveries, and fulfillment status can
// arrive more than once. Every delivery is recorded by its webhook id,
// and every send claims a "send:<event>:<entity>" row first — a
// unique-violation means it was already handled.
// ============================================================

import type { SupabaseClient } from '@supabase/supabase-js';
import { recordWebhookFailure } from '@/lib/ops/monitoring';

import { fireTeamAlert } from '@/lib/alerts/server';
import { supabaseAdmin } from '@/lib/flows/admin-client';
import { isUniqueViolation } from '@/lib/contacts/dedupe';
import { isPhoneOptedOut } from '@/lib/contacts/opt-out';
import { resolveConversationByPhone } from '@/lib/whatsapp/resolve-conversation';
import { sendMessageToConversation } from '@/lib/whatsapp/send-message';

import {
  EVENT_META,
  checkoutContext,
  contactPhoneOf,
  customerNamesOf,
  formatMoney,
  isCashOnDelivery,
  isShopifyVariable,
  orderContext,
  paymentMethodOf,
  resolveBodyParams,
  shipmentStatusEvent,
  summarizeItems,
  trackingOf,
  type MessageContext,
  type ShopifyEvent,
  type ShopifyVariable,
} from './events';
import { normalizeIntegrationPhone } from '@/lib/integrations/phone';
import { HOLD_WAITING_TEXT } from '@/lib/whatsapp/billing-hold';

/* eslint-disable @typescript-eslint/no-explicit-any */
type Json = Record<string, any>;

export interface ShopifyStore {
  id: string;
  account_id: string;
  shop_domain: string;
  shop_name: string | null;
  connection_type: 'oauth' | 'webhook';
  default_country_code: string;
  status: 'active' | 'disconnected';
}

export const STORE_COLUMNS =
  'id, account_id, shop_domain, shop_name, connection_type, default_country_code, status';

interface EventRule {
  enabled: boolean;
  template_name: string | null;
  template_language: string | null;
  body_variables: unknown;
  delay_minutes: number;
}

async function loadRule(
  db: SupabaseClient,
  accountId: string,
  event: ShopifyEvent,
  includeDisabled = false
): Promise<EventRule | null> {
  const { data } = await db
    .from('shopify_event_rules')
    .select(
      'enabled, template_name, template_language, body_variables, delay_minutes'
    )
    .eq('account_id', accountId)
    .eq('event', event)
    .maybeSingle();
  return data && (data.enabled || includeDisabled) && data.template_name
    ? (data as EventRule)
    : null;
}

function ruleVariables(rule: EventRule): ShopifyVariable[] {
  return Array.isArray(rule.body_variables)
    ? rule.body_variables.filter(isShopifyVariable)
    : [];
}

// ------------------------------------------------------------
// Sending
// ------------------------------------------------------------

interface SendRequest {
  event: ShopifyEvent;
  /** Unique per logical message, e.g. "order_shipped:<fulfillment id>". */
  sendKey: string;
  topic: string;
  rawPhone: string | null;
  countryCode: string | null;
  customerName: string | null;
  ctx: MessageContext;
  orderName: string | null;
  /** Lets "COD order placed" fall back to the "Order placed" rule. */
  fallbackEvent?: ShopifyEvent;
}

export type SendOutcome =
  | { status: 'sent'; whatsappMessageId: string; contactId: string }
  | { status: 'skipped' | 'failed'; detail: string }
  | { status: 'no_rule' | 'duplicate' };

/** Send one templated message for a Shopify event, logging it in shopify_events. */
export async function sendShopifyEvent(
  store: ShopifyStore,
  req: SendRequest,
  /** Test sends from Settings use the saved rule even while it's switched off. */
  options: { test?: boolean } = {}
): Promise<SendOutcome> {
  const db = supabaseAdmin();
  let event = req.event;
  let rule = await loadRule(db, store.account_id, event, options.test);
  if (!rule && req.fallbackEvent) {
    event = req.fallbackEvent;
    rule = await loadRule(db, store.account_id, event);
  }
  if (!rule) return { status: 'no_rule' };

  const phone = normalizeIntegrationPhone(
    req.rawPhone,
    req.countryCode,
    store.default_country_code
  );

  // Claim the send. A duplicate key means this exact message was
  // already handled (Shopify retry, or the same status twice).
  const { data: claim, error: claimErr } = await db
    .from('shopify_events')
    .insert({
      account_id: store.account_id,
      store_id: store.id,
      delivery_id: `send:${req.sendKey}`,
      topic: req.topic,
      event,
      order_name: req.orderName,
      phone,
      status: 'received',
    })
    .select('id')
    .single();
  if (claimErr) {
    if (isUniqueViolation(claimErr)) return { status: 'duplicate' };
    console.error('[shopify] could not log send:', claimErr.message);
    return { status: 'failed', detail: claimErr.message };
  }

  const finish = async (outcome: SendOutcome): Promise<SendOutcome> => {
    await db
      .from('shopify_events')
      .update({
        status: outcome.status,
        detail: 'detail' in outcome ? outcome.detail : null,
        whatsapp_message_id:
          outcome.status === 'sent' ? outcome.whatsappMessageId : null,
      })
      .eq('id', claim.id);
    return outcome;
  };

  if (!phone) {
    return finish({
      status: 'skipped',
      detail: req.rawPhone
        ? `Phone number "${req.rawPhone}" isn't a valid WhatsApp number`
        : 'No phone number on the order',
    });
  }

  if (
    EVENT_META[event].marketing &&
    (await isPhoneOptedOut(db, store.account_id, phone))
  ) {
    return finish({
      status: 'skipped',
      detail: 'Customer opted out of marketing messages',
    });
  }

  try {
    const { conversationId, contactId } = await resolveConversationByPhone(
      db,
      store.account_id,
      phone,
      req.customerName
    );
    const result = await sendMessageToConversation(db, store.account_id, {
      conversationId,
      messageType: 'template',
      templateName: rule.template_name,
      templateLanguage: rule.template_language || 'en_US',
      templateMessageParams: {
        body: resolveBodyParams(ruleVariables(rule), req.ctx),
      },
      // Shopify order messages are free (the Shopify App Store listing
      // is "Free"), so they keep sending after the trial ends.
      planExempt: true,
    });
    // Billing hold: saved and sent automatically once Meta can charge again.
    if (result.held) return finish({ status: 'skipped', detail: HOLD_WAITING_TEXT });
    return finish({
      status: 'sent',
      whatsappMessageId: result.whatsappMessageId,
      contactId,
    });
  } catch (err) {
    const detail = err instanceof Error ? err.message : String(err);
    console.error(
      `[shopify] ${event} send failed for ${store.shop_domain}:`,
      detail
    );
    return finish({ status: 'failed', detail });
  }
}

// ------------------------------------------------------------
// Webhook handling
// ------------------------------------------------------------

/**
 * Process one verified webhook delivery. Never throws — failures are
 * logged in shopify_events so the merchant can see them in Settings.
 */
export async function handleShopifyWebhook(
  store: ShopifyStore,
  topic: string,
  deliveryId: string | null,
  payload: Json
): Promise<void> {
  const db = supabaseAdmin();
  try {
    // Checkout webhooks fire on every cart edit and are idempotent
    // upserts — don't log a receipt row for each one.
    if (deliveryId && !topic.startsWith('checkouts/')) {
      const { error } = await db.from('shopify_events').insert({
        account_id: store.account_id,
        store_id: store.id,
        delivery_id: deliveryId,
        topic,
        order_name: typeof payload.name === 'string' ? payload.name : null,
        status: 'received',
      });
      if (error && isUniqueViolation(error)) return; // Shopify retry
    }

    await db
      .from('shopify_stores')
      .update({ last_event_at: new Date().toISOString() })
      .eq('id', store.id);

    switch (topic) {
      case 'orders/create':
        await onOrderCreated(db, store, payload);
        break;
      case 'orders/cancelled':
        await onOrderCancelled(db, store, payload);
        break;
      case 'fulfillments/create':
        await onFulfillment(db, store, payload, 'order_shipped', topic);
        break;
      case 'fulfillments/update': {
        const event = shipmentStatusEvent(payload.shipment_status);
        await onFulfillment(db, store, payload, event, topic);
        break;
      }
      case 'checkouts/create':
      case 'checkouts/update':
        await onCheckout(db, store, payload);
        break;
      case 'app/uninstalled':
        await db
          .from('shopify_stores')
          .update({
            status: 'disconnected',
            access_token: null,
            refresh_token: null,
            updated_at: new Date().toISOString(),
          })
          .eq('id', store.id);
        break;
      default:
        break;
    }
  } catch (err) {
    console.error(
      `[shopify] ${topic} handling failed for ${store.shop_domain}:`,
      err
    );
    await recordWebhookFailure('shopify', err, {
      accountId: store.account_id,
      context: { topic, shop: store.shop_domain, delivery_id: deliveryId },
    });
  }
}

async function upsertOrder(
  db: SupabaseClient,
  store: ShopifyStore,
  order: Json
) {
  const { phone, countryCode } = contactPhoneOf(order);
  const names = customerNamesOf(order);
  const row = {
    account_id: store.account_id,
    store_id: store.id,
    shopify_order_id: String(order.id),
    order_name: order.name ?? null,
    phone,
    customer_name: names.full,
    email: order.email ?? order.customer?.email ?? null,
    total: order.total_price ?? null,
    currency: order.currency ?? null,
    payment_method: paymentMethodOf(order),
    order_status_url: order.order_status_url ?? null,
    checkout_token: order.checkout_token ?? null,
    updated_at: new Date().toISOString(),
  };
  const { error } = await db
    .from('shopify_orders')
    .upsert(row, { onConflict: 'store_id,shopify_order_id' });
  if (error) console.error('[shopify] order upsert failed:', error.message);
  return { phone, countryCode, names };
}

async function onOrderCreated(
  db: SupabaseClient,
  store: ShopifyStore,
  order: Json
) {
  const { phone, countryCode, names } = await upsertOrder(db, store, order);

  // The checkout became an order — no abandoned-cart reminder.
  if (order.checkout_token) {
    await db
      .from('shopify_checkouts')
      .update({ completed_at: new Date().toISOString() })
      .eq('store_id', store.id)
      .eq('checkout_token', order.checkout_token)
      .is('completed_at', null);
  }

  // Team alert (Slack / Discord / Telegram), once per order. Never throws.
  await fireTeamAlert(store.account_id, 'order_placed', {
    contactName: names.full,
    phone,
    orderNumber: order.name ?? null,
    amountRupees: order.total_price ? `${order.currency ?? ''} ${order.total_price}`.trim() : null,
  });

  const cod = isCashOnDelivery(order);
  const outcome = await sendShopifyEvent(store, {
    event: cod ? 'cod_order_placed' : 'order_placed',
    fallbackEvent: cod ? 'order_placed' : undefined,
    sendKey: `order_placed:${order.id}`,
    topic: 'orders/create',
    rawPhone: phone,
    countryCode,
    customerName: names.full,
    ctx: orderContext(order, store.shop_name),
    orderName: order.name ?? null,
  });
  if (outcome.status === 'sent') {
    await db
      .from('shopify_orders')
      .update({ contact_id: outcome.contactId })
      .eq('store_id', store.id)
      .eq('shopify_order_id', String(order.id));
  }
}

async function onOrderCancelled(
  db: SupabaseClient,
  store: ShopifyStore,
  order: Json
) {
  const { phone, countryCode, names } = await upsertOrder(db, store, order);
  await sendShopifyEvent(store, {
    event: 'order_cancelled',
    sendKey: `order_cancelled:${order.id}`,
    topic: 'orders/cancelled',
    rawPhone: phone,
    countryCode,
    customerName: names.full,
    ctx: orderContext(order, store.shop_name),
    orderName: order.name ?? null,
  });
}

/**
 * Fulfillment payloads carry the order id and tracking but not the
 * customer, so the stored order supplies the phone and name. Falls
 * back to the fulfillment's destination address.
 */
async function onFulfillment(
  db: SupabaseClient,
  store: ShopifyStore,
  fulfillment: Json,
  event: ShopifyEvent | null,
  topic: string
) {
  const orderId = fulfillment.order_id ? String(fulfillment.order_id) : null;
  const tracking = trackingOf(fulfillment);

  const { data: order } = orderId
    ? await db
        .from('shopify_orders')
        .select('*')
        .eq('store_id', store.id)
        .eq('shopify_order_id', orderId)
        .maybeSingle()
    : { data: null };

  if (order && (tracking.number || tracking.url)) {
    await db
      .from('shopify_orders')
      .update({
        tracking_number: tracking.number,
        tracking_url: tracking.url,
        tracking_company: tracking.company,
        updated_at: new Date().toISOString(),
      })
      .eq('id', order.id);
  }

  if (!event) return;

  const destination = contactPhoneOf(fulfillment);
  const destNames = customerNamesOf({
    shipping_address: fulfillment.destination,
  });
  const firstName = order?.customer_name?.split(' ')[0] ?? destNames.first;

  const ctx: MessageContext = {
    customer_name: firstName ?? null,
    customer_full_name: order?.customer_name ?? destNames.full,
    order_number:
      order?.order_name ??
      (fulfillment.name ? String(fulfillment.name).split('.')[0] : null),
    order_total: order ? formatMoney(order.total, order.currency) : null,
    items: summarizeItems(fulfillment.line_items),
    payment_method: order?.payment_method ?? null,
    order_status_url: order?.order_status_url ?? null,
    tracking_number: tracking.number ?? order?.tracking_number ?? null,
    tracking_url: tracking.url ?? order?.tracking_url ?? null,
    courier: tracking.company ?? order?.tracking_company ?? null,
    checkout_url: null,
    shop_name: store.shop_name,
  };

  await sendShopifyEvent(store, {
    event,
    sendKey: `${event}:${fulfillment.id ?? orderId}`,
    topic,
    rawPhone: order?.phone ?? destination.phone,
    countryCode: destination.countryCode,
    customerName: ctx.customer_full_name,
    ctx,
    orderName: ctx.order_number,
  });
}

async function onCheckout(
  db: SupabaseClient,
  store: ShopifyStore,
  checkout: Json
) {
  const token = checkout.token ?? checkout.cart_token;
  if (!token) return;

  if (checkout.completed_at) {
    await db
      .from('shopify_checkouts')
      .update({ completed_at: checkout.completed_at })
      .eq('store_id', store.id)
      .eq('checkout_token', String(token));
    return;
  }

  const { phone } = contactPhoneOf(checkout);
  const names = customerNamesOf(checkout);
  const { error } = await db.from('shopify_checkouts').upsert(
    {
      account_id: store.account_id,
      store_id: store.id,
      checkout_token: String(token),
      phone,
      customer_name: names.full,
      email: checkout.email ?? null,
      total: checkout.total_price ?? null,
      currency: checkout.currency ?? checkout.presentment_currency ?? null,
      items: summarizeItems(checkout.line_items),
      recovery_url: checkout.abandoned_checkout_url ?? null,
      last_activity_at: checkout.updated_at ?? new Date().toISOString(),
    },
    { onConflict: 'store_id,checkout_token' }
  );
  if (error) console.error('[shopify] checkout upsert failed:', error.message);
}

// ------------------------------------------------------------
// Abandoned-cart cron
// ------------------------------------------------------------

/**
 * Send "Abandoned cart" reminders for checkouts idle longer than each
 * account's delay. Called from the every-minute automations cron.
 * Each checkout is reminded at most once (reminded_at claim).
 */
export async function processDueCheckouts(limit = 25): Promise<number> {
  const db = supabaseAdmin();

  const { data: rules, error: rulesErr } = await db
    .from('shopify_event_rules')
    .select('account_id, delay_minutes')
    .eq('event', 'abandoned_checkout')
    .eq('enabled', true)
    .not('template_name', 'is', null);
  // Table missing (migration 039 not applied) or nothing enabled.
  if (rulesErr || !rules || rules.length === 0) return 0;

  const delayByAccount = new Map(
    rules.map((r) => [r.account_id as string, r.delay_minutes as number])
  );
  const minDelay = Math.min(...delayByAccount.values());
  const now = Date.now();

  const { data: due } = await db
    .from('shopify_checkouts')
    .select('*')
    .in('account_id', [...delayByAccount.keys()])
    .is('completed_at', null)
    .is('reminded_at', null)
    .lte('last_activity_at', new Date(now - minDelay * 60_000).toISOString())
    // Don't chase carts abandoned more than a week ago.
    .gte('last_activity_at', new Date(now - 7 * 24 * 60 * 60_000).toISOString())
    .order('last_activity_at', { ascending: true })
    .limit(limit);

  let sent = 0;
  for (const checkout of due ?? []) {
    const delay = delayByAccount.get(checkout.account_id) ?? 60;
    if (Date.parse(checkout.last_activity_at) > now - delay * 60_000) continue;

    // Claim so an overlapping cron run can't remind twice.
    const { data: claimed } = await db
      .from('shopify_checkouts')
      .update({ reminded_at: new Date().toISOString() })
      .eq('id', checkout.id)
      .is('reminded_at', null)
      .select('id')
      .maybeSingle();
    if (!claimed) continue;

    const { data: store } = await db
      .from('shopify_stores')
      .select(STORE_COLUMNS)
      .eq('id', checkout.store_id)
      .eq('status', 'active')
      .maybeSingle<ShopifyStore>();
    if (!store) continue;

    const ctx = checkoutContext(
      {
        customer: { first_name: checkout.customer_name?.split(' ')[0] },
        abandoned_checkout_url: checkout.recovery_url,
        total_price: checkout.total,
        currency: checkout.currency,
      },
      store.shop_name
    );
    ctx.customer_full_name = checkout.customer_name;
    ctx.items = checkout.items;

    const outcome = await sendShopifyEvent(store, {
      event: 'abandoned_checkout',
      sendKey: `abandoned_checkout:${checkout.checkout_token}`,
      topic: 'checkouts/update',
      rawPhone: checkout.phone,
      countryCode: null,
      customerName: checkout.customer_name,
      ctx,
      orderName: null,
    });
    if (outcome.status === 'sent') sent++;
  }
  return sent;
}
