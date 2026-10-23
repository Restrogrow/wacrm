// ============================================================
// Catalog, orders and payments for India (migration 053).
//
//   Orders     whatsapp_orders, amounts in paise. Created by an agent in
//              a chat, or automatically when a customer sends a cart
//              from the business's WhatsApp catalog (`order` message).
//   Payments   'whatsapp_pay': interactive order_details with
//              review_and_pay and the payment configuration made in
//              WhatsApp Manager (Razorpay / PayU / BillDesk / Zaakpay
//              deep integration); `statuses[].type = payment` webhooks
//              mark the order paid. 'upi_id': a text summary with the
//              business's UPI ID; an agent marks it paid.
//   Status     order_status interactive message (WhatsApp Pay orders)
//              or a short text (UPI orders).
//   Catalog    catalog_message ("Share catalog") and single product
//              messages.
// Docs: https://developers.facebook.com/documentation/business-messaging/whatsapp/payments/payments-in/pg
// ============================================================

import type { SupabaseClient } from '@supabase/supabase-js'

import { decrypt } from '@/lib/whatsapp/encryption'
import { lookupCartProducts } from '@/lib/catalog/order-stock'
import { checkCartStock, stockIssueLines } from '@/lib/catalog/stock'

const GRAPH = 'https://graph.facebook.com/v21.0'

export * from './commerce-core'
import {
  computeAmounts,
  rupees,
  toPaise,
  type CommerceSettings,
  type OrderAmounts,
  type OrderItem,
  type OrderStatus,
  type PaymentStatus,
} from './commerce-core'

/** Short, unique, Meta-safe reference: "RG-7K2Q9X" (≤ 35 chars, A-Z0-9-). */
export function newReferenceId(): string {
  const alphabet = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789'
  let id = ''
  const bytes = crypto.getRandomValues(new Uint8Array(8))
  for (const b of bytes) id += alphabet[b % alphabet.length]
  return `RG-${id}`
}

// ---------- Message payloads ----------

const amount = (paise: number, description?: string) => ({ value: paise, offset: 100, ...(description ? { description } : {}) })

export function buildOrderDetailsInteractive(
  settings: CommerceSettings,
  order: { reference_id: string; items: OrderItem[] } & OrderAmounts,
  bodyText: string,
) {
  if (settings.payment_mode !== 'whatsapp_pay' || !settings.payment_configuration || !settings.payment_gateway) {
    throw new Error('Set up WhatsApp Pay in Orders & payments first.')
  }
  return {
    type: 'order_details',
    body: { text: bodyText.slice(0, 1024) },
    action: {
      name: 'review_and_pay',
      parameters: {
        reference_id: order.reference_id,
        type: settings.goods_type,
        payment_settings: [
          {
            type: 'payment_gateway',
            payment_gateway: {
              type: settings.payment_gateway,
              configuration_name: settings.payment_configuration,
            },
          },
        ],
        currency: 'INR',
        total_amount: amount(order.total),
        order: {
          status: 'pending',
          ...(settings.catalog_id && order.items.every((i) => i.retailer_id) ? { catalog_id: settings.catalog_id } : {}),
          items: order.items.map((i) => ({
            ...(i.retailer_id ? { retailer_id: i.retailer_id } : { retailer_id: i.name.slice(0, 30).replace(/[^A-Za-z0-9_-]+/g, '-') }),
            name: i.name.slice(0, 60),
            amount: amount(i.unit_price),
            quantity: i.quantity,
          })),
          subtotal: amount(order.subtotal),
          ...(order.tax ? { tax: amount(order.tax, 'Tax') } : {}),
          ...(order.shipping ? { shipping: amount(order.shipping, 'Shipping') } : {}),
          ...(order.discount ? { discount: amount(order.discount, 'Discount') } : {}),
        },
      },
    },
  }
}

