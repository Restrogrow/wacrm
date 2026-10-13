// ============================================================
// Shopify events → WhatsApp templates — pure registry + payload
// helpers, no I/O.
//
// Each ShopifyEvent is something the merchant can attach an approved
// template to in Settings → Shopify. Template body variables ({{1}},
// {{2}}, …) are filled from SHOPIFY_VARIABLES, resolved against a
// MessageContext built from the webhook payload (plus the stored order
// for fulfillment updates, which carry no customer details).
//
// Payload shapes: Shopify webhook JSON (REST resource format) for
// orders, fulfillments, fulfillment_events and checkouts.
// ============================================================

export const SHOPIFY_EVENTS = [
  'order_placed',
  'cod_order_placed',
  'order_shipped',
  'out_for_delivery',
  'order_delivered',
  'order_cancelled',
  'abandoned_checkout',
] as const;

export type ShopifyEvent = (typeof SHOPIFY_EVENTS)[number];

export function isShopifyEvent(value: unknown): value is ShopifyEvent {
  return (
    typeof value === 'string' &&
    (SHOPIFY_EVENTS as readonly string[]).includes(value)
  );
}

export interface EventMeta {
  label: string;
  description: string;
  /** Marketing messages need the customer's opt-in; opted-out contacts are skipped. */
  marketing: boolean;
}

export const EVENT_META: Record<ShopifyEvent, EventMeta> = {
  order_placed: {
    label: 'Order placed',
    description: 'Order confirmation as soon as the customer checks out.',
    marketing: false,
  },
  cod_order_placed: {
    label: 'COD order placed',
    description:
      'Cash-on-delivery orders. Use a template with "Confirm" / "Cancel" quick-reply buttons; replies land in the inbox and can trigger automations. If off, COD orders use "Order placed".',
    marketing: false,
  },
  order_shipped: {
    label: 'Order shipped',
    description:
      'When a fulfillment is created, with the courier and tracking link.',
    marketing: false,
  },
  out_for_delivery: {
    label: 'Out for delivery',
    description: 'When the carrier marks the shipment out for delivery.',
    marketing: false,
  },
  order_delivered: {
    label: 'Delivered',
    description:
      'When the carrier marks the shipment delivered. Good moment to ask for a review.',
    marketing: false,
  },
  order_cancelled: {
    label: 'Order cancelled',
    description: 'When the order is cancelled.',
    marketing: false,
  },
  abandoned_checkout: {
    label: 'Abandoned cart',
    description:
      'Reminder with the checkout link when a customer leaves without paying. Must be a Marketing template; customers who opted out are skipped.',
    marketing: true,
  },
};

/** Shopify webhook topics each connection needs, and what they drive. */
export const SHOPIFY_TOPICS = [
  {
    topic: 'orders/create',
    adminName: 'Order creation',
    drives: 'Order placed, COD order placed',
  },
  {
    topic: 'orders/cancelled',
    adminName: 'Order cancellation',
    drives: 'Order cancelled',
  },
  {
    topic: 'fulfillments/create',
    adminName: 'Fulfillment creation',
    drives: 'Order shipped',
  },
  {
    topic: 'fulfillments/update',
    adminName: 'Fulfillment update',
    drives: 'Out for delivery, Delivered',
  },
  {
    topic: 'checkouts/create',
    adminName: 'Checkout creation',
    drives: 'Abandoned cart',
  },
  {
    topic: 'checkouts/update',
    adminName: 'Checkout update',
    drives: 'Abandoned cart',
  },
] as const;

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
  checkout_url: string | null;
  shop_name: string | null;
}

export type ShopifyVariable = keyof MessageContext;

