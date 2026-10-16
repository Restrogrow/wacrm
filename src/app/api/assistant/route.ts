import { NextResponse } from 'next/server'
import { checkRateLimit, rateLimitResponse, RATE_LIMITS } from '@/lib/rate-limit'
import { requireRole, toErrorResponse } from '@/lib/auth/account'
import { generateAssistantReply, type AssistantTurn } from '@/lib/ai/app-assistant'

/**
 * POST /api/assistant — { messages } → { reply }
 *
 * The in-app help bubble. Any signed-in member may ask. It only knows the
 * product map (lib/ai/app-assistant.ts); it never reads account data.
 */
export async function POST(request: Request) {
  try {
    const ctx = await requireRole('viewer')
    // Each call is a paid AI request — cap per user.
    const aiLimit = checkRateLimit(`assistant:${ctx.userId}`, RATE_LIMITS.aiGenerate)
    if (!aiLimit.success) return rateLimitResponse(aiLimit)

    const body = (await request.json().catch(() => null)) as {
      messages?: Array<{ role?: string; content?: string }>
    } | null

    const history: AssistantTurn[] = (body?.messages ?? [])
      .slice(-10)
      .filter((m) => typeof m.content === 'string' && m.content.trim())
      .map((m) => ({
        role: m.role === 'assistant' ? ('assistant' as const) : ('user' as const),
        content: String(m.content).slice(0, 1000),
      }))

    const result = await generateAssistantReply(history)
    if (!result.ok) return NextResponse.json({ error: result.error }, { status: 502 })
    return NextResponse.json({ reply: result.reply })
  } catch (err) {
    return toErrorResponse(err)
  }
}
