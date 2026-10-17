// ============================================================
// WooCommerce webhook processing -> WhatsApp template sends. Server-only.
// Mirrors lib/shopify/process.ts.
//
// handleWooWebhook runs once a delivery has been verified. Flow:
//
//   order.created / order.updated  store the order, then send for the
//                                  order's CURRENT status:
//                                    processing / on-hold -> Order placed
//                                      (COD orders -> COD order placed)
//                                    completed            -> + Order completed
//                                    cancelled            -> Order cancelled
//                                    refunded             -> Order refunded
//                                  pending / failed orders send nothing, so
//                                  an unpaid online checkout is not
//                                  "confirmed" before payment succeeds.
//
// Idempotency: WooCommerce retries deliveries and order.updated fires on
// every edit. Each delivery is recorded by its delivery id, and every send
// claims a "send:<event>:<order>" row first; a unique violation means that
// message was already handled.
// ============================================================

import type { SupabaseClient } from '@supabase/supabase-js';

import { fireTeamAlert } from '@/lib/alerts/server';
import { supabaseAdmin } from '@/lib/flows/admin-client';
import { isUniqueViolation } from '@/lib/contacts/dedupe';
import { normalizeIntegrationPhone } from '@/lib/integrations/phone';
import { recordWebhookFailure } from '@/lib/ops/monitoring';
import { resolveConversationByPhone } from '@/lib/whatsapp/resolve-conversation';
import { sendMessageToConversation } from '@/lib/whatsapp/send-message';

import {
  eventsForStatus,
  isWooCashOnDelivery,
  isWooVariable,
  resolveWooBodyParams,
  wooContactPhoneOf,
  wooCustomerNamesOf,
  wooOrderContext,
  wooOrderNumberOf,
  wooOrderUrl,
  wooPaymentMethodOf,
  wooTrackingOf,
  type MessageContext,
  type WooEvent,
  type WooVariable,
} from './events';

/* eslint-disable @typescript-eslint/no-explicit-any */
type Json = Record<string, any>;

export interface WooStore {
  id: string;
  account_id: string;
  store_url: string;
  store_name: string | null;
  default_country_code: string;
  status: 'active' | 'disconnected';
}

export const WOO_STORE_COLUMNS =
  'id, account_id, store_url, store_name, default_country_code, status';

interface EventRule {
  enabled: boolean;
  template_name: string | null;
  template_language: string | null;
  body_variables: unknown;
}

async function loadRule(
  db: SupabaseClient,
  accountId: string,
  event: WooEvent,
  includeDisabled = false
): Promise<EventRule | null> {
  const { data } = await db
    .from('woocommerce_event_rules')
    .select('enabled, template_name, template_language, body_variables')
    .eq('account_id', accountId)
    .eq('event', event)
    .maybeSingle();
  return data && (data.enabled || includeDisabled) && data.template_name
    ? (data as EventRule)
    : null;
}

function ruleVariables(rule: EventRule): WooVariable[] {
  return Array.isArray(rule.body_variables)
    ? rule.body_variables.filter(isWooVariable)
    : [];
}

// ------------------------------------------------------------
// Sending
// ------------------------------------------------------------

interface SendRequest {
  event: WooEvent;
  /** Unique per logical message, e.g. "order_placed:<order id>". */
  sendKey: string;
  topic: string;
  rawPhone: string | null;
  countryCode: string | null;
  customerName: string | null;
  ctx: MessageContext;
  orderNumber: string | null;
  /** Lets "COD order placed" fall back to the "Order placed" rule. */
  fallbackEvent?: WooEvent;
}

export type WooSendOutcome =
  | { status: 'sent'; whatsappMessageId: string; contactId: string }
  | { status: 'skipped' | 'failed'; detail: string }
  | { status: 'no_rule' | 'duplicate' };

