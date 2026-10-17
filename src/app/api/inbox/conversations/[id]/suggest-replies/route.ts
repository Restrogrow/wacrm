// ============================================================
// POST /api/inbox/conversations/[id]/suggest-replies
//
// → 200 { suggestions: string[] }   (3 short draft replies)
//
// Agents and above. Reads the last messages with the caller's RLS-scoped
// client (plus an explicit account filter). Nothing is stored and nothing
// is ever sent: the agent picks one and edits it in the composer.
// Counts against the account's daily AI quota.
// ============================================================

import { NextResponse } from 'next/server'

import { requireRole } from '@/lib/auth/account'
import { loadHistory } from '@/lib/ai/analyze-server'
import { consumeAiQuota } from '@/lib/ai/quota'
import { suggestReplies } from '@/lib/ai/reply-suggest'
import { aiErrorResponse } from '@/lib/ai/route-errors'
import { aiApiKey, AI_NOT_CONFIGURED } from '@/lib/ai/gemini'
import { checkRateLimit, RATE_LIMITS, rateLimitResponse } from '@/lib/rate-limit'

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

export async function POST(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const ctx = await requireRole('agent')
    const { id } = await params
    if (!UUID_RE.test(id)) return NextResponse.json({ error: 'Conversation not found' }, { status: 404 })

    if (!aiApiKey()) return NextResponse.json({ error: AI_NOT_CONFIGURED, code: 'ai_not_configured' }, { status: 503 })

    const limit = checkRateLimit(`aiSuggest:${ctx.userId}`, RATE_LIMITS.aiSuggest)
    if (!limit.success) return rateLimitResponse(limit)

    const { data: conversation } = await ctx.supabase
      .from('conversations')
      .select('id, contact:contacts(name)')
      .eq('id', id)
      .eq('account_id', ctx.accountId)
      .maybeSingle()
    if (!conversation) return NextResponse.json({ error: 'Conversation not found' }, { status: 404 })

    const quota = await consumeAiQuota(ctx.accountId, 'suggest')
    if (!quota.allowed) {
      return NextResponse.json({ error: quota.message, code: 'ai_quota' }, { status: 429 })
    }

    const lines = await loadHistory(ctx.supabase, id, 15)
    const contact = (Array.isArray(conversation.contact) ? conversation.contact[0] : conversation.contact) as
      | { name?: string | null }
      | null

    // Business facts the account already gave the AI chatbot (optional).
    const { data: kb } = await ctx.supabase
      .from('ai_chatbot_settings')
      .select('knowledge_base')
      .eq('account_id', ctx.accountId)
      .maybeSingle()
    const knowledge = typeof kb?.knowledge_base === 'string' ? kb.knowledge_base : undefined

    const suggestions = await suggestReplies(lines, contact?.name || '', knowledge)
    return NextResponse.json({ suggestions })
  } catch (err) {
    return aiErrorResponse(err, 'Reply suggestions')
  }
}
