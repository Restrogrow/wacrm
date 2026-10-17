// ============================================================
// POST /api/inbox/conversations/[id]/analyze — score this chat now.
//
// → 200 { analysis: { intent, sentiment, lead_score } }
//
// Agents and above. The cron job also scores active chats on its own;
// this is the on-demand refresh. Writes with the service role after
// checking the conversation belongs to the caller's account.
// ============================================================

import { NextResponse } from 'next/server'

import { requireRole } from '@/lib/auth/account'
import { analyzeAndStore } from '@/lib/ai/analyze-server'
import { aiApiKey, AI_NOT_CONFIGURED } from '@/lib/ai/gemini'
import { aiErrorResponse } from '@/lib/ai/route-errors'
import { checkRateLimit, RATE_LIMITS, rateLimitResponse } from '@/lib/rate-limit'

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

export async function POST(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const ctx = await requireRole('agent')
    const { id } = await params
    if (!UUID_RE.test(id)) return NextResponse.json({ error: 'Conversation not found' }, { status: 404 })

    if (!aiApiKey()) return NextResponse.json({ error: AI_NOT_CONFIGURED, code: 'ai_not_configured' }, { status: 503 })

    const limit = checkRateLimit(`aiAnalyze:${ctx.userId}`, RATE_LIMITS.aiAnalyze)
    if (!limit.success) return rateLimitResponse(limit)

    const { data: conversation } = await ctx.supabase
      .from('conversations')
      .select('id, last_message_at')
      .eq('id', id)
      .eq('account_id', ctx.accountId)
      .maybeSingle()
    if (!conversation) return NextResponse.json({ error: 'Conversation not found' }, { status: 404 })

    const outcome = await analyzeAndStore({
      accountId: ctx.accountId,
      conversationId: id,
      lastMessageAt: (conversation.last_message_at as string | null) ?? null,
    })
    if (!outcome.ok) {
      if (outcome.reason === 'quota') return NextResponse.json({ error: outcome.message, code: 'ai_quota' }, { status: 429 })
      return NextResponse.json({ error: 'No customer messages to score yet.' }, { status: 422 })
    }
    return NextResponse.json({ analysis: outcome.analysis })
  } catch (err) {
    return aiErrorResponse(err, 'Lead scoring')
  }
}
