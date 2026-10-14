// ============================================================
// POST /api/whatsapp/forms/[id]/send — send a published form in a chat.
//
// { conversation_id, body?, cta? } → interactive "flow" message. Needs
// an open 24-hour window (the customer messaged in the last 24 hours).
// Agents and above; blocked while the plan is read-only.
// ============================================================

import { NextResponse } from 'next/server'
import { checkRateLimit, rateLimitResponse, RATE_LIMITS } from '@/lib/rate-limit'

import { requireRole, toErrorResponse } from '@/lib/auth/account'
import { supabaseAdmin } from '@/lib/flows/admin-client'
import { accountCanSend } from '@/lib/billing/server'
import { loadFormCreds, sendFormMessage } from '@/lib/whatsapp/forms'
import { customerForConversation } from '@/lib/whatsapp/calling-server'
import { CallingError } from '@/lib/whatsapp/calling'

export async function POST(request: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const ctx = await requireRole('agent')

    const sendLimit = checkRateLimit(`send:${ctx.userId}`, RATE_LIMITS.send)
    if (!sendLimit.success) return rateLimitResponse(sendLimit)
    const { id } = await params
    const body = (await request.json().catch(() => null)) as { conversation_id?: unknown; body?: unknown; cta?: unknown } | null
    if (typeof body?.conversation_id !== 'string') {
      return NextResponse.json({ error: 'conversation_id is required' }, { status: 400 })
    }
    if (!(await accountCanSend(ctx.accountId))) {
      return NextResponse.json({ error: 'Your plan is read-only. Choose a plan to send messages.' }, { status: 402 })
    }

    const db = supabaseAdmin()
    const { data: form } = await db
      .from('whatsapp_forms')
      .select('id, name, title, status, meta_flow_id')
      .eq('id', id)
      .eq('account_id', ctx.accountId)
      .maybeSingle()
    if (!form) return NextResponse.json({ error: 'Form not found' }, { status: 404 })
    if (form.status !== 'published' || !form.meta_flow_id) {
      return NextResponse.json({ error: 'This form isn’t published yet. Fix it in Settings → WhatsApp forms.' }, { status: 400 })
    }

    let customer
    try {
      customer = await customerForConversation(ctx.accountId, body.conversation_id)
    } catch (err) {
      if (err instanceof CallingError) {
        const message = err.code === 'no_phone' ? 'This customer hides their number, so a form can’t be sent to them yet.' : err.message
        return NextResponse.json({ error: message }, { status: err.status })
      }
      throw err
    }

    const text =
      typeof body.body === 'string' && body.body.trim() ? body.body.trim() : `Please fill in this quick form: ${form.title}`
    const cta = typeof body.cta === 'string' && body.cta.trim() ? body.cta.trim() : 'Open form'

    let wamid: string | null
    try {
      wamid = await sendFormMessage(await loadFormCreds(db, ctx.accountId), customer.phone, {
        flowId: form.meta_flow_id,
        formId: form.id,
        body: text,
        cta,
      })
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Could not send the form.'
      const outsideWindow = /24|window|re-?engagement/i.test(message)
      return NextResponse.json(
        {
          error: outsideWindow
            ? 'Forms can only be sent within 24 hours of the customer’s last message. Send a template first.'
            : message,
        },
        { status: 400 },
      )
    }

    const now = new Date().toISOString()
    await db.from('messages').insert({
      conversation_id: customer.conversationId,
      sender_type: 'agent',
      sender_id: ctx.userId,
      content_type: 'text',
      content_text: `📝 Form sent: ${form.name}\n${text}`,
      message_id: wamid,
      status: 'sent',
      created_at: now,
    })
    await db
      .from('conversations')
      .update({ last_message_text: `📝 Form sent: ${form.name}`, last_message_at: now })
      .eq('id', customer.conversationId)

    return NextResponse.json({ ok: true })
  } catch (err) {
    return toErrorResponse(err)
  }
}
