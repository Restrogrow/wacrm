import { NextResponse } from 'next/server'
import { getCurrentAccount, requireRole, toErrorResponse } from '@/lib/auth/account'
import {
  DEFAULT_CHATBOT_SETTINGS,
  normalizeChatbotSettings,
} from '@/lib/ai-chatbot/chatbot'

/**
 * GET /api/ai-chatbot — the account's chatbot settings (any member).
 * PUT /api/ai-chatbot — save them (admin+).
 *
 * 503 { code: 'missing_table' } when migration 034 hasn't been run, so
 * the settings panel can tell the admin what to do.
 */

// PostgREST "relation does not exist" / schema-cache miss.
function isMissingTable(err: { code?: string; message?: string } | null): boolean {
  return !!err && (err.code === '42P01' || err.code === 'PGRST205' || /ai_chatbot_settings/.test(err.message ?? ''))
}

const MISSING = NextResponse.json(
  {
    error: 'The AI chatbot table is not set up yet. Run supabase/migrations/034_ai_chatbot.sql in the Supabase SQL editor.',
    code: 'missing_table',
  },
  { status: 503 },
)

export async function GET() {
  try {
    const { supabase, accountId } = await getCurrentAccount()
    const { data, error } = await supabase
      .from('ai_chatbot_settings')
      .select('*')
      .eq('account_id', accountId)
      .maybeSingle()
    if (isMissingTable(error)) return MISSING
    if (error) return NextResponse.json({ error: error.message }, { status: 500 })
    return NextResponse.json({
      settings: data ? normalizeChatbotSettings(data) : DEFAULT_CHATBOT_SETTINGS,
      ai_configured: !!(process.env.API_GROQ ?? process.env.GROQ_API_KEY),
    })
  } catch (err) {
    return toErrorResponse(err)
  }
}

export async function PUT(request: Request) {
  try {
    const { supabase, accountId, userId } = await requireRole('admin')
    const body = (await request.json().catch(() => null)) as Record<string, unknown> | null
    if (!body) return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 })
    const settings = normalizeChatbotSettings(body)
    if (settings.enabled && !settings.knowledge_base.trim()) {
      return NextResponse.json(
        { error: 'Add some knowledge (menu, timings, FAQs…) before turning the bot on.' },
        { status: 400 },
      )
    }
    const { data, error } = await supabase
      .from('ai_chatbot_settings')
      .upsert(
        {
          account_id: accountId,
          ...settings,
          updated_at: new Date().toISOString(),
          updated_by: userId,
        },
        { onConflict: 'account_id' },
      )
      .select()
      .single()
    if (isMissingTable(error)) return MISSING
    if (error) return NextResponse.json({ error: error.message }, { status: 500 })
    return NextResponse.json({ settings: normalizeChatbotSettings(data) })
  } catch (err) {
    return toErrorResponse(err)
  }
}
