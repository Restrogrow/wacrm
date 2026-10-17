// ============================================================
// WooCommerce events -> WhatsApp templates: pure registry + payload
// helpers, no I/O. Mirrors lib/shopify/events.ts.
//
// Each WooEvent is something the merchant can attach an approved
// template to in Integrations > WooCommerce. Template body variables
// ({{1}}, {{2}}, ...) are filled from WOO_VARIABLES, resolved against a
// MessageContext built from the order webhook payload (REST API v3
// order JSON).
// ============================================================

import { formatMoney } from '@/lib/shopify/events';

export const WOO_EVENTS = [
  'order_placed',
  'cod_order_placed',
  'order_completed',
  'order_cancelled',
  'order_refunded',
] as const;

export type WooEvent = (typeof WOO_EVENTS)[number];

export function isWooEvent(value: unknown): value is WooEvent {
  return (
    typeof value === 'string' &&
    (WOO_EVENTS as readonly string[]).includes(value)
  );
}

export interface EventMeta {
  label: string;
  description: string;
}

export const WOO_EVENT_META: Record<WooEvent, EventMeta> = {
  order_placed: {
    label: 'Order placed',
    description:
      'Order confirmation once the order is paid or accepted (status Processing or On hold).',
  },
  cod_order_placed: {
    label: 'COD order placed',
    description:
      'Cash-on-delivery orders. Use a template with "Confirm" / "Cancel" quick-reply buttons; replies land in the inbox. If off, COD orders use "Order placed".',
  },
  order_completed: {
    label: 'Order completed',
    description:
      'When you mark the order Completed in WooCommerce (usually shipped or delivered). Includes tracking if you use a shipment-tracking plugin.',
  },
  order_cancelled: {
    label: 'Order cancelled',
    description: 'When the order status changes to Cancelled.',
  },
  order_refunded: {
    label: 'Order refunded',
    description: 'When the order status changes to Refunded.',
  },
};

// ------------------------------------------------------------
// Template variables
// ------------------------------------------------------------

export interface MessageContext {
  customer_name: string | null;
  customer_full_name: string | null;
  order_number: string | null;
  order_total: string | null;
  items: string | null;
  payment_method: string | null;
  order_status_url: string | null;
  tracking_number: string | null;
  tracking_url: string | null;
  courier: string | null;
  shop_name: string | null;
}

export type WooVariable = keyof MessageContext;

export const WOO_VARIABLES: { key: WooVariable; label: string; example: string }[] = [
  { key: 'customer_name', label: 'Customer first name', example: 'Priya' },
  { key: 'customer_full_name', label: 'Customer full name', example: 'Priya Sharma' },
  { key: 'order_number', label: 'Order number', example: '#1001' },
  { key: 'order_total', label: 'Order total', example: '₹1,299.00' },
  { key: 'items', label: 'Items', example: '2 × Kurta, 1 × Dupatta' },
  { key: 'payment_method', label: 'Payment method', example: 'Cash on delivery' },
  { key: 'order_status_url', label: 'Order link', example: 'https://shop.example/checkout/order-received/1001/' },
  { key: 'tracking_number', label: 'Tracking number', example: 'AWB123456789' },
  { key: 'tracking_url', label: 'Tracking link', example: 'https://track.example/AWB123456789' },
  { key: 'courier', label: 'Courier', example: 'Delhivery' },
  { key: 'shop_name', label: 'Store name', example: 'My Store' },
];

export function isWooVariable(value: unknown): value is WooVariable {
  return typeof value === 'string' && WOO_VARIABLES.some((v) => v.key === value);
}

/** Example context for test sends from Settings. */
export const WOO_SAMPLE_CONTEXT: MessageContext = Object.fromEntries(
  WOO_VARIABLES.map((v) => [v.key, v.example])
) as unknown as MessageContext;

/** Meta rejects empty text parameters, so a missing value becomes "-". */
export function resolveWooBodyParams(
  variables: WooVariable[],
  ctx: MessageContext
): string[] {
  return variables.map((key) => {
    const value = ctx[key];
    return value && value.trim() ? value.trim() : '-';
  });
}

// ------------------------------------------------------------
// Payload helpers (WooCommerce REST API v3 order JSON)
// ------------------------------------------------------------

/* eslint-disable @typescript-eslint/no-explicit-any */
type Json = Record<string, any>;

function str(value: unknown): string | null {
  if (value === null || value === undefined) return null;
  const s = String(value).trim();
  return s ? s : null;
}