/** Order summary for UPI-ID payments (plain text). */
export function buildUpiOrderText(
  settings: CommerceSettings,
  order: { reference_id: string; items: OrderItem[] } & OrderAmounts,
  intro?: string,
): string {
  if (!settings.upi_id) throw new Error('Add your UPI ID in Orders & payments first.')
  const lines = [
    intro?.trim() || 'Here is your order:',
    '',
    ...order.items.map((i) => `• ${i.name} × ${i.quantity} — ${rupees(i.unit_price * i.quantity)}`),
    ...(order.tax ? [`Tax: ${rupees(order.tax)}`] : []),
    ...(order.shipping ? [`Shipping: ${rupees(order.shipping)}`] : []),
    ...(order.discount ? [`Discount: −${rupees(order.discount)}`] : []),
    `*Total: ${rupees(order.total)}*`,
    '',
    `Pay by UPI to *${settings.upi_id}*${settings.upi_name ? ` (${settings.upi_name})` : ''} and add *${order.reference_id}* in the note. Reply here with a screenshot once paid.`,
  ]
  return lines.join('\n')
}

export function buildOrderStatusInteractive(referenceId: string, status: OrderStatus, text: string, description?: string) {
  if (status === 'pending') throw new Error('Choose a new status.')
  return {
    type: 'order_status',
    body: { text: text.slice(0, 1024) },
    action: {
      name: 'review_order',
      parameters: {
        reference_id: referenceId,
        order: { status, ...(description ? { description: description.slice(0, 120) } : {}) },
      },
    },
  }
}

export const STATUS_MESSAGE: Record<Exclude<OrderStatus, 'pending'>, string> = {
  processing: 'We’ve received your order {ref} and are preparing it.',
  shipped: 'Good news — your order {ref} has been shipped.',
  completed: 'Your order {ref} has been delivered. Thank you!',
  canceled: 'Your order {ref} has been cancelled.',
}

// ---------- Meta calls ----------

export interface CommerceCreds {
  phoneNumberId: string
  accessToken: string
}

export async function loadCommerce(db: SupabaseClient, accountId: string): Promise<{ creds: CommerceCreds; settings: CommerceSettings }> {
  const [{ data: config }, { data: settings }] = await Promise.all([
    db.from('whatsapp_config').select('phone_number_id, access_token').eq('account_id', accountId).maybeSingle(),
    db.from('commerce_settings').select('*').eq('account_id', accountId).maybeSingle(),
  ])
  if (!config?.phone_number_id || !config.access_token) throw new Error('Connect WhatsApp first (Settings → WhatsApp).')
  return {
    creds: { phoneNumberId: config.phone_number_id, accessToken: decrypt(config.access_token) },
    settings: (settings as CommerceSettings | null) ?? {
      catalog_id: null,
      payment_mode: 'none',
      payment_configuration: null,
      payment_gateway: null,
      upi_id: null,
      upi_name: null,
      goods_type: 'physical-goods',
    },
  }
}

export async function sendWhatsApp(creds: CommerceCreds, to: string, message: Record<string, unknown>): Promise<string | null> {
  const res = await fetch(`${GRAPH}/${creds.phoneNumberId}/messages`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${creds.accessToken}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ messaging_product: 'whatsapp', recipient_type: 'individual', to, ...message }),
  })
  const json = (await res.json().catch(() => ({}))) as { messages?: { id: string }[]; error?: { message?: string; error_user_msg?: string; code?: number } }
  if (!res.ok || json.error) {
    const msg = json.error?.error_user_msg || json.error?.message || `WhatsApp returned ${res.status}`
    throw new Error(/131047|re-?engagement|24 ?hours?/i.test(msg) ? 'This needs an open 24-hour chat window — the customer must have messaged in the last 24 hours.' : msg)
  }
  return json.messages?.[0]?.id ?? null
}

export function catalogMessage(bodyText: string, thumbnailRetailerId?: string) {
  return {
    type: 'interactive',
    interactive: {
      type: 'catalog_message',
      body: { text: bodyText.slice(0, 1024) },
      action: {
        name: 'catalog_message',
        ...(thumbnailRetailerId ? { parameters: { thumbnail_product_retailer_id: thumbnailRetailerId } } : {}),
      },
    },
  }
}

