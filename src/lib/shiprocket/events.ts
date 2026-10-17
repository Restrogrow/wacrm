// ============================================================
// Shiprocket shipment updates -> WhatsApp templates: pure registry,
// status mapping and payload helpers, no I/O. Mirrors woocommerce/events.ts.
// ============================================================

export const SHIPROCKET_EVENTS = [
  'shipped',
  'in_transit',
  'out_for_delivery',
  'delivered',
  'delivery_failed',
  'return_initiated',
] as const;

export type ShiprocketEvent = (typeof SHIPROCKET_EVENTS)[number];

export function isShiprocketEvent(value: unknown): value is ShiprocketEvent {
  return (
    typeof value === 'string' &&
    (SHIPROCKET_EVENTS as readonly string[]).includes(value)
  );
}

export const SHIPROCKET_EVENT_META: Record<
  ShiprocketEvent,
  { label: string; description: string }
> = {
  shipped: {
    label: 'Order shipped',
    description: 'When the courier picks the parcel up. Include the tracking link.',
  },
  in_transit: {
    label: 'In transit',
    description: 'When the parcel is on its way (sent once per shipment).',
  },
  out_for_delivery: {
    label: 'Out for delivery',
    description:
      'On the day the courier is delivering. A good moment to remind them to keep the phone handy.',
  },
  delivered: {
    label: 'Delivered',
    description: 'When the parcel is delivered. A good moment to ask for a review.',
  },
  delivery_failed: {
    label: 'Delivery attempt failed',
    description:
      'When the courier reports the parcel as undelivered, so the customer can respond quickly.',
  },
  return_initiated: {
    label: 'Return to origin started',
    description: 'When the shipment starts coming back to you (RTO).',
  },
};

// ------------------------------------------------------------
// Status mapping
// ------------------------------------------------------------

/** Shiprocket status ids -> our event. */
const STATUS_ID_EVENTS: Record<number, ShiprocketEvent> = {
  6: 'shipped', // Shipped
  42: 'shipped', // Picked Up
  51: 'shipped', // Handover to courier
  18: 'in_transit', // In Transit
  38: 'in_transit', // Reached destination hub
  50: 'in_transit', // In flight
  17: 'out_for_delivery',
  7: 'delivered',
  21: 'delivery_failed', // Undelivered
  9: 'return_initiated', // RTO initiated
  40: 'return_initiated', // RTO NDR
};

const STATUS_TEXT_EVENTS: [RegExp, ShiprocketEvent][] = [
  [/^RTO\b/, 'return_initiated'],
  [/^OUT FOR DELIVERY$/, 'out_for_delivery'],
  [/^DELIVERED$/, 'delivered'],
  [/^UNDELIVERED$/, 'delivery_failed'],
  [/^(PICKED UP|SHIPPED|HANDOVER TO COURIER)$/, 'shipped'],
  [/^(IN TRANSIT|REACHED DESTINATION HUB|IN FLIGHT)$/, 'in_transit'],
];