export function summarizeWooItems(lineItems: unknown, max = 3): string | null {
  if (!Array.isArray(lineItems) || lineItems.length === 0) return null;
  const parts = lineItems
    .slice(0, max)
    .map((li: Json) => `${Number(li.quantity) || 1} × ${str(li.name) ?? 'item'}`);
  const more = lineItems.length - max;
  return more > 0 ? `${parts.join(', ')} +${more} more` : parts.join(', ');
}

/** Billing phone first (checkout requires it), then shipping. */
export function wooContactPhoneOf(order: Json): {
  phone: string | null;
  countryCode: string | null;
} {
  const candidates = [
    { phone: order.billing?.phone, country: order.billing?.country },
    { phone: order.shipping?.phone, country: order.shipping?.country },
  ];
  for (const c of candidates) {
    const phone = str(c.phone);
    if (phone) {
      return {
        phone,
        countryCode: str(c.country) ?? str(order.billing?.country) ?? str(order.shipping?.country),
      };
    }
  }
  return { phone: null, countryCode: null };
}

export function wooCustomerNamesOf(order: Json): {
  first: string | null;
  full: string | null;
} {
  const first = str(order.billing?.first_name) ?? str(order.shipping?.first_name);
  const last = str(order.billing?.last_name) ?? str(order.shipping?.last_name);
  return { first, full: [first, last].filter(Boolean).join(' ') || null };
}

export function isWooCashOnDelivery(order: Json): boolean {
  return (
    str(order.payment_method)?.toLowerCase() === 'cod' ||
    /cash on delivery|\bcod\b/i.test(str(order.payment_method_title) ?? '')
  );
}

export function wooPaymentMethodOf(order: Json): string | null {
  return str(order.payment_method_title) ?? str(order.payment_method);
}

export function wooOrderNumberOf(order: Json): string | null {
  const n = str(order.number) ?? str(order.id);
  return n ? `#${n}` : null;
}

/**
 * The public "order received" page. WooCommerce does not put this URL in the
 * payload, so it is built from the standard endpoint; it works for the
 * default permalink setup and is null without an order key.
 */
export function wooOrderUrl(order: Json, storeUrl: string): string | null {
  const key = str(order.order_key);
  const id = str(order.id);
  if (!key || !id) return null;
  return `${storeUrl.replace(/\/+$/, '')}/checkout/order-received/${id}/?key=${encodeURIComponent(key)}`;
}

/**
 * Tracking from the WooCommerce Shipment Tracking plugin, which stores
 * `_wc_shipment_tracking_items` in the order's meta_data.
 */
export function wooTrackingOf(order: Json): {
  number: string | null;
  url: string | null;
  company: string | null;
} {
  const none = { number: null, url: null, company: null };
  if (!Array.isArray(order.meta_data)) return none;
  const meta = order.meta_data.find((m: Json) => m?.key === '_wc_shipment_tracking_items');
  const items = Array.isArray(meta?.value) ? meta.value : [];
  const last = items.at(-1) as Json | undefined;
  if (!last) return none;
  return {
    number: str(last.tracking_number),
    url: str(last.formatted_tracking_link) ?? str(last.custom_tracking_link),
    company: str(last.custom_tracking_provider) ?? str(last.tracking_provider),
  };
}

/** Which messages an order status change should send, if any. */
export function eventsForStatus(status: unknown, cod: boolean): WooEvent[] {
  const s = String(status ?? '').toLowerCase();
  const placed: WooEvent = cod ? 'cod_order_placed' : 'order_placed';
  switch (s) {
    case 'processing':
    case 'on-hold':
      return [placed];
    case 'completed':
      // An order created straight as Completed still gets its confirmation.
      return [placed, 'order_completed'];
    case 'cancelled':
      return ['order_cancelled'];
    case 'refunded':
      return ['order_refunded'];
    default:
      return []; // pending, failed, draft, custom statuses
  }
}

export function wooOrderContext(
  order: Json,
  storeUrl: string,
  shopName: string | null
): MessageContext {
  const names = wooCustomerNamesOf(order);
  const tracking = wooTrackingOf(order);
  return {
    customer_name: names.first,
    customer_full_name: names.full,
    order_number: wooOrderNumberOf(order),
    order_total: formatMoney(order.total, order.currency),
    items: summarizeWooItems(order.line_items),
    payment_method: wooPaymentMethodOf(order),
    order_status_url: wooOrderUrl(order, storeUrl),
    tracking_number: tracking.number,
    tracking_url: tracking.url,
    courier: tracking.company,
    shop_name: shopName,
  };
}