export function productMessage(catalogId: string, retailerId: string, bodyText?: string) {
  return {
    type: 'interactive',
    interactive: {
      type: 'product',
      ...(bodyText ? { body: { text: bodyText.slice(0, 1024) } } : {}),
      action: { catalog_id: catalogId, product_retailer_id: retailerId },
    },
  }
}

// ---------- Webhooks ----------

export interface CatalogOrderMessage {
  catalog_id?: string
  text?: string
  product_items?: { product_retailer_id?: string; quantity?: string | number; item_price?: string | number; currency?: string }[]
}

/** Customer sent a cart from the catalog → create a pending order. Returns a chat summary. */
export async function createOrderFromCatalog(
  db: SupabaseClient,
  args: { accountId: string; contactId: string; conversationId: string; messageId: string; order: CatalogOrderMessage },
): Promise<string | null> {
  const items: OrderItem[] = (args.order.product_items ?? [])
    .map((p) => ({
      name: p.product_retailer_id ?? 'Item',
      retailer_id: p.product_retailer_id ?? null,
      quantity: Math.max(1, Math.round(Number(p.quantity ?? 1))),
      unit_price: toPaise(Number(p.item_price ?? 0)),
    }))
    .filter((i) => Number.isFinite(i.unit_price))
  if (!items.length) return null

  // Product library (catalog): real names on the order, and a stock check.
  // Informational only — the order is always saved as the customer placed it.
  const known = await lookupCartProducts(db, args.accountId, items.map((i) => i.retailer_id))
  for (const it of items) {
    const p = it.retailer_id ? known[it.retailer_id] : undefined
    if (p?.title) it.name = p.title.slice(0, 60)
  }
  const stockLines = stockIssueLines(checkCartStock(items, known))

  const amounts = computeAmounts(items)
  const referenceId = newReferenceId()
  const { error } = await db.from('whatsapp_orders').insert({
    account_id: args.accountId,
    reference_id: referenceId,
    conversation_id: args.conversationId,
    contact_id: args.contactId,
    source: 'catalog',
    items,
    ...amounts,
    note: args.order.text ?? null,
    message_id: args.messageId,
  })
  if (error) {
    console.warn('[commerce] catalog order not saved:', error.message)
    return null
  }
  const lines = items.map((i) => `• ${i.retailer_id && known[i.retailer_id] ? i.name : i.retailer_id} × ${i.quantity} — ${rupees(i.unit_price * i.quantity)}`)
  return `🛒 New order ${referenceId}\n${lines.join('\n')}\nTotal: ${rupees(amounts.total)}${args.order.text ? `\n“${args.order.text}”` : ''}${stockLines.length ? `\n${stockLines.join('\n')}` : ''}`
}

export interface PaymentStatusEvent {
  type?: string
  status?: string
  payment?: {
    reference_id?: string
    transaction?: { id?: string; pg_transaction_id?: string; status?: string; method?: { type?: string } }
    refunds?: unknown[]
  }
}

/** `statuses[].type === 'payment'` from WhatsApp Pay. */
export async function handlePaymentStatus(db: SupabaseClient, phoneNumberId: string, event: PaymentStatusEvent): Promise<void> {
  const ref = event.payment?.reference_id
  if (!ref) return
  const { data: config } = await db.from('whatsapp_config').select('account_id').eq('phone_number_id', phoneNumberId).maybeSingle()
  if (!config?.account_id) return

  const txn = event.payment?.transaction
  const txnStatus = (txn?.status ?? '').toLowerCase()
  const payment_status: PaymentStatus =
    event.payment?.refunds?.length
      ? 'refunded'
      : event.status === 'captured' || txnStatus === 'success'
        ? 'paid'
        : txnStatus === 'failed'
          ? 'failed'
          : 'pending'

  await db
    .from('whatsapp_orders')
    .update({
      payment_status,
      payment_mode: 'whatsapp_pay',
      payment_method: txn?.method?.type ?? null,
      payment_txn_id: txn?.pg_transaction_id ?? txn?.id ?? null,
      ...(payment_status === 'paid' ? { paid_at: new Date().toISOString() } : {}),
      updated_at: new Date().toISOString(),
    })
    .eq('account_id', config.account_id)
    .eq('reference_id', ref)
}
