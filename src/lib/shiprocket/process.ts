// ============================================================
// Shiprocket webhook processing -> WhatsApp template sends. Server-only.
// Mirrors lib/woocommerce/process.ts.
//
// handleShiprocketWebhook runs once a delivery has been verified:
//
//   1. record the delivery (a replay of the same awb + status + time is
//      ignored),
//   2. work out the customer's phone: from the payload when the merchant's
//      setup includes it, otherwise from the shipment seen before, or from
//      the WooCommerce / Shopify order with the same order number,
//   3. store/refresh the shipment, then send the template for the status.
//
// Idempotency: every send claims a "send:<event>:<awb>" row first; a
// unique violation means that customer already got that message (so
// repeated "in transit" scans send once per shipment).
// ============================================================

import type { SupabaseClient } from '@supabase/supabase-js';

import { supabaseAdmin } from '@/lib/flows/admin-client';
import { isUniqueViolation } from '@/lib/contacts/dedupe';
import { normalizeIntegrationPhone } from '@/lib/integrations/phone';
import { recordWebhookFailure } from '@/lib/ops/monitoring';
import { resolveConversationByPhone } from '@/lib/whatsapp/resolve-conversation';
import { sendMessageToConversation } from '@/lib/whatsapp/send-message';
import { HOLD_WAITING_TEXT } from '@/lib/whatsapp/billing-hold';

import {
  eventForStatus,
  isReturnShipment,
  isShiprocketVariable,
  orderRefCandidates,
  resolveShiprocketBodyParams,
  shipmentAwb,
  shipmentContext,
  shipmentDeliveryId,
  shipmentOrderRef,
  shipmentPayloadName,
  shipmentPayloadPhone,
  shipmentStatusId,
  shipmentStatusText,
  trackingUrlFor,
  type MessageContext,
  type ShiprocketEvent,
  type ShiprocketVariable,
} from './events';

/* eslint-disable @typescript-eslint/no-explicit-any */
type Json = Record<string, any>;

export interface ShiprocketConnection {
  id: string;
  account_id: string;
  default_country_code: string;
  status: 'active' | 'disconnected';
}

export const SHIPROCKET_CONNECTION_COLUMNS =
  'id, account_id, default_country_code, status';

interface EventRule {
  enabled: boolean;
  template_name: string | null;
  template_language: string | null;
  body_variables: unknown;
}

async function loadRule(
  db: SupabaseClient,
  accountId: string,
  event: ShiprocketEvent,
  includeDisabled = false
): Promise<EventRule | null> {
  const { data } = await db
    .from('shiprocket_event_rules')
    .select('enabled, template_name, template_language, body_variables')
    .eq('account_id', accountId)
    .eq('event', event)
    .maybeSingle();
  return data && (data.enabled || includeDisabled) && data.template_name
    ? (data as EventRule)
    : null;
}

function ruleVariables(rule: EventRule): ShiprocketVariable[] {
  return Array.isArray(rule.body_variables)
    ? rule.body_variables.filter(isShiprocketVariable)
    : [];
}

// ------------------------------------------------------------
// Sending
// ------------------------------------------------------------

interface SendRequest {
  event: ShiprocketEvent;
  /** Unique per logical message, e.g. "delivered:<awb>". */
  sendKey: string;
  topic: string;
  rawPhone: string | null;
  customerName: string | null;
  ctx: MessageContext;
  orderNumber: string | null;
}

export type ShiprocketSendOutcome =
  | { status: 'sent'; whatsappMessageId: string; contactId: string }
  | { status: 'skipped' | 'failed'; detail: string }
  | { status: 'no_rule' | 'duplicate' };

