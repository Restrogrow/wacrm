import { NextResponse } from 'next/server'

import { requireRole, toErrorResponse } from '@/lib/auth/account'
import { supabaseAdmin } from '@/lib/flows/admin-client'
import { checkRateLimit, rateLimitResponse, RATE_LIMITS } from '@/lib/rate-limit'
import { markConversationRead } from '@/lib/whatsapp/read-receipts'

// POST { conversation_id, typing? }
//
// Blue ticks for the customer: the inbox calls this when an agent opens
// a chat with unread messages, and (typing: true, at most every ~20 s)
// while the agent types a reply so the customer sees "typing…".
export async function POST(request: Request) {
  try {
    const { userId, accountId, supabase } = await requireRole('agent')

    const limit = checkRateLimit(`read:${userId}`, RATE_LIMITS.send)
    if (!limit.success) return rateLimitResponse(limit)

    const body = await request.json().catch(() => ({}))
    const conversationId = typeof body?.conversation_id === 'string' ? body.conversation_id : ''
    if (!conversationId) {
      return NextResponse.json({ error: 'conversation_id is required' }, { status: 400 })
    }

    // RLS check: the caller must be able to see this conversation.
    const { data: conv } = await supabase
      .from('conversations')
      .select('id')
      .eq('id', conversationId)
      .eq('account_id', accountId)
      .maybeSingle()
    if (!conv) return NextResponse.json({ error: 'Conversation not found' }, { status: 404 })

    // Service role only to read the encrypted token.
    const ok = await markConversationRead(supabaseAdmin(), accountId, conversationId, {
      typing: body?.typing === true,
    })
    return NextResponse.json({ ok })
  } catch (err) {
    return toErrorResponse(err)
  }
}
