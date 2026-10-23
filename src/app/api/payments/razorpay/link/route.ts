// ============================================================
// /api/payments/razorpay/link
//
//   GET  ?conversation_id=  → payment links sent in that chat (members)
//   POST { conversation_id, amount (₹), description, order_id? }
//        → creates a Razorpay Payment Link with the account's own keys,
//        sends the short URL to the customer on WhatsApp and records it.
//        Agents and above. If order_id is given and amount omitted, the
//        order total is used and the order is marked "payment requested".
// ============================================================

import { NextResponse } from 'next/server'

import { getCurrentAccount, requireRole, toErrorResponse } from '@/lib/auth/account'
import { accountCanSend } from '@/lib/billing/server'
import { supabaseAdmin } from '@/lib/flows/admin-client'
import { checkRateLimit, rateLimitResponse, RATE_LIMITS } from '@/lib/rate-limit'
import { customerForConversation } from '@/lib/whatsapp/calling-server'
import { CallingError } from '@/lib/whatsapp/calling'
import { loadCommerce, rupees, sendWhatsApp } from '@/lib/whatsapp/commerce'
import { logOutgoing } from '@/lib/whatsapp/commerce-server'
import {
  RazorpayError,
  cancelPaymentLink,
  createPaymentLink,
  loadRazorpayCreds,
  rupeesToPaise,
  validateLinkAmount,
} from '@/lib/payments/razorpay'

export async function GET(request: Request) {
  try {
    const ctx = await getCurrentAccount()
    const conversationId = new URL(request.url).searchParams.get('conversation_id')
    if (!conversationId) return NextResponse.json({ error: 'conversation_id is required' }, { status: 400 })
    const { data, error } = await supabaseAdmin()
      .from('payment_links')
      .select('id, order_id, amount, description, short_url, status, paid_at, created_at')
      .eq('account_id', ctx.accountId)
      .eq('conversation_id', conversationId)
      .order('created_at', { ascending: false })
      .limit(20)
    if (error) return NextResponse.json({ available: false, links: [] })
    return NextResponse.json({ available: true, links: data ?? [] })
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

    const db = supabaseAdmin()
    const creds = await loadRazorpayCreds(db, ctx.accountId)
    if (!creds) {
      return NextResponse.json({ error: 'Connect Razorpay first (Orders & payments).' }, { status: 400 })
    }

    // Optional order: must belong to this account.
    let orderId: string | null = null
    let orderTotal: number | null = null
    if (typeof b.order_id === 'string' && b.order_id) {
      const { data: order } = await db
        .from('whatsapp_orders')
        .select('id, total, payment_status')
        .eq('id', b.order_id)
        .eq('account_id', ctx.accountId)
        .maybeSingle()
      if (!order) return NextResponse.json({ error: 'Order not found.' }, { status: 404 })
      if (order.payment_status === 'paid') return NextResponse.json({ error: 'That order is already paid.' }, { status: 400 })
      orderId = order.id as string
      orderTotal = order.total as number
    }

    const amountInput = b.amount === undefined || b.amount === null || b.amount === '' ? null : rupeesToPaise(b.amount as string | number)
    const amount = amountInput ?? orderTotal
    try {
      if (amount === null) throw new RazorpayError('Enter the amount to collect.', 400)
      validateLinkAmount(amount)
    } catch (err) {
      return NextResponse.json({ error: err instanceof Error ? err.message : 'Invalid amount' }, { status: 400 })
    }
    const description =
      (typeof b.description === 'string' && b.description.trim().slice(0, 200)) || (orderId ? 'Payment for your order' : 'Payment request')

    let customer
    try {
      customer = await customerForConversation(ctx.accountId, b.conversation_id)
    } catch (err) {
      if (err instanceof CallingError) return NextResponse.json({ error: err.message }, { status: err.status })
      throw err
    }

    let whatsapp
    try {
      whatsapp = (await loadCommerce(db, ctx.accountId)).creds
    } catch (err) {
      return NextResponse.json({ error: err instanceof Error ? err.message : 'Connect WhatsApp first.' }, { status: 400 })
    }

    const { data: row, error: insErr } = await db
      .from('payment_links')
      .insert({
        account_id: ctx.accountId,
        conversation_id: customer.conversationId,
        contact_id: customer.contactId,
        order_id: orderId,
        amount,
        description,
        created_by: ctx.userId,
      })
      .select('id')
      .single()
    if (insErr || !row) {
      console.error('[razorpay] insert payment link failed:', insErr?.message)
      return NextResponse.json({ error: 'Could not save the payment. Run migration 064_razorpay_payment_links.sql first.' }, { status: 500 })
    }

    let link
    try {
      link = await createPaymentLink(creds, {
        amountPaise: amount as number,
        description,
        referenceId: row.id as string,
        notes: { rg_payment_id: row.id as string },
      })
    } catch (err) {
      await db.from('payment_links').update({ status: 'cancelled', updated_at: new Date().toISOString() }).eq('id', row.id)
      if (err instanceof RazorpayError) return NextResponse.json({ error: err.message }, { status: err.status })
      throw err
    }

    const text = `💳 Payment request — ${rupees(amount as number)}\n${description}\n\nPay securely here: ${link.shortUrl}`
    let wamid: string | null
    try {
      wamid = await sendWhatsApp(whatsapp, customer.phone, { type: 'text', text: { body: text, preview_url: true } })
    } catch (err) {
      // Don't leave a live link the customer never received.
      await cancelPaymentLink(creds, link.id)
      await db.from('payment_links').update({ status: 'cancelled', razorpay_link_id: link.id, short_url: link.shortUrl, updated_at: new Date().toISOString() }).eq('id', row.id)
      return NextResponse.json({ error: err instanceof Error ? err.message : 'Could not send the link on WhatsApp.' }, { status: 400 })
    }

    const { data: saved } = await db
      .from('payment_links')
      .update({ razorpay_link_id: link.id, short_url: link.shortUrl, updated_at: new Date().toISOString() })
      .eq('id', row.id)
      .select('id, order_id, amount, description, short_url, status, paid_at, created_at')
      .single()

    if (orderId) {
      await db
        .from('whatsapp_orders')
        .update({ payment_status: 'requested', payment_mode: 'razorpay_link', updated_at: new Date().toISOString() })
        .eq('id', orderId)
        .eq('account_id', ctx.accountId)
        .neq('payment_status', 'paid')
    }

    await logOutgoing(db, {
      conversationId: customer.conversationId,
      userId: ctx.userId,
      text,
      wamid,
      preview: `💳 Payment request — ${rupees(amount as number)}`,
    })

    return NextResponse.json({ ok: true, link: saved })
  } catch (err) {
    return toErrorResponse(err)
  }
}
