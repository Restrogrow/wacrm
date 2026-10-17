// POST /api/csat/request { conversation_id }
//
// Called by the inbox right after an agent closes a chat. Sends the rating
// buttons if the account turned CSAT on, the chat is closed, the customer's
// 24-hour window is open and no survey went out for this chat yet. Always
// answers 200 with what happened, so closing a chat never looks like it failed.

import { NextResponse } from 'next/server'

import { requireRole, toErrorResponse } from '@/lib/auth/account'
import { requestCsat } from '@/lib/csat/server'
import { checkRateLimit, rateLimitResponse, RATE_LIMITS } from '@/lib/rate-limit'

export async function POST(request: Request) {
  try {
    const ctx = await requireRole('agent')
    const limit = checkRateLimit(`send:${ctx.userId}`, RATE_LIMITS.send)
    if (!limit.success) return rateLimitResponse(limit)

    const body = ((await request.json().catch(() => null)) ?? {}) as Record<string, unknown>
    if (typeof body.conversation_id !== 'string') {
      return NextResponse.json({ error: 'conversation_id is required' }, { status: 400 })
    }
    const result = await requestCsat({
      accountId: ctx.accountId,
      conversationId: body.conversation_id,
      userId: ctx.userId,
    })
    return NextResponse.json(result)
  } catch (err) {
    return toErrorResponse(err)
  }
}
