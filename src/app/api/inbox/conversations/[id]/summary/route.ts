// ============================================================
// POST /api/inbox/conversations/[id]/summary — "Summarise this chat".
//
// → 200 { summary: ConversationSummary, message_count }
//
// Reads the conversation and its latest messages with the caller's
// RLS-scoped client (and an explicit account filter), so a member can
// only summarise chats in their own business. Nothing is stored.
// ============================================================

import { NextResponse } from 'next/server'

import { getCurrentAccount, toErrorResponse } from '@/lib/auth/account'
import { InboxAiError, messageAsText, summarizeConversation, type TranscriptLine } from '@/lib/ai/inbox-ai'
import { AiRateLimitError } from '@/lib/ai/gemini'
import { checkRateLimit, RATE_LIMITS, rateLimitResponse } from '@/lib/rate-limit'

/** Latest messages included in a summary. */
const MAX_MESSAGES = 120

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

export async function POST(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const ctx = await getCurrentAccount()
    const { id } = await params
    if (!UUID_RE.test(id)) return NextResponse.json({ error: 'Conversation not found' }, { status: 404 })

    const limit = checkRateLimit(`aiSummary:${ctx.userId}`, RATE_LIMITS.aiSummary)
    if (!limit.success) return rateLimitResponse(limit)

    const { data: conversation } = await ctx.supabase
      .from('conversations')
      .select('id, contact:contacts(name, phone)')
      .eq('id', id)
      .eq('account_id', ctx.accountId)
      .maybeSingle()
    if (!conversation) return NextResponse.json({ error: 'Conversation not found' }, { status: 404 })

    const { data: rows, error } = await ctx.supabase
      .from('messages')
      .select('sender_type, content_type, content_text, template_name, created_at')
      .eq('conversation_id', id)
      .order('created_at', { ascending: false })
      .limit(MAX_MESSAGES)
    if (error) return NextResponse.json({ error: 'Could not load the messages' }, { status: 500 })

    const lines: TranscriptLine[] = (rows ?? [])
      .reverse()
      .map((m) => ({
        from: (m.sender_type === 'customer' || m.sender_type === 'bot' ? m.sender_type : 'agent') as TranscriptLine['from'],
        text: messageAsText(m),
        at: m.created_at as string,
      }))
      .filter((l) => l.text)

    const contact = (Array.isArray(conversation.contact) ? conversation.contact[0] : conversation.contact) as
      | { name?: string | null; phone?: string | null }
      | null
    const summary = await summarizeConversation(lines, contact?.name || '')
    return NextResponse.json({ summary, message_count: lines.length })
  } catch (err) {
    if (err instanceof InboxAiError) return NextResponse.json({ error: err.message }, { status: 422 })
    if (err instanceof AiRateLimitError) return NextResponse.json({ error: 'AI is busy. Try again in a minute.' }, { status: 429 })
    if (err instanceof Error && /AI request failed|AI returned|AI declined/.test(err.message)) {
      console.error('[summary] AI error:', err.message)
      return NextResponse.json({ error: 'Could not summarise this chat. Try again.' }, { status: 502 })
    }
    return toErrorResponse(err)
  }
}
