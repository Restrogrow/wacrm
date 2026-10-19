// ============================================================
// POST /api/whatsapp/calls/[id]/ai-session — start the AI agent on a
// connected AI call (migration 080).
//
// → 200 { token, setup, max_seconds }
//
// `token` is a single-use Gemini Live token (open the session within a
// minute); `setup` is the first WebSocket message, with the prompt built
// from Settings → AI chatbot (knowledge base, name, rules) and the call
// script. Only the agent who placed the call, and only for a call
// started with { ai: true } that hasn't ended.
// ============================================================

import { NextResponse } from 'next/server'

import { supabaseAdmin } from '@/lib/flows/admin-client'
import { toErrorResponse } from '@/lib/auth/account'
import { checkRateLimit, RATE_LIMITS, rateLimitResponse } from '@/lib/rate-limit'
import { normalizeChatbotSettings } from '@/lib/ai-chatbot/chatbot'
import {
  AI_CALL_MAX_SECONDS,
  VoiceAgentError,
  buildLiveSetup,
  buildVoiceAgentPrompt,
  createLiveToken,
  liveModel,
} from '@/lib/ai/voice-agent'
import { requireCallingAgent } from '@/lib/whatsapp/calling-server'

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i
const FINISHED = ['ended', 'missed', 'rejected', 'failed']

export async function POST(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const ctx = await requireCallingAgent()
    const { id } = await params
    if (!UUID_RE.test(id)) return NextResponse.json({ error: 'Call not found' }, { status: 404 })

    const limit = checkRateLimit(`calls:ai:${ctx.userId}`, RATE_LIMITS.callStart)
    if (!limit.success) return rateLimitResponse(limit)

    const db = supabaseAdmin()
    const { data: call } = await db
      .from('whatsapp_calls')
      .select('id, status, started_by, ai_agent, customer_name, contact_id')
      .eq('id', id)
      .eq('account_id', ctx.accountId)
      .maybeSingle()
    if (!call) return NextResponse.json({ error: 'Call not found' }, { status: 404 })
    if (!call.ai_agent || call.started_by !== ctx.userId) {
      return NextResponse.json({ error: 'This call was not started as an AI call by you.' }, { status: 403 })
    }
    if (FINISHED.includes(call.status as string)) {
      return NextResponse.json({ error: 'The call has already ended.' }, { status: 409 })
    }

    const [{ data: settingsRow }, { data: account }] = await Promise.all([
      db.from('ai_chatbot_settings').select('*').eq('account_id', ctx.accountId).maybeSingle(),
      db.from('accounts').select('name').eq('id', ctx.accountId).maybeSingle(),
    ])
    const settings = normalizeChatbotSettings(settingsRow)

    const prompt = buildVoiceAgentPrompt({
      businessName: (account?.name as string | undefined) ?? '',
      botName: settings.bot_name,
      knowledgeBase: settings.knowledge_base,
      instructions: settings.instructions,
      voiceInstructions: settings.voice_instructions,
      customerName: (call.customer_name as string | null) ?? null,
      now: new Date(),
    })
    const token = await createLiveToken()

    return NextResponse.json({
      token,
      setup: buildLiveSetup(liveModel(), prompt, settings.voice_name),
      max_seconds: AI_CALL_MAX_SECONDS,
    })
  } catch (err) {
    if (err instanceof VoiceAgentError) return NextResponse.json({ error: err.message }, { status: err.status })
    return toErrorResponse(err)
  }
}
