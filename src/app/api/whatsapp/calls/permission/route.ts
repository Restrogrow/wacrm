// ============================================================
// /api/whatsapp/calls/permission — can we call this customer?
//
//   GET  ?conversation_id=  → { status, expires_at, can_call, can_request }
//   POST { conversation_id, text? } → sends a call permission request
//        (the customer taps Allow / Don't allow in WhatsApp). Needs an
//        open 24-hour window; Meta allows 1 request a day, 2 a week.
// ============================================================

import { NextResponse } from 'next/server'

import { supabaseAdmin } from '@/lib/flows/admin-client'
import {
  DEFAULT_PERMISSION_TEXT,
  getCallPermission,
  loadCallingConfig,
  sendCallPermissionRequest,
} from '@/lib/whatsapp/calling'
import { callingErrorResponse, customerForConversation, requireCallingAgent } from '@/lib/whatsapp/calling-server'

export async function GET(request: Request) {
  try {
    const ctx = await requireCallingAgent()
    const conversationId = new URL(request.url).searchParams.get('conversation_id')
    if (!conversationId) return NextResponse.json({ error: 'conversation_id is required' }, { status: 400 })

    const customer = await customerForConversation(ctx.accountId, conversationId)
    const cfg = await loadCallingConfig(supabaseAdmin(), ctx.accountId)
    const p = await getCallPermission(cfg, customer.phone)
    return NextResponse.json({
      status: p.status,
      expires_at: p.expiresAt,
      can_call: p.canCall,
      can_request: p.canRequest,
    })
  } catch (err) {
    return callingErrorResponse(err)
  }
}

export async function POST(request: Request) {
  try {
    const ctx = await requireCallingAgent()
    const body = (await request.json().catch(() => null)) as { conversation_id?: unknown; text?: unknown } | null
    if (typeof body?.conversation_id !== 'string') {
      return NextResponse.json({ error: 'conversation_id is required' }, { status: 400 })
    }
    const text =
      typeof body.text === 'string' && body.text.trim() ? body.text.trim().slice(0, 1024) : DEFAULT_PERMISSION_TEXT

    const db = supabaseAdmin()
    const customer = await customerForConversation(ctx.accountId, body.conversation_id)
    const cfg = await loadCallingConfig(db, ctx.accountId)
    const wamid = await sendCallPermissionRequest(cfg, customer.phone, text)

    // Show it in the chat like any other outgoing message.
    const now = new Date().toISOString()
    await db.from('messages').insert({
      conversation_id: customer.conversationId,
      sender_type: 'agent',
      sender_id: ctx.userId,
      content_type: 'text',
      content_text: `📞 Call permission request: ${text}`,
      message_id: wamid,
      status: 'sent',
      created_at: now,
    })
    await db
      .from('conversations')
      .update({ last_message_text: '📞 Call permission request', last_message_at: now })
      .eq('id', customer.conversationId)

    return NextResponse.json({ ok: true })
  } catch (err) {
    return callingErrorResponse(err)
  }
}
