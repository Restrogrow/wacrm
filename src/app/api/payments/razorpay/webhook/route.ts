// ============================================================
// POST /api/payments/razorpay/webhook
//
// One URL for every account. Razorpay events carry the payment-link
// reference we set (our `payment_links.id`), which tells us the account
// and therefore which webhook secret to verify against. Nothing is
// changed until X-Razorpay-Signature (HMAC-SHA256 of the raw body) has
// been verified with that account's secret; unsigned / bad requests are
// counted per IP and blocked like the other webhooks.
//
// Handles payment_link.paid, payment_link.expired, payment_link.cancelled
// and payment.failed. Always answers 200 for valid, handled events so
// Razorpay does not retry; replays are idempotent.
// ============================================================

import { NextResponse } from 'next/server'

import { accountCanSend } from '@/lib/billing/server'
import { supabaseAdmin } from '@/lib/flows/admin-client'
import {
  loadRazorpayCreds,
  paymentIdFromEvent,
  verifyRazorpaySignature,
  type RazorpayWebhookEvent,
} from '@/lib/payments/razorpay'
import { recordWebhookRejection, webhookBlocked } from '@/lib/rate-limit'
import { customerForConversation } from '@/lib/whatsapp/calling-server'
import { loadCommerce, rupees, sendWhatsApp } from '@/lib/whatsapp/commerce'
import { logOutgoing } from '@/lib/whatsapp/commerce-server'

export async function POST(request: Request) {
  const blocked = webhookBlocked(request, 'razorpay')
  if (blocked) return blocked

  const raw = await request.text()
  const signature = request.headers.get('x-razorpay-signature')

  let event: RazorpayWebhookEvent
  try {
    event = JSON.parse(raw) as RazorpayWebhookEvent
  } catch {
    recordWebhookRejection(request, 'razorpay')
    return NextResponse.json({ error: 'Invalid body' }, { status: 400 })
  }
  if (!signature) {
    recordWebhookRejection(request, 'razorpay')
    return NextResponse.json({ error: 'Missing signature' }, { status: 401 })
  }

  const db = supabaseAdmin()
  const paymentId = paymentIdFromEvent(event)
  if (!paymentId) return NextResponse.json({ ok: true, ignored: true })

  const { data: payment } = await db
    .from('payment_links')
    .select('id, account_id, conversation_id, order_id, amount, status, created_by')
    .eq('id', paymentId)
    .maybeSingle()
  // Not one of ours (e.g. other Razorpay activity on the same merchant account).
  if (!payment) return NextResponse.json({ ok: true, ignored: true })

  const creds = await loadRazorpayCreds(db, payment.account_id as string)
  if (!creds) return NextResponse.json({ ok: true, ignored: true })

  if (!verifyRazorpaySignature(raw, signature, creds.webhookSecret)) {
    recordWebhookRejection(request, 'razorpay')
    return NextResponse.json({ error: 'Invalid signature' }, { status: 401 })
  }

  const now = new Date().toISOString()
  const accountId = payment.account_id as string
  const pay = event.payload?.payment?.entity

  switch (event.event) {
    case 'payment_link.paid': {
      // Only the first delivery flips the status, so replays send nothing twice.
      const { data: updated } = await db
        .from('payment_links')
        .update({
          status: 'paid',
          razorpay_payment_id: pay?.id ?? null,
          payment_method: pay?.method ?? null,
          paid_at: now,
          updated_at: now,
        })
        .eq('id', payment.id)
        .neq('status', 'paid')
        .select('id')
        .maybeSingle()
      if (!updated) break

      if (payment.order_id) {
        await db
          .from('whatsapp_orders')
          .update({
            payment_status: 'paid',
            payment_mode: 'razorpay_link',
            payment_method: pay?.method ?? null,
            payment_txn_id: pay?.id ?? null,
            paid_at: now,
            updated_at: now,
          })
          .eq('id', payment.order_id)
          .eq('account_id', accountId)
      }

      // "Payment received" note in the chat. Free-form text only works inside
      // the 24-hour window; outside it WhatsApp refuses and we just skip it.
      if (payment.conversation_id && (await accountCanSend(accountId))) {
        try {
          const customer = await customerForConversation(accountId, payment.conversation_id as string)
          const { creds: wa } = await loadCommerce(db, accountId)
          const text = `✅ Payment of ${rupees(payment.amount as number)} received. Thank you!`
          const wamid = await sendWhatsApp(wa, customer.phone, { type: 'text', text: { body: text } })
          if (payment.created_by) {
            await logOutgoing(db, {
              conversationId: customer.conversationId,
              userId: payment.created_by as string,
              text,
              wamid,
              preview: text,
            })
          }
        } catch (err) {
          console.error('[razorpay] payment confirmation not sent:', err instanceof Error ? err.message : err)
        }
      }
      break
    }

    case 'payment_link.expired':
    case 'payment_link.cancelled': {
      const status = event.event === 'payment_link.expired' ? 'expired' : 'cancelled'
      const { data: updated } = await db
        .from('payment_links')
        .update({ status, updated_at: now })
        .eq('id', payment.id)
        .in('status', ['created', 'failed'])
        .select('id')
        .maybeSingle()
      if (updated && payment.order_id) {
        // The order goes back to "unpaid" so another request can be sent.
        await db
          .from('whatsapp_orders')
          .update({ payment_status: 'unpaid', updated_at: now })
          .eq('id', payment.order_id)
          .eq('account_id', accountId)
          .eq('payment_status', 'requested')
          .eq('payment_mode', 'razorpay_link')
      }
      break
    }

    case 'payment.failed': {
      // A failed attempt does not kill the link (the customer can retry);
      // a later successful payment overwrites this.
      await db
        .from('payment_links')
        .update({ status: 'failed', updated_at: now })
        .eq('id', payment.id)
        .eq('status', 'created')
      break
    }

    default:
      break
  }

  return NextResponse.json({ ok: true })
}
