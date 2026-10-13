// ============================================================
// POST /api/whatsapp/calls — call a customer from the inbox.
//
// { conversation_id, sdp } — `sdp` is the browser's WebRTC offer (ICE
// gathered). Places the call with Meta (action=connect) and records it
// in whatsapp_calls; Meta's SDP answer and the call's progress arrive on
// the `calls` webhook and reach the browser through Realtime.
//
// Needs the customer's call permission (Meta error 138006 → 409
// { code: 'no_permission' }). Agents and above; blocked while the plan
// is read-only.
// ============================================================

import { NextResponse } from 'next/server'

import { supabaseAdmin } from '@/lib/flows/admin-client'
import { accountCanSend } from '@/lib/billing/server'
import { checkRateLimit, rateLimitResponse, RATE_LIMITS } from '@/lib/rate-limit'
import { CallingError, NO_CALL_PERMISSION, loadCallingConfig, startCall } from '@/lib/whatsapp/calling'
import { callingErrorResponse, customerForConversation, requireCallingAgent } from '@/lib/whatsapp/calling-server'

export async function POST(request: Request) {
  try {
    const ctx = await requireCallingAgent()

    const limit = checkRateLimit(`calls:start:${ctx.userId}`, RATE_LIMITS.callStart)
    if (!limit.success) return rateLimitResponse(limit)

    const body = (await request.json().catch(() => null)) as { conversation_id?: unknown; sdp?: unknown } | null
    if (typeof body?.conversation_id !== 'string' || typeof body?.sdp !== 'string' || !body.sdp.startsWith('v=')) {
      return NextResponse.json({ error: 'conversation_id and a WebRTC offer are required' }, { status: 400 })
    }

    if (!(await accountCanSend(ctx.accountId))) {
      return NextResponse.json(
        { error: 'Your plan is read-only. Choose a plan in Settings → Plan & billing to make calls.' },
        { status: 402 },
      )
    }

    const db = supabaseAdmin()
    const customer = await customerForConversation(ctx.accountId, body.conversation_id)
    const cfg = await loadCallingConfig(db, ctx.accountId)

    let callId: string
    try {
      callId = await startCall(cfg, customer.phone, body.sdp, ctx.userId)
    } catch (err) {
      if (err instanceof CallingError && err.metaCode === NO_CALL_PERMISSION) {
        return NextResponse.json(
          { error: 'This customer hasn’t allowed calls yet. Ask for permission first.', code: 'no_permission' },
          { status: 409 },
        )
      }
      throw err
    }

    // The webhook may have created the row already (with Meta's SDP
    // answer) — insert if missing, then fill in our side.
    await db.from('whatsapp_calls').upsert(
      {
        call_id: callId,
        account_id: ctx.accountId,
        phone_number_id: cfg.phoneNumberId,
        direction: 'outbound',
      },
      { onConflict: 'call_id', ignoreDuplicates: true },
    )
    const { data: row } = await db
      .from('whatsapp_calls')
      .update({
        conversation_id: customer.conversationId,
        contact_id: customer.contactId,
        customer_number: customer.phone,
        customer_name: customer.name,
        started_by: ctx.userId,
      })
      .eq('call_id', callId)
      .select('id, call_id, status, sdp_answer')
      .single()

    return NextResponse.json({ ok: true, call: row })
  } catch (err) {
    return callingErrorResponse(err)
  }
}