export const SHOPIFY_VARIABLES: {
  key: ShopifyVariable;
  label: string;
  example: string;
}[] = [
  { key: 'customer_name', label: 'Customer first name', example: 'Priya' },
  {
    key: 'customer_full_name',
    label: 'Customer full name',
    example: 'Priya Sharma',
  },
  { key: 'order_number', label: 'Order number', example: '#1001' },
  { key: 'order_total', label: 'Order total', example: '₹1,299.00' },
  { key: 'items', label: 'Items', example: '2 × Kurta, 1 × Dupatta' },
  {
    key: 'payment_method',
    label: 'Payment method',
    example: 'Cash on Delivery (COD)',
  },
  {
    key: 'order_status_url',
    label: 'Order status link',
    example: 'https://shop.example/orders/abc',
  },
  { key: 'tracking_number', label: 'Tracking number', example: 'AWB123456789' },
  {
    key: 'tracking_url',
    label: 'Tracking link',
    example: 'https://track.example/AWB123456789',
  },
  { key: 'courier', label: 'Courier', example: 'Delhivery' },
  {
    key: 'checkout_url',
    label: 'Checkout (cart) link',
    example: 'https://shop.example/checkouts/xyz',
  },
  { key: 'shop_name', label: 'Store name', example: 'My Store' },
];

export function isShopifyVariable(value: unknown): value is ShopifyVariable {
  return (
    typeof value === 'string' && SHOPIFY_VARIABLES.some((v) => v.key === value)
  );
}

/** Example context for test sends from Settings. */
export const SAMPLE_CONTEXT: MessageContext = Object.fromEntries(
  SHOPIFY_VARIABLES.map((v) => [v.key, v.example])
) as unknown as MessageContext;

/**
 * Body parameters for a send. Meta rejects empty text parameters, so a
 * value Shopify didn't provide becomes "-".
 */
export function resolveBodyParams(
  variables: ShopifyVariable[],
  ctx: MessageContext
): string[] {
  return variables.map((key) => {
    const value = ctx[key];
    return value && value.trim() ? value.trim() : '-';
  });
}

/** Highest {{n}} in a template body = number of body variables. */
export function countBodyVariables(
  bodyText: string | null | undefined
): number {
  let max = 0;
  for (const match of (bodyText ?? '').matchAll(/\{\{\s*(\d+)\s*\}\}/g)) {
    max = Math.max(max, Number(match[1]));
  }
  return max;
}

// ------------------------------------------------------------
// Payload helpers (Shopify webhook JSON)
// ------------------------------------------------------------

/* eslint-disable @typescript-eslint/no-explicit-any */
type Json = Record<string, any>;

function str(value: unknown): string | null {
  if (value === null || value === undefined) return null;
  const s = String(value).trim();
  return s ? s : null;
}

export function formatMoney(amount: unknown, currency: unknown): string | null {
  const value = Number(amount);
  const code = str(currency);
  if (!Number.isFinite(value)) return null;
  if (!code) return value.toFixed(2);
  try {
    return new Intl.NumberFormat(code === 'INR' ? 'en-IN' : 'en', {
      style: 'currency',
      currency: code,
    }).format(value);
  } catch {
    return `${code} ${value.toFixed(2)}`;
  }
}

export function summarizeItems(lineItems: unknown, max = 3): string | null {
  if (!Array.isArray(lineItems) || lineItems.length === 0) return null;
  const parts = lineItems
    .slice(0, max)
    .map(
      (li: Json) => `${Number(li.quantity) || 1} × ${str(li.title) ?? 'item'}`
    );
  const more = lineItems.length - max;
  return more > 0 ? `${parts.join(', ')} +${more} more` : parts.join(', ');
}

