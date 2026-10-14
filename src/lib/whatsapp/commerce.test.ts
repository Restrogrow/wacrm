import { describe, expect, it, vi } from 'vitest'
import type { SupabaseClient } from '@supabase/supabase-js'

vi.mock('@/lib/whatsapp/encryption', () => ({ decrypt: (s: string) => s }))

import {
  NEXT_STATUSES,
  buildOrderDetailsInteractive,
  buildOrderStatusInteractive,
  buildUpiOrderText,
  computeAmounts,
  createOrderFromCatalog,
  handlePaymentStatus,
  newReferenceId,
  rupees,
  toPaise,
  validateOrder,
  type CommerceSettings,
  type OrderItem,
} from './commerce'

const items: OrderItem[] = [
  { name: 'Cotton kurta', quantity: 2, unit_price: 89900 },
  { name: 'Dupatta', retailer_id: 'SKU-9', quantity: 1, unit_price: 29900 },
]

const pay: CommerceSettings = {
  catalog_id: null,
  payment_mode: 'whatsapp_pay',
  payment_configuration: 'my-razorpay',
  payment_gateway: 'razorpay',
  upi_id: null,
  upi_name: null,
  goods_type: 'physical-goods',
}

describe('money', () => {
  it('formats paise as rupees, Indian style', () => {
    expect(rupees(123456)).toBe('₹1,234.56')
    expect(rupees(10000000)).toBe('₹1,00,000')
  })
  it('parses rupee input', () => {
    expect(toPaise('1,499.50')).toBe(149950)
    expect(toPaise('₹899')).toBe(89900)
    expect(Number.isNaN(toPaise('abc'))).toBe(true)
  })
  it('computes totals with tax, shipping and discount', () => {
    expect(computeAmounts(items, { tax: 5000, shipping: 4900, discount: 10000 })).toEqual({
      subtotal: 209700,
      tax: 5000,
      shipping: 4900,
      discount: 10000,
      total: 209600,
    })
  })
})

describe('validateOrder', () => {
  it('accepts a normal order', () => expect(() => validateOrder(items, computeAmounts(items))).not.toThrow())
  it('rejects bad items and totals', () => {
    expect(() => validateOrder([], computeAmounts([]))).toThrow(/at least one item/)
    expect(() => validateOrder([{ ...items[0], unit_price: 0 }], computeAmounts([]))).toThrow(/price/)
    expect(() => validateOrder([{ ...items[0], quantity: 0 }], computeAmounts(items))).toThrow(/quantity/)
    expect(() => validateOrder(items, computeAmounts(items, { discount: 9_999_999 }))).toThrow(/more than ₹0/)
  })
})

describe('message payloads', () => {
  it('order_details for WhatsApp Pay matches Meta’s format', () => {
    const amounts = computeAmounts(items, { shipping: 4900 })
    const msg = buildOrderDetailsInteractive(pay, { reference_id: 'RG-ABC', items, ...amounts }, 'Your order')
    expect(msg.type).toBe('order_details')
    expect(msg.action.name).toBe('review_and_pay')
    const p = msg.action.parameters
    expect(p.payment_settings[0]).toEqual({ type: 'payment_gateway', payment_gateway: { type: 'razorpay', configuration_name: 'my-razorpay' } })
    expect(p.total_amount).toEqual({ value: amounts.total, offset: 100 })
    expect(p.order.items[1]).toEqual({ retailer_id: 'SKU-9', name: 'Dupatta', amount: { value: 29900, offset: 100 }, quantity: 1 })
    expect(p.order.shipping).toEqual({ value: 4900, offset: 100, description: 'Shipping' })
    expect(p.order).not.toHaveProperty('tax')
  })

  it('refuses order_details when WhatsApp Pay isn’t set up', () => {
    expect(() => buildOrderDetailsInteractive({ ...pay, payment_configuration: null }, { reference_id: 'x', items, ...computeAmounts(items) }, 'x')).toThrow(/WhatsApp Pay/)
  })

  it('UPI text lists items, total, UPI ID and reference', () => {
    const text = buildUpiOrderText({ ...pay, payment_mode: 'upi_id', upi_id: 'shop@okaxis', upi_name: 'Priya Stores' }, { reference_id: 'RG-ABC', items, ...computeAmounts(items) })
    expect(text).toContain('Cotton kurta × 2 — ₹1,798')
    expect(text).toContain('*Total: ₹2,097*')
    expect(text).toContain('shop@okaxis')
    expect(text).toContain('RG-ABC')
  })

  it('order_status card', () => {
    expect(buildOrderStatusInteractive('RG-ABC', 'shipped', 'On its way', 'AWB 123')).toEqual({
      type: 'order_status',
      body: { text: 'On its way' },
      action: { name: 'review_order', parameters: { reference_id: 'RG-ABC', order: { status: 'shipped', description: 'AWB 123' } } },
    })
  })

  it('completed and cancelled are final', () => {
    expect(NEXT_STATUSES.completed).toEqual([])
    expect(NEXT_STATUSES.canceled).toEqual([])
    expect(NEXT_STATUSES.shipped).toEqual(['completed'])
  })

  it('reference ids are short and Meta-safe', () => {
    const id = newReferenceId()
    expect(id).toMatch(/^RG-[A-Z2-9]{8}$/)
    expect(id.length).toBeLessThanOrEqual(35)
  })
})

