import { NextResponse } from 'next/server'
import { checkRateLimit, rateLimitResponse, RATE_LIMITS } from '@/lib/rate-limit'
import { requireRole, toErrorResponse } from '@/lib/auth/account'
import {
  chatbotTimeZone,
  generateChatbotReply,
  normalizeChatbotSettings,
} from '@/lib/ai-chatbot/chatbot'
import type { ChatMessage } from '@/lib/ai/gemini'

/**
 * POST /api/ai-chatbot/test — { settings, messages } → the bot's reply.
 *
 * Uses the settings as currently typed in the panel (unsaved), so an
 * admin can tune the knowledge base before going live. Sends nothing.
 */
export async function POST(request: Request) {
  try {
    const ctx = await requireRole('admin')
    // Each call is a paid AI request — cap per user.
    const aiLimit = checkRateLimit(`ai:${ctx.userId}`, RATE_LIMITS.aiGenerate)
    if (!aiLimit.success) return rateLimitResponse(aiLimit)
    const body = (await request.json().catch(() => null)) as {
      settings?: Record<string, unknown>
      messages?: Array<{ role?: string; content?: string }>
    } | null
    const settings = normalizeChatbotSettings(body?.settings)
    if (!settings.knowledge_base.trim()) {
      return NextResponse.json(
        { error: 'Add some knowledge first — the bot only answers from it.' },
        { status: 400 },
      )
    }
    const history: ChatMessage[] = (body?.messages ?? [])
      .slice(-12)
      .filter((m) => typeof m.content === 'string' && m.content.trim())
      .map((m) => ({
        role: m.role === 'assistant' ? 'assistant' : 'user',
        content: String(m.content).slice(0, 1500),
      }))
    // Same context as live replies (current time in the business's time
    // zone), so "are you open now?" tests the real answer.
    const result = await generateChatbotReply(settings, history, {
      context: { timeZone: chatbotTimeZone() },
    })
    if (!result.ok) return NextResponse.json({ error: result.error }, { status: 502 })
    return NextResponse.json({
      reply: result.reply || settings.handoff_message,
      handoff: result.handoff,
    })
  } catch (err) {
    return toErrorResponse(err)
  }
}
