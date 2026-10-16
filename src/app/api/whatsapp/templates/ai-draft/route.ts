import { NextResponse } from 'next/server'
import { getCurrentAccount, toErrorResponse } from '@/lib/auth/account'
import { draftTemplateWithAi, type DraftAnswer } from '@/lib/ai/template-draft'
import { checkRateLimit, rateLimitResponse, RATE_LIMITS } from '@/lib/rate-limit'
import { roleGuard } from '@/lib/auth/account'

/**
 * POST /api/whatsapp/templates/ai-draft — "Create template with AI".
 *
 * Body: { message: string, answers?: { question, answer }[] }
 * → 200 { status: "needs_info", questions: string[] }
 * → 200 { status: "ready", draft: TemplatePayload, summary }
 * → 422 { error } when the AI can't produce a valid template
 *
 * Nothing is saved or sent to Meta here; the dashboard shows the draft
 * and submits it through the normal /api/whatsapp/templates/submit.
 */
export async function POST(request: Request) {
  const denied = await roleGuard('admin');
  if (denied) return denied;

  try {
    const ctx = await getCurrentAccount()

    const limit = checkRateLimit(`aiTemplateDraft:${ctx.userId}`, RATE_LIMITS.aiTemplateDraft)
    if (!limit.success) return rateLimitResponse(limit)

    const body = (await request.json().catch(() => null)) as {
      message?: unknown
      answers?: unknown
    } | null
    const message = typeof body?.message === 'string' ? body.message : ''
    const answers: DraftAnswer[] = Array.isArray(body?.answers)
      ? (body.answers as unknown[])
          .map((a) => a as Record<string, unknown>)
          .filter((a) => typeof a?.question === 'string' && typeof a?.answer === 'string')
          .slice(0, 10)
          .map((a) => ({
            question: (a.question as string).slice(0, 500),
            answer: (a.answer as string).slice(0, 1000),
          }))
      : []

    // Names already used on this account, so the AI picks a fresh one.
    const { data: existing } = await ctx.supabase
      .from('message_templates')
      .select('name')
      .eq('account_id', ctx.accountId)
    const existingNames = [...new Set((existing ?? []).map((r) => r.name as string))]

    const result = await draftTemplateWithAi({ message, answers, existingNames })
    if (!result.ok) {
      return NextResponse.json({ error: result.error }, { status: 422 })
    }
    return NextResponse.json(result)
  } catch (err) {
    return toErrorResponse(err)
  }
}