/** Send one templated message for a WooCommerce event, logging it in woocommerce_events. */
export async function sendWooEvent(
  store: WooStore,
  req: SendRequest,
  /** Test sends from Settings use the saved rule even while it is switched off. */
  options: { test?: boolean } = {}
): Promise<WooSendOutcome> {
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

  // Claim the send. A duplicate key means this exact message was already
  // handled (a retry, or the same status delivered twice).
  const { data: claim, error: claimErr } = await db
    .from('woocommerce_events')
    .insert({
      account_id: store.account_id,
      store_id: store.id,
      delivery_id: `send:${req.sendKey}`,
      topic: req.topic,
      event,
      order_number: req.orderNumber,
      phone,
      status: 'received',
    })
    .select('id')
    .single();
  if (claimErr) {
    if (isUniqueViolation(claimErr)) return { status: 'duplicate' };
    console.error('[woocommerce] could not log send:', claimErr.message);
    return { status: 'failed', detail: 'Could not log the message' };
  }

  const finish = async (outcome: WooSendOutcome): Promise<WooSendOutcome> => {
    await db
      .from('woocommerce_events')
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
        body: resolveWooBodyParams(ruleVariables(rule), req.ctx),
      },
    });
    return finish({
      status: 'sent',
      whatsappMessageId: result.whatsappMessageId,
      contactId,
    });
  } catch (err) {
    const detail = err instanceof Error ? err.message : String(err);
    console.error(`[woocommerce] ${event} send failed for ${store.store_url}:`, detail);
    return finish({ status: 'failed', detail });
  }
}

// ------------------------------------------------------------
// Webhook handling
// ------------------------------------------------------------

/**
 * Process one verified webhook delivery. Never throws; failures are
 * logged in woocommerce_events so the merchant can see them in Settings.
 */
export async function handleWooWebhook(
  store: WooStore,
  topic: string,
  deliveryId: string | null,
  payload: Json
): Promise<void> {
  const db = supabaseAdmin();
  try {
    // Replay / retry protection: a delivery id is only processed once.
    if (deliveryId) {
      const { error } = await db.from('woocommerce_events').insert({
        account_id: store.account_id,
        store_id: store.id,
        delivery_id: deliveryId,
        topic,
        order_number: wooOrderNumberOf(payload),
        status: 'received',
      });
      if (error && isUniqueViolation(error)) return;
    }

    await db
      .from('woocommerce_stores')
      .update({ last_event_at: new Date().toISOString() })
      .eq('id', store.id);

    if (topic === 'order.created' || topic === 'order.updated') {
      await onOrder(db, store, topic, payload);
    }
  } catch (err) {
    console.error(`[woocommerce] ${topic} handling failed for ${store.store_url}:`, err);
    await recordWebhookFailure('woocommerce', err, {
      accountId: store.account_id,
      context: { topic, store: store.store_url, delivery_id: deliveryId },
    });
  }
}

async function onOrder(
  db: SupabaseClient,
  store: WooStore,
  topic: string,
  order: Json
) {
  if (order.id === undefined || order.id === null) return;
  const orderId = String(order.id);
  const { phone, countryCode } = wooContactPhoneOf(order);
  const names = wooCustomerNamesOf(order);
  const tracking = wooTrackingOf(order);

  const { error } = await db.from('woocommerce_orders').upsert(
    {
      account_id: store.account_id,
      store_id: store.id,
      woo_order_id: orderId,
      order_number: wooOrderNumberOf(order),
      status: order.status ?? null,
      phone,
      customer_name: names.full,
      email: order.billing?.email ?? null,
      total: order.total ?? null,
      currency: order.currency ?? null,
      payment_method: wooPaymentMethodOf(order),
      order_url: wooOrderUrl(order, store.store_url),
      tracking_number: tracking.number,
      tracking_url: tracking.url,
      tracking_company: tracking.company,
      updated_at: new Date().toISOString(),
    },
    { onConflict: 'store_id,woo_order_id' }
  );
  if (error) console.error('[woocommerce] order upsert failed:', error.message);

  const cod = isWooCashOnDelivery(order);
  const ctx = wooOrderContext(order, store.store_url, store.store_name);

  // Team alert (Slack / Discord / Telegram), once per order. Never throws.
  if (topic === 'order.created') {
    await fireTeamAlert(store.account_id, 'order_placed', {
      contactName: names.full,
      phone,
      orderNumber: wooOrderNumberOf(order),
      amountRupees: order.total ? `${order.currency ?? ''} ${order.total}`.trim() : null,
    });
  }

  for (const event of eventsForStatus(order.status, cod)) {
    const placed = event === 'order_placed' || event === 'cod_order_placed';
    const outcome = await sendWooEvent(store, {
      event,
      fallbackEvent: event === 'cod_order_placed' ? 'order_placed' : undefined,
      // One confirmation per order, whether it was created or later updated.
      sendKey: `${placed ? 'order_placed' : event}:${orderId}`,
      topic,
      rawPhone: phone,
      countryCode,
      customerName: names.full,
      ctx,
      orderNumber: wooOrderNumberOf(order),
    });
    if (outcome.status === 'sent') {
      await db
        .from('woocommerce_orders')
        .update({ contact_id: outcome.contactId })
        .eq('store_id', store.id)
        .eq('woo_order_id', orderId);
    }
  }
}