/** Send one templated message for a shipment event, logging it in shiprocket_events. */
export async function sendShiprocketEvent(
  conn: ShiprocketConnection,
  req: SendRequest,
  /** Test sends from Settings use the saved rule even while it is switched off. */
  options: { test?: boolean } = {}
): Promise<ShiprocketSendOutcome> {
  const db = supabaseAdmin();
  const rule = await loadRule(db, conn.account_id, req.event, options.test);
  if (!rule) return { status: 'no_rule' };

  const phone = normalizeIntegrationPhone(req.rawPhone, null, conn.default_country_code);

  const { data: claim, error: claimErr } = await db
    .from('shiprocket_events')
    .insert({
      account_id: conn.account_id,
      connection_id: conn.id,
      delivery_id: `send:${req.sendKey}`,
      topic: req.topic,
      event: req.event,
      order_number: req.orderNumber,
      phone,
      status: 'received',
    })
    .select('id')
    .single();
  if (claimErr) {
    if (isUniqueViolation(claimErr)) return { status: 'duplicate' };
    console.error('[shiprocket] could not log send:', claimErr.message);
    return { status: 'failed', detail: 'Could not log the message' };
  }

  const finish = async (outcome: ShiprocketSendOutcome): Promise<ShiprocketSendOutcome> => {
    await db
      .from('shiprocket_events')
      .update({
        status: outcome.status,
        detail: 'detail' in outcome ? outcome.detail : null,
        whatsapp_message_id: outcome.status === 'sent' ? outcome.whatsappMessageId : null,
      })
      .eq('id', claim.id);
    return outcome;
  };

  if (!phone) {
    return finish({
      status: 'skipped',
      detail: req.rawPhone
        ? `Phone number "${req.rawPhone}" isn't a valid WhatsApp number`
        : 'No phone number found for this shipment. Connect your store (Shopify / WooCommerce) in Repeat Grow so we can match the order number, or add the customer phone to the Shiprocket webhook.',
    });
  }

  try {
    const { conversationId, contactId } = await resolveConversationByPhone(
      db,
      conn.account_id,
      phone,
      req.customerName
    );
    const result = await sendMessageToConversation(db, conn.account_id, {
      conversationId,
      messageType: 'template',
      templateName: rule.template_name,
      templateLanguage: rule.template_language || 'en_US',
      templateMessageParams: { body: resolveShiprocketBodyParams(ruleVariables(rule), req.ctx) },
    });
    // Billing hold: saved and sent automatically once Meta can charge again.
    if (result.held) return finish({ status: 'skipped', detail: HOLD_WAITING_TEXT });
    return finish({ status: 'sent', whatsappMessageId: result.whatsappMessageId, contactId });
  } catch (err) {
    const detail = err instanceof Error ? err.message : String(err);
    console.error(`[shiprocket] ${req.event} send failed:`, detail);
    return finish({ status: 'failed', detail });
  }
}

// ------------------------------------------------------------
// Customer lookup
// ------------------------------------------------------------

/**
 * Shiprocket's tracking webhook carries the merchant's order id but usually
 * not the customer's phone. Look the order up in the stores connected to
 * this account (WooCommerce and Shopify), scoped to the account.
 */
async function lookupCustomerByOrder(
  db: SupabaseClient,
  accountId: string,
  orderRef: string | null
): Promise<{ phone: string | null; name: string | null }> {
  const candidates = orderRefCandidates(orderRef);
  if (candidates.length === 0) return { phone: null, name: null };

  const { data: woo } = await db
    .from('woocommerce_orders')
    .select('phone, customer_name')
    .eq('account_id', accountId)
    .or(
      [
        `order_number.in.(${candidates.map(quoteForIn).join(',')})`,
        `woo_order_id.in.(${candidates.map(quoteForIn).join(',')})`,
      ].join(',')
    )
    .order('updated_at', { ascending: false })
    .limit(1)
    .maybeSingle();
  if (woo?.phone) return { phone: woo.phone as string, name: (woo.customer_name as string) ?? null };

  const { data: shop } = await db
    .from('shopify_orders')
    .select('phone, customer_name')
    .eq('account_id', accountId)
    .or(
      [
        `order_name.in.(${candidates.map(quoteForIn).join(',')})`,
        `shopify_order_id.in.(${candidates.map(quoteForIn).join(',')})`,
      ].join(',')
    )
    .order('updated_at', { ascending: false })
    .limit(1)
    .maybeSingle();
  if (shop?.phone) return { phone: shop.phone as string, name: (shop.customer_name as string) ?? null };

  return { phone: null, name: null };
}