function fakeDb(onWrite: (table: string, row: Record<string, unknown>) => void, accountId = 'acc') {
  return {
    from(table: string) {
      const b: Record<string, unknown> = {
        select: () => b,
        eq: () => b,
        maybeSingle: async () => ({ data: table === 'whatsapp_config' ? { account_id: accountId } : null }),
        insert: async (row: Record<string, unknown>) => {
          onWrite(table, row)
          return { error: null }
        },
        update: (row: Record<string, unknown>) => {
          onWrite(table, row)
          return b
        },
        then: (r: (v: unknown) => void) => r({ error: null }),
      }
      return b
    },
  } as unknown as SupabaseClient
}

describe('webhooks', () => {
  it('creates a pending order from a catalog cart', async () => {
    const writes: Record<string, unknown>[] = []
    const summary = await createOrderFromCatalog(fakeDb((_, r) => writes.push(r)), {
      accountId: 'acc',
      contactId: 'ct',
      conversationId: 'cv',
      messageId: 'wamid.1',
      order: {
        catalog_id: 'c1',
        text: 'Deliver after 6',
        product_items: [
          { product_retailer_id: 'SKU-1', quantity: '2', item_price: '499', currency: 'INR' },
          { product_retailer_id: 'SKU-2', quantity: 1, item_price: 150.5, currency: 'INR' },
        ],
      },
    })
    expect(writes[0]).toMatchObject({ source: 'catalog', subtotal: 114850, total: 114850, note: 'Deliver after 6' })
    expect(summary).toContain('SKU-1 × 2 — ₹998')
    expect(summary).toContain('Total: ₹1,148.50')
  })

  it('marks an order paid from a WhatsApp Pay webhook', async () => {
    const writes: Record<string, unknown>[] = []
    await handlePaymentStatus(fakeDb((t, r) => t === 'whatsapp_orders' && writes.push(r)), 'pn1', {
      type: 'payment',
      status: 'captured',
      payment: { reference_id: 'RG-ABC', transaction: { id: 'order_1', pg_transaction_id: 'pay_1', status: 'success', method: { type: 'upi' } } },
    })
    expect(writes[0]).toMatchObject({ payment_status: 'paid', payment_method: 'upi', payment_txn_id: 'pay_1' })
    expect(writes[0].paid_at).toBeTruthy()
  })

  it('records failed payments', async () => {
    const writes: Record<string, unknown>[] = []
    await handlePaymentStatus(fakeDb((t, r) => t === 'whatsapp_orders' && writes.push(r)), 'pn1', {
      type: 'payment',
      status: 'pending',
      payment: { reference_id: 'RG-ABC', transaction: { status: 'failed' } },
    })
    expect(writes[0]).toMatchObject({ payment_status: 'failed' })
  })
})