function normalizeStatus(text: unknown): string {
  return String(text ?? '')
    .toUpperCase()
    .replace(/[^A-Z ]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

/**
 * Which message (if any) a status update should send. "Partial delivered"
 * is deliberately NOT "Delivered", and RTO delivered / cancelled / lost
 * statuses send nothing.
 */
export function eventForStatus(
  statusText: unknown,
  statusId: unknown
): ShiprocketEvent | null {
  const text = normalizeStatus(statusText);
  if (text === 'RTO DELIVERED' || text === 'PARTIAL DELIVERED') return null;
  for (const [re, event] of STATUS_TEXT_EVENTS) {
    if (re.test(text)) return event;
  }
  // Fall back to the numeric id only when the text said nothing useful.
  if (!text) {
    const id = Number(statusId);
    if (Number.isInteger(id) && STATUS_ID_EVENTS[id]) return STATUS_ID_EVENTS[id];
  }
  return null;
}

// ------------------------------------------------------------
// Template variables
// ------------------------------------------------------------

export interface MessageContext {
  customer_name: string | null;
  customer_full_name: string | null;
  order_number: string | null;
  awb: string | null;
  courier: string | null;
  status: string | null;
  expected_delivery: string | null;
  tracking_url: string | null;
}

export type ShiprocketVariable = keyof MessageContext;

export const SHIPROCKET_VARIABLES: {
  key: ShiprocketVariable;
  label: string;
  example: string;
}[] = [
  { key: 'customer_name', label: 'Customer first name', example: 'Priya' },
  { key: 'customer_full_name', label: 'Customer full name', example: 'Priya Sharma' },
  { key: 'order_number', label: 'Order number', example: '#1001' },
  { key: 'awb', label: 'Tracking number (AWB)', example: '14367890123' },
  { key: 'courier', label: 'Courier', example: 'Delhivery' },
  { key: 'status', label: 'Shipment status', example: 'Out For Delivery' },
  { key: 'expected_delivery', label: 'Expected delivery date', example: '14 Oct' },
  {
    key: 'tracking_url',
    label: 'Tracking link',
    example: 'https://shiprocket.co/tracking/14367890123',
  },
];

export function isShiprocketVariable(value: unknown): value is ShiprocketVariable {
  return typeof value === 'string' && SHIPROCKET_VARIABLES.some((v) => v.key === value);
}

export const SHIPROCKET_SAMPLE_CONTEXT: MessageContext = Object.fromEntries(
  SHIPROCKET_VARIABLES.map((v) => [v.key, v.example])
) as unknown as MessageContext;

/** Meta rejects empty text parameters, so a missing value becomes "-". */
export function resolveShiprocketBodyParams(
  variables: ShiprocketVariable[],
  ctx: MessageContext
): string[] {
  return variables.map((key) => {
    const value = ctx[key];
    return value && value.trim() ? value.trim() : '-';
  });
}

// ------------------------------------------------------------
// Payload helpers
// ------------------------------------------------------------

/* eslint-disable @typescript-eslint/no-explicit-any */
type Json = Record<string, any>;

function str(value: unknown): string | null {
  if (value === null || value === undefined) return null;
  const s = String(value).trim();
  return s ? s : null;
}

export function shipmentAwb(payload: Json): string | null {
  return str(payload.awb) ?? str(payload.awb_code) ?? str(payload.tracking_number);
}

export function shipmentOrderRef(payload: Json): string | null {
  return str(payload.order_id) ?? str(payload.channel_order_id) ?? str(payload.sr_order_id);
}

export function shipmentStatusText(payload: Json): string | null {
  return str(payload.current_status) ?? str(payload.shipment_status);
}

export function shipmentStatusId(payload: Json): number | null {
  const n = Number(payload.current_status_id ?? payload.shipment_status_id);
  return Number.isInteger(n) ? n : null;
}

/** Reverse (return) shipments carry is_return=1; they get no customer messages. */
export function isReturnShipment(payload: Json): boolean {
  return payload.is_return === 1 || payload.is_return === '1' || payload.is_return === true;
}

const PHONE_KEYS = [
  'customer_phone',
  'phone',
  'billing_phone',
  'buyer_phone',
  'consignee_phone',
  'shipping_phone',
  'mobile',
];

/** A customer phone in the payload, if the merchant's setup includes one. */
export function shipmentPayloadPhone(payload: Json): string | null {
  for (const key of PHONE_KEYS) {
    const v = str(payload[key]);
    if (v) return v;
  }
  for (const nest of ['customer_details', 'shipping_address', 'billing_address', 'customer']) {
    const obj = payload[nest];
    if (obj && typeof obj === 'object') {
      for (const key of PHONE_KEYS) {
        const v = str((obj as Json)[key]);
        if (v) return v;
      }
    }
  }
  return null;
}

export function shipmentPayloadName(payload: Json): string | null {
  return (
    str(payload.customer_name) ??
    str(payload.billing_customer_name) ??
    str(payload.customer_details?.name) ??
    null
  );
}

export function trackingUrlFor(awb: string | null, payload: Json): string | null {
  const given = str(payload.tracking_url) ?? str(payload.track_url);
  if (given && /^https?:\/\//i.test(given)) return given;
  return awb ? `https://shiprocket.co/tracking/${encodeURIComponent(awb)}` : null;
}

function formatEtd(etd: unknown): string | null {
  const raw = str(etd);
  if (!raw) return null;
  const t = Date.parse(raw);
  if (Number.isNaN(t)) return raw;
  return new Intl.DateTimeFormat('en-IN', {
    day: 'numeric',
    month: 'short',
    timeZone: 'Asia/Kolkata',
  }).format(new Date(t));
}

export function shipmentContext(
  payload: Json,
  extras: { customerName: string | null; orderRef: string | null }
): MessageContext {
  const awb = shipmentAwb(payload);
  const full = extras.customerName;
  return {
    customer_name: full?.split(/\s+/)[0] ?? null,
    customer_full_name: full,
    order_number: extras.orderRef,
    awb,
    courier: str(payload.courier_name) ?? str(payload.courier),
    status: shipmentStatusText(payload),
    expected_delivery: formatEtd(payload.etd),
    tracking_url: trackingUrlFor(awb, payload),
  };
}

/** Candidate spellings of a merchant order reference when searching order tables. */
export function orderRefCandidates(ref: string | null): string[] {
  if (!ref) return [];
  const bare = ref.replace(/^#/, '');
  return Array.from(new Set([ref, bare, `#${bare}`]));
}

/** Stable id for one status update, so a replayed delivery is processed once. */
export function shipmentDeliveryId(payload: Json): string {
  return [
    shipmentAwb(payload) ?? 'no-awb',
    shipmentStatusId(payload) ?? normalizeStatus(shipmentStatusText(payload)),
    str(payload.current_timestamp) ?? str(payload.timestamp) ?? '',
  ].join(':');
}