/** Quote one value for a PostgREST in.(...) list. Order refs are short alphanumerics. */
function quoteForIn(value: string): string {
  const clean = value.replace(/[^A-Za-z0-9#._-]/g, '');
  return `"${clean}"`;
}

// ------------------------------------------------------------
// Webhook handling
// ------------------------------------------------------------

/** Process one verified delivery. Never throws; failures are logged for Settings. */
export async function handleShiprocketWebhook(
  conn: ShiprocketConnection,
  payload: Json
): Promise<void> {
  const db = supabaseAdmin();
  try {
    const awb = shipmentAwb(payload);
    const orderRef = shipmentOrderRef(payload);

    // Replay / retry protection.
    const { error: dupErr } = await db.from('shiprocket_events').insert({
      account_id: conn.account_id,
      connection_id: conn.id,
      delivery_id: shipmentDeliveryId(payload),
      topic: 'tracking',
      order_number: orderRef,
      status: 'received',
    });
    if (dupErr && isUniqueViolation(dupErr)) return;

    await db
      .from('shiprocket_connections')
      .update({ last_event_at: new Date().toISOString() })
      .eq('id', conn.id);

    if (!awb) return;

    // Reverse pickups (customer returns) send nothing to the customer.
    if (isReturnShipment(payload)) return;

    const { data: previous } = await db
      .from('shiprocket_shipments')
      .select('phone, customer_name, order_ref')
      .eq('connection_id', conn.id)
      .eq('awb', awb)
      .maybeSingle();

    let rawPhone = shipmentPayloadPhone(payload) ?? (previous?.phone as string | null) ?? null;
    let customerName = shipmentPayloadName(payload) ?? (previous?.customer_name as string | null) ?? null;
    const ref = orderRef ?? (previous?.order_ref as string | null) ?? null;
    if (!rawPhone) {
      const found = await lookupCustomerByOrder(db, conn.account_id, ref);
      rawPhone = found.phone;
      customerName = customerName ?? found.name;
    }

    const statusText = shipmentStatusText(payload);
    const { error: upsertErr } = await db.from('shiprocket_shipments').upsert(
      {
        account_id: conn.account_id,
        connection_id: conn.id,
        awb,
        order_ref: ref,
        courier: (payload.courier_name as string | undefined) ?? null,
        status: statusText,
        status_id: shipmentStatusId(payload),
        etd: payload.etd ? String(payload.etd) : null,
        tracking_url: trackingUrlFor(awb, payload),
        phone: rawPhone,
        customer_name: customerName,
        last_status_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      },
      { onConflict: 'connection_id,awb' }
    );
    if (upsertErr) console.error('[shiprocket] shipment upsert failed:', upsertErr.message);

    const event = eventForStatus(statusText, shipmentStatusId(payload));
    if (!event) return;

    const outcome = await sendShiprocketEvent(conn, {
      event,
      sendKey: `${event}:${awb}`,
      topic: 'tracking',
      rawPhone,
      customerName,
      ctx: shipmentContext(payload, { customerName, orderRef: ref }),
      orderNumber: ref,
    });
    if (outcome.status === 'sent') {
      await db
        .from('shiprocket_shipments')
        .update({ contact_id: outcome.contactId })
        .eq('connection_id', conn.id)
        .eq('awb', awb);
    }
  } catch (err) {
    console.error('[shiprocket] handling failed:', err);
    await recordWebhookFailure('shiprocket', err, {
      accountId: conn.account_id,
      context: { order: shipmentOrderRef(payload) },
    });
  }
}
