// Pure order / payment helpers shared by the server and the browser
// (no server-only imports). Server logic lives in commerce.ts.

export type PaymentMode = 'none' | 'whatsapp_pay' | 'upi_id'
export type OrderStatus = 'pending' | 'processing' | 'shipped' | 'completed' | 'canceled'
export type PaymentStatus = 'unpaid' | 'requested' | 'pending' | 'paid' | 'failed' | 'refunded'

export interface CommerceSettings {
  catalog_id: string | null
  payment_mode: PaymentMode
  payment_configuration: string | null
  payment_gateway: 'razorpay' | 'payu' | 'billdesk' | 'zaakpay' | null
  upi_id: string | null
  upi_name: string | null
  goods_type: 'physical-goods' | 'digital-goods'
}

export interface OrderItem {
  name: string
  retailer_id?: string | null
  quantity: number
  /** Price of one unit, in paise. */
  unit_price: number
}

export interface OrderAmounts {
  subtotal: number
  tax: number
  shipping: number
  discount: number
  total: number
}

export const ORDER_STATUS_LABEL: Record<OrderStatus, string> = {
  pending: 'Pending',
  processing: 'Processing',
  shipped: 'Shipped',
  completed: 'Delivered',
  canceled: 'Cancelled',
}

/** Allowed next statuses (Meta rejects others; completed / canceled are final). */
export const NEXT_STATUSES: Record<OrderStatus, OrderStatus[]> = {
  pending: ['processing', 'shipped', 'completed', 'canceled'],
  processing: ['shipped', 'completed', 'canceled'],
  shipped: ['completed'],
  completed: [],
  canceled: [],
}

/** ₹ amount from paise, Indian formatting: 123456 → "₹1,234.56". */
export function rupees(paise: number): string {
  const v = paise / 100
  return `₹${v.toLocaleString('en-IN', { minimumFractionDigits: Number.isInteger(v) ? 0 : 2, maximumFractionDigits: 2 })}`
}

/** Rupees (number or string like "1,499.50") → paise. */
export function toPaise(rupeesValue: number | string): number {
  const n = typeof rupeesValue === 'number' ? rupeesValue : Number(String(rupeesValue).replace(/[,₹\s]/g, ''))
  return Number.isFinite(n) ? Math.round(n * 100) : NaN
}

export function computeAmounts(items: OrderItem[], extras: { tax?: number; shipping?: number; discount?: number } = {}): OrderAmounts {
  const subtotal = items.reduce((sum, i) => sum + i.unit_price * i.quantity, 0)
  const tax = extras.tax ?? 0
  const shipping = extras.shipping ?? 0
  const discount = extras.discount ?? 0
  return { subtotal, tax, shipping, discount, total: subtotal + tax + shipping - discount }
}

/** Throws a user-facing Error for the first problem. */
export function validateOrder(items: OrderItem[], amounts: OrderAmounts): void {
  if (!items.length) throw new Error('Add at least one item.')
  if (items.length > 50) throw new Error('An order can have up to 50 items.')
  items.forEach((item, i) => {
    const n = i + 1
    if (!item.name?.trim()) throw new Error(`Item ${n}: add a name.`)
    if (item.name.length > 60) throw new Error(`Item ${n}: names are 60 characters max.`)
    if (!Number.isInteger(item.quantity) || item.quantity < 1 || item.quantity > 1000) throw new Error(`Item ${n}: quantity must be 1–1000.`)
    if (!Number.isInteger(item.unit_price) || item.unit_price <= 0) throw new Error(`Item ${n}: add a price.`)
  })
  for (const [k, v] of Object.entries({ tax: amounts.tax, shipping: amounts.shipping, discount: amounts.discount })) {
    if (!Number.isInteger(v) || v < 0) throw new Error(`${k[0].toUpperCase()}${k.slice(1)} can’t be negative.`)
  }
  if (amounts.total <= 0) throw new Error('The order total must be more than ₹0.')
  if (amounts.total > 50_000_000) throw new Error('UPI payments are limited to ₹5,00,000 per order.')
}

