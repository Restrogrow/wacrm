// ============================================================
// POST /api/inbox/translate — translate a message or a draft reply.
//
// Body: { text: string, target: TranslateLanguage }
// → 200 { translation, detected_language }
//
// Any signed-in member can translate what they can already read; the
// text comes from the caller, so nothing is looked up or stored.
// ============================================================

import { NextResponse } from 'next/server'

import { getCurrentAccount, toErrorResponse } from '@/lib/auth/account'
import { InboxAiError, translateText } from '@/lib/ai/inbox-ai'
import { isTranslateLanguage, MAX_TRANSLATE_CHARS } from '@/lib/ai/languages'
import { AiRateLimitError } from '@/lib/ai/gemini'
import { checkRateLimit, RATE_LIMITS, rateLimitResponse } from '@/lib/rate-limit'

export async function POST(request: Request) {
  try {
    const ctx = await getCurrentAccount()

    const limit = checkRateLimit(`aiTranslate:${ctx.userId}`, RATE_LIMITS.aiTranslate)
    if (!limit.success) return rateLimitResponse(limit)

    const body = (await request.json().catch(() => null)) as { text?: unknown; target?: unknown } | null
    const text = typeof body?.text === 'string' ? body.text : ''
    if (!text.trim()) return NextResponse.json({ error: 'Nothing to translate.' }, { status: 400 })
    if (text.length > MAX_TRANSLATE_CHARS) {
      return NextResponse.json({ error: `Text is too long to translate (max ${MAX_TRANSLATE_CHARS} characters).` }, { status: 400 })
    }
    if (!isTranslateLanguage(body?.target)) {
      return NextResponse.json({ error: 'Choose a language to translate into.' }, { status: 400 })
    }

    const result = await translateText(text, body.target)
    return NextResponse.json(result)
  } catch (err) {
    if (err instanceof InboxAiError) return NextResponse.json({ error: err.message }, { status: 422 })
    if (err instanceof AiRateLimitError) return NextResponse.json({ error: 'AI is busy. Try again in a minute.' }, { status: 429 })
    if (err instanceof Error && /AI request failed|AI returned|AI declined/.test(err.message)) {
      console.error('[translate] AI error:', err.message)
      return NextResponse.json({ error: 'Translation failed. Try again.' }, { status: 502 })
    }
    return toErrorResponse(err)
  }
}
