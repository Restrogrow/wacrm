// ============================================================
// /api/whatsapp/commerce/orders
//
//   GET  ?conversation_id= | ?contact_id= | (none = recent) → orders
//   POST { conversation_id, items: [{ name, retailer_id?, quantity,
//          price (₹) }], tax?, shipping?, discount? (₹), message? }
//        → creates the order and sends the payment request: WhatsApp
//        Pay "Review and pay" or a UPI-ID summary. Agents and above.
// ============================================================

import { NextResponse } from 'next/server'
import { checkRateLimit, rateLimitResponse, RATE_LIMITS } from '@/lib/rate-limit'

import { getCurrentAccount, requireRole, toErrorResponse } from '@/lib/auth/account'
import { supabaseAdmin } from '@/lib/flows/admin-client'
import { accountCanSend } from '@/lib/billing/server'
import { customerForConversation } from '@/lib/whatsapp/calling-server'
import { CallingError } from '@/lib/whatsapp/calling'
import {
  buildOrderDetailsInteractive,
  buildUpiOrderText,
  computeAmounts,
  loadCommerce,
  newReferenceId,
  rupees,
  sendWhatsApp,
  toPaise,
  validateOrder,
  type OrderItem,
} from '@/lib/whatsapp/commerce'
import { logOutgoing } from '@/lib/whatsapp/commerce-server'

export async function GET(request: Request) {
  try {
    const ctx = await getCurrentAccount()
    const url = new URL(request.url)
    let q = supabaseAdmin()
      .from('whatsapp_orders')
      .select('*, contacts ( name, phone )')
      .eq('account_id', ctx.accountId)
      .order('created_at', { ascending: false })
      .limit(Math.min(Number(url.searchParams.get('limit') ?? 50) || 50, 200))
    const conv = url.searchParams.get('conversation_id')
    const contact = url.searchParams.get('contact_id')
    if (conv) q = q.eq('conversation_id', conv)
    if (contact) q = q.eq('contact_id', contact)
    const { data, error } = await q
    if (error) return NextResponse.json({ available: false, orders: [] })
    return NextResponse.json({ available: true, orders: data ?? [] })
  } catch (err) {
    return toErrorResponse(err)
  }
}

export async function POST(request: Request) {
  try {
    const ctx = await requireRole('agent')

    const sendLimit = checkRateLimit(`send:${ctx.userId}`, RATE_LIMITS.send)
    if (!sendLimit.success) return rateLimitResponse(sendLimit)
    const b = ((await request.json().catch(() => null)) ?? {}) as Record<string, unknown>
    if (typeof b.conversation_id !== 'string') return NextResponse.json({ error: 'conversation_id is required' }, { status: 400 })
    if (!(await accountCanSend(ctx.accountId))) {
      return NextResponse.json({ error: 'Your plan is read-only. Choose a plan to send messages.' }, { status: 402 })
    }

    const items: OrderItem[] = (Array.isArray(b.items) ? (b.items as Record<string, unknown>[]) : []).map((i) => ({
      name: String(i.name ?? '').trim(),
      retailer_id: typeof i.retailer_id === 'string' && i.retailer_id.trim() ? i.retailer_id.trim().slice(0, 100) : null,
      quantity: Math.round(Number(i.quantity ?? 1)),
      unit_price: toPaise(i.price as string | number),
    }))
    const extra = (v: unknown) => (v === undefined || v === null || v === '' ? 0 : toPaise(v as string | number))
    const amounts = computeAmounts(items, { tax: extra(b.tax), shipping: extra(b.shipping), discount: extra(b.discount) })
    try {
      validateOrder(items, amounts)
    } catch (err) {
      return NextResponse.json({ error: err instanceof Error ? err.message : 'Invalid order' }, { status: 400 })
    }

    const db = supabaseAdmin()
    let customer
    try {
      customer = await customerForConversation(ctx.accountId, b.conversation_id)
    } catch (err) {
      if (err instanceof CallingError) return NextResponse.json({ error: err.message }, { status: err.status })
      throw err
    }

    const { creds, settings } = await loadCommerce(db, ctx.accountId)
    if (settings.payment_mode === 'none') {
      return NextResponse.json({ error: 'Choose how customers pay in Settings → Orders & payments first.' }, { status: 400 })
    }

    const reference_id = newReferenceId()
    const order = { reference_id, items, ...amounts }
    const intro = typeof b.message === 'string' && b.message.trim() ? b.message.trim() : `Your order ${reference_id} — total ${rupees(amounts.total)}.`

    let wamid: string | null
    let chatText: string
    try {
      if (settings.payment_mode === 'whatsapp_pay') {
        wamid = await sendWhatsApp(creds, customer.phone, {
          type: 'interactive',
          interactive: buildOrderDetailsInteractive(settings, order, `${intro} Tap Review and pay.`),
        })
        chatText = `💳 Payment request ${reference_id} — ${rupees(amounts.total)}\n${items.map((i) => `• ${i.name} × ${i.quantity}`).join('\n')}`
      } else {
        const text = buildUpiOrderText(settings, order, intro)
        wamid = await sendWhatsApp(creds, customer.phone, { type: 'text', text: { body: text } })
        chatText = text
      }
    } catch (err) {
      return NextResponse.json({ error: err instanceof Error ? err.message : 'Could not send the order.' }, { status: 400 })
    }

    const { data: saved, error } = await db
      .from('whatsapp_orders')
      .insert({
        account_id: ctx.accountId,
        reference_id,
        conversation_id: customer.conversationId,
        contact_id: customer.contactId,
        source: 'agent',
        items,
        ...amounts,
        payment_status: 'requested',
        payment_mode: settings.payment_mode,
        message_id: wamid,
        created_by: ctx.userId,
      })
      .select('*')
      .single()
    if (error) console.error('[commerce] order sent but not saved:', error.message)

    await logOutgoing(db, {
      conversationId: customer.conversationId,
      userId: ctx.userId,
      text: chatText,
      wamid,
      preview: `💳 Order ${reference_id} — ${rupees(amounts.total)}`,
    })
    return NextResponse.json({ ok: true, order: saved })
  } catch (err) {
    return toErrorResponse(err)
  }
}