/** Where the customer's phone and country live on an order or checkout. */
export function contactPhoneOf(resource: Json): {
  phone: string | null;
  countryCode: string | null;
} {
  const candidates = [
    { phone: resource.phone, country: resource.shipping_address?.country_code },
    {
      phone: resource.customer?.phone,
      country: resource.customer?.default_address?.country_code,
    },
    {
      phone: resource.shipping_address?.phone,
      country: resource.shipping_address?.country_code,
    },
    {
      phone: resource.billing_address?.phone,
      country: resource.billing_address?.country_code,
    },
    {
      phone: resource.customer?.default_address?.phone,
      country: resource.customer?.default_address?.country_code,
    },
    {
      phone: resource.destination?.phone,
      country: resource.destination?.country_code,
    },
  ];
  for (const c of candidates) {
    const phone = str(c.phone);
    if (phone) {
      return {
        phone,
        countryCode:
          str(c.country) ??
          str(resource.shipping_address?.country_code) ??
          str(resource.billing_address?.country_code),
      };
    }
  }
  return { phone: null, countryCode: null };
}

export function customerNamesOf(resource: Json): {
  first: string | null;
  full: string | null;
} {
  const first =
    str(resource.customer?.first_name) ??
    str(resource.shipping_address?.first_name) ??
    str(resource.billing_address?.first_name);
  const last =
    str(resource.customer?.last_name) ??
    str(resource.shipping_address?.last_name) ??
    str(resource.billing_address?.last_name);
  return { first, full: [first, last].filter(Boolean).join(' ') || null };
}

export function isCashOnDelivery(order: Json): boolean {
  const gateways: unknown[] = Array.isArray(order.payment_gateway_names)
    ? order.payment_gateway_names
    : [order.gateway];
  return gateways.some((g) =>
    /cash on delivery|\bcod\b/i.test(String(g ?? ''))
  );
}

export function paymentMethodOf(order: Json): string | null {
  const gateways = Array.isArray(order.payment_gateway_names)
    ? order.payment_gateway_names
    : [];
  return str(gateways.filter(Boolean).join(', ')) ?? str(order.gateway);
}

export function trackingOf(fulfillment: Json): {
  number: string | null;
  url: string | null;
  company: string | null;
} {
  return {
    number:
      str(fulfillment.tracking_number) ??
      str(fulfillment.tracking_numbers?.[0]),
    url: str(fulfillment.tracking_url) ?? str(fulfillment.tracking_urls?.[0]),
    company: str(fulfillment.tracking_company),
  };
}

/** Map a fulfillment's carrier status to our event, if it's one we notify on. */
export function shipmentStatusEvent(status: unknown): ShopifyEvent | null {
  const s = String(status ?? '').toLowerCase();
  if (s === 'out_for_delivery') return 'out_for_delivery';
  if (s === 'delivered') return 'order_delivered';
  return null;
}

export function orderContext(
  order: Json,
  shopName: string | null
): MessageContext {
  const names = customerNamesOf(order);
  const fulfillment = Array.isArray(order.fulfillments)
    ? order.fulfillments.at(-1)
    : null;
  const tracking = fulfillment
    ? trackingOf(fulfillment)
    : { number: null, url: null, company: null };
  return {
    customer_name: names.first,
    customer_full_name: names.full,
    order_number:
      str(order.name) ?? (order.order_number ? `#${order.order_number}` : null),
    order_total: formatMoney(order.total_price, order.currency),
    items: summarizeItems(order.line_items),
    payment_method: paymentMethodOf(order),
    order_status_url: str(order.order_status_url),
    tracking_number: tracking.number,
    tracking_url: tracking.url,
    courier: tracking.company,
    checkout_url: null,
    shop_name: shopName,
  };
}

export function checkoutContext(
  checkout: Json,
  shopName: string | null
): MessageContext {
  const names = customerNamesOf(checkout);
  return {
    customer_name: names.first,
    customer_full_name: names.full,
    order_number: null,
    order_total: formatMoney(
      checkout.total_price,
      checkout.currency ?? checkout.presentment_currency
    ),
    items: summarizeItems(checkout.line_items),
    payment_method: null,
    order_status_url: null,
    tracking_number: null,
    tracking_url: null,
    courier: null,
    checkout_url: str(checkout.abandoned_checkout_url),
    shop_name: shopName,
  };
}
