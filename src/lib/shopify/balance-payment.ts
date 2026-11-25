// ============================================================
// Razorpay payment link for a COD / partially-paid order's balance.
//
// Every other dynamic URL button variable is resolved once, at enqueue
// time, and frozen into the queue row (see schedule.ts's header
// comment) — a Razorpay link can't be, because it doesn't exist until
// the step actually sends and the outstanding balance has to be
// current, not whatever it was when the message was queued. This is
// the one deliberate exception: dispatchScheduled() calls
// resolveBalancePaymentUrl() live instead of reading a frozen
// url_button_param.
//
// Any failure here is a skip, never a hard failure — retrying would
// just mint another Razorpay link for the same order, and a message
// with a dead "pay now" button is worse than no message at all.
// ============================================================

import type { SupabaseClient } from '@supabase/supabase-js';
import crypto from 'crypto';

import { createPaymentLink, loadRazorpayCreds } from '@/lib/payments/razorpay';

import { outstandingPaise, urlButtonParam } from './events';
import type { ShopifyStore } from './store';

type Db = SupabaseClient;

export type BalancePaymentResult =
  | { ok: true; value: string }
  | { ok: false; reason: string };

/** The link stays open for 48 hours, then the merchant's next follow-up queues a fresh one. */
const EXPIRES_IN_DAYS = 2;

export async function resolveBalancePaymentUrl(
  db: Db,
  store: ShopifyStore,
  args: {
    shopifyOrderId: string | null;
    conversationId: string;
    contactId: string | null;
    templateButtonUrl: string | null | undefined;
  }
): Promise<BalancePaymentResult> {
  if (!args.shopifyOrderId) {
    return { ok: false, reason: 'No Shopify order to create a payment link for' };
  }

  const { data: order } = await db
    .from('shopify_orders')
    .select('order_name, total, total_outstanding, total_received')
    .eq('store_id', store.id)
    .eq('shopify_order_id', args.shopifyOrderId)
    .maybeSingle<{
      order_name: string | null;
      total: string | number | null;
      total_outstanding: string | number | null;
      total_received: string | number | null;
    }>();

  const paise = order
    ? outstandingPaise(order.total_outstanding, order.total, order.total_received)
    : null;
  if (!paise) {
    return { ok: false, reason: 'Nothing outstanding on this order' };
  }

  const creds = await loadRazorpayCreds(db, store.account_id);
  if (!creds) {
    return { ok: false, reason: 'Razorpay is not connected for this account' };
  }

  const orderName = order?.order_name ?? args.shopifyOrderId;
  const linkId = crypto.randomUUID();

  let created;
  try {
    created = await createPaymentLink(creds, {
      amountPaise: paise,
      description: `Balance for order ${orderName}`,
      // Our payment_links.id — the existing webhook route resolves it
      // straight off reference_id (see paymentIdFromEvent).
      referenceId: linkId,
      notes: { rg_payment_id: linkId, shopify_order: orderName },
      expiresInDays: EXPIRES_IN_DAYS,
    });
  } catch (err) {
    return {
      ok: false,
      reason: err instanceof Error ? err.message : 'Could not create the Razorpay link',
    };
  }

  const suffix = urlButtonParam(created.shortUrl, args.templateButtonUrl);
  if (!suffix.ok) {
    return { ok: false, reason: suffix.reason };
  }

  const { error } = await db.from('payment_links').insert({
    id: linkId,
    account_id: store.account_id,
    conversation_id: args.conversationId,
    contact_id: args.contactId,
    shopify_store_id: store.id,
    shopify_order_id: args.shopifyOrderId,
    amount: paise,
    currency: 'INR',
    description: `Balance for order ${orderName}`,
    razorpay_link_id: created.id,
    short_url: created.shortUrl,
    status: 'created',
  });
  if (error) {
    return { ok: false, reason: `Could not save the payment link: ${error.message}` };
  }

  return { ok: true, value: suffix.value };
}
