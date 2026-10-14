// ============================================================
// PATCH /api/whatsapp/commerce/orders/[id]
//
//   { action: 'status', status, note? } → update fulfilment and tell the
//        customer (order_status card for WhatsApp Pay orders, a short
//        text otherwise; set notify: false to skip the message).
//   { action: 'mark_paid' }             → manual / UPI-ID payment received.
// Agents and above.
// ============================================================

import { NextResponse } from 'next/server'

import { requireRole, toErrorResponse } from '@/lib/auth/account'
import { supabaseAdmin } from '@/lib/flows/admin-client'
import {
  NEXT_STATUSES,
  STATUS_MESSAGE,
  buildOrderStatusInteractive,
  loadCommerce,
  sendWhatsApp,
  type OrderStatus,
} from '@/lib/whatsapp/commerce'
import { customerForConversation } from '@/lib/whatsapp/calling-server'
import { logOutgoing } from '@/lib/whatsapp/commerce-server'

export async function PATCH(request: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const ctx = await requireRole('agent')
    const { id } = await params
    const b = ((await request.json().catch(() => null)) ?? {}) as Record<string, unknown>

    const db = supabaseAdmin()
    const { data: order } = await db.from('whatsapp_orders').select('*').eq('id', id).eq('account_id', ctx.accountId).maybeSingle()
    if (!order) return NextResponse.json({ error: 'Order not found' }, { status: 404 })
    const now = new Date().toISOString()

    if (b.action === 'mark_paid') {
      const { data } = await db
        .from('whatsapp_orders')
        .update({ payment_status: 'paid', paid_at: now, payment_mode: order.payment_mode ?? 'manual', updated_at: now })
        .eq('id', id)
        .select('*')
        .single()
      return NextResponse.json({ ok: true, order: data })
    }

    if (b.action === 'status') {
      const status = b.status as OrderStatus
      if (!NEXT_STATUSES[order.status as OrderStatus]?.includes(status)) {
        return NextResponse.json({ error: `Can’t change a ${order.status} order to ${status}.` }, { status: 400 })
      }
      if (status === 'canceled' && order.payment_status === 'paid') {
        return NextResponse.json({ error: 'This order is paid — refund it first, then cancel.' }, { status: 400 })
      }
      const note = typeof b.note === 'string' ? b.note.trim().slice(0, 120) : ''

      let warning: string | null = null
      if (b.notify !== false && order.conversation_id) {
        try {
          const customer = await customerForConversation(ctx.accountId, order.conversation_id)
          const { creds } = await loadCommerce(db, ctx.accountId)
          const text = STATUS_MESSAGE[status as Exclude<OrderStatus, 'pending'>].replace('{ref}', order.reference_id) + (note ? `\n${note}` : '')
          const wamid =
            order.payment_mode === 'whatsapp_pay'
              ? await sendWhatsApp(creds, customer.phone, {
                  type: 'interactive',
                  interactive: buildOrderStatusInteractive(order.reference_id, status, text, note || undefined),
                })
              : await sendWhatsApp(creds, customer.phone, { type: 'text', text: { body: text } })
          await logOutgoing(db, { conversationId: customer.conversationId, userId: ctx.userId, text: `📦 ${text}`, wamid })
        } catch (err) {
          warning = `Status saved, but the customer wasn’t messaged: ${err instanceof Error ? err.message : 'send failed'}`
        }
      }

      const { data } = await db.from('whatsapp_orders').update({ status, updated_at: now }).eq('id', id).select('*').single()
      return NextResponse.json({ ok: true, order: data, warning })
    }

    return NextResponse.json({ error: 'Unknown action' }, { status: 400 })
  } catch (err) {
    return toErrorResponse(err)
  }
}
