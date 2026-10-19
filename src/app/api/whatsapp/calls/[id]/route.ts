// ============================================================
// POST /api/whatsapp/calls/[id] — act on a call (row id).
//
//   { action: 'answer', sdp }  inbound, ringing: the first agent to
//                              answer claims it (others get 409), then
//                              pre_accept + accept with the browser's
//                              SDP answer. With ai: true the browser
//                              answers with the AI agent (migration 081):
//                              counts against the daily AI-call quota and
//                              marks the call ai_agent.
//   { action: 'reject' }       inbound, ringing: decline.
//   { action: 'hangup' }       end a call in progress (terminate).
// ============================================================

import { NextResponse } from 'next/server'

import { supabaseAdmin } from '@/lib/flows/admin-client'
import { callAction, loadCallingConfig } from '@/lib/whatsapp/calling'
import { callingErrorResponse, requireCallingAgent } from '@/lib/whatsapp/calling-server'
import { aiApiKey, AI_NOT_CONFIGURED } from '@/lib/ai/gemini'
import { consumeAiQuota } from '@/lib/ai/quota'

const FINISHED = ['ended', 'missed', 'rejected', 'failed']

export async function POST(request: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const ctx = await requireCallingAgent()
    const { id } = await params
    const body = (await request.json().catch(() => null)) as { action?: unknown; sdp?: unknown; ai?: unknown } | null
    const action = body?.action

    const db = supabaseAdmin()
    const { data: call } = await db
      .from('whatsapp_calls')
      .select('id, call_id, direction, status, answered_by, started_by')
      .eq('id', id)
      .eq('account_id', ctx.accountId)
      .maybeSingle()
    if (!call) return NextResponse.json({ error: 'Call not found' }, { status: 404 })

    const cfg = await loadCallingConfig(db, ctx.accountId)
    const now = new Date().toISOString()

    if (action === 'answer') {
      if (typeof body?.sdp !== 'string' || !body.sdp.startsWith('v=')) {
        return NextResponse.json({ error: 'A WebRTC answer is required' }, { status: 400 })
      }
      if (call.direction !== 'inbound') return NextResponse.json({ error: 'Not an incoming call' }, { status: 400 })

      const ai = body?.ai === true
      if (ai && !aiApiKey()) return NextResponse.json({ error: AI_NOT_CONFIGURED }, { status: 503 })

      // Claim: only one agent can pick up.
      const { data: claimed } = await db
        .from('whatsapp_calls')
        .update({ status: 'answering', answered_by: ctx.userId, ...(ai ? { ai_agent: true } : {}) })
        .eq('id', call.id)
        .eq('status', 'ringing')
        .select('id')
        .maybeSingle()
      if (!claimed) {
        return NextResponse.json({ error: 'Someone else answered, or the call ended.' }, { status: 409 })
      }
      // AI quota is counted only by the tab that won the claim; over the
      // limit, put the call back to ringing so a person can still pick up.
      if (ai) {
        const quota = await consumeAiQuota(ctx.accountId, 'voice_call')
        if (!quota.allowed) {
          await db
            .from('whatsapp_calls')
            .update({ status: 'ringing', answered_by: null, ai_agent: false })
            .eq('id', call.id)
            .eq('status', 'answering')
          return NextResponse.json({ error: quota.message }, { status: 429 })
        }
      }

      try {
        await callAction(cfg, call.call_id, 'pre_accept', body.sdp)
        await callAction(cfg, call.call_id, 'accept', body.sdp)
      } catch (err) {
        await db
          .from('whatsapp_calls')
          .update({ status: 'failed', error: err instanceof Error ? err.message : 'accept failed', ended_at: now })
          .eq('id', call.id)
        throw err
      }

      await db
        .from('whatsapp_calls')
        .update({ status: 'connected', answered_at: now })
        .eq('id', call.id)
        .eq('status', 'answering')
      return NextResponse.json({ ok: true })
    }

    if (action === 'reject') {
      if (call.status !== 'ringing') return NextResponse.json({ ok: true })
      await callAction(cfg, call.call_id, 'reject')
      await db
        .from('whatsapp_calls')
        .update({ status: 'rejected', ended_at: now, answered_by: ctx.userId })
        .eq('id', call.id)
        .eq('status', 'ringing')
      return NextResponse.json({ ok: true })
    }

    if (action === 'hangup') {
      if (FINISHED.includes(call.status)) return NextResponse.json({ ok: true })
      try {
        await callAction(cfg, call.call_id, 'terminate')
      } catch (err) {
        // Already gone on Meta's side — still close it here.
        console.warn('[calls] terminate failed:', err instanceof Error ? err.message : err)
      }
      // The terminate webhook fills in the duration; mark it ended now
      // so every browser closes the call straight away.
      await db
        .from('whatsapp_calls')
        .update({ status: call.status === 'connected' ? 'ended' : 'missed', ended_at: now })
        .eq('id', call.id)
        .not('status', 'in', `(${FINISHED.join(',')})`)
      return NextResponse.json({ ok: true })
    }

    return NextResponse.json({ error: 'Unknown action' }, { status: 400 })
  } catch (err) {
    return callingErrorResponse(err)
  }
}
