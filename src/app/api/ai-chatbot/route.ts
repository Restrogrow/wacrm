import { NextResponse } from 'next/server'
import { getCurrentAccount, requireRole, toErrorResponse } from '@/lib/auth/account'
import { aiApiKey } from '@/lib/ai/gemini'
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
    if (error) return NextResponse.json({ error: (console.error('[api] database error:', error.message), 'Something went wrong. Please try again.') }, { status: 500 })
    return NextResponse.json({
      settings: data ? normalizeChatbotSettings(data) : DEFAULT_CHATBOT_SETTINGS,
      ai_configured: !!aiApiKey(),
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
    const upsert = (row: Record<string, unknown>) =>
      supabase
        .from('ai_chatbot_settings')
        .upsert(
          { account_id: accountId, ...row, updated_at: new Date().toISOString(), updated_by: userId },
          { onConflict: 'account_id' },
        )
        .select()
        .single()
    let { data, error } = await upsert({ ...settings })
    // Migrations 080 / 081 not run yet: save the chatbot without the
    // voice-call fields rather than failing the whole form.
    if (error && /voice_/.test(error.message ?? '')) {
      if (
        settings.voice_instructions ||
        settings.voice_name ||
        settings.voice_inbound_enabled ||
        settings.voice_inbound_instructions
      ) {
        return NextResponse.json(
          {
            error:
              'AI calls are not set up yet. Run supabase/migrations/080_ai_voice_calls.sql and 081_ai_inbound_calls.sql in the Supabase SQL editor.',
            code: 'missing_voice_columns',
          },
          { status: 503 },
        )
      }
      const {
        voice_instructions: _vi,
        voice_name: _vn,
        voice_inbound_enabled: _ve,
        voice_inbound_delay_seconds: _vd,
        voice_inbound_instructions: _vii,
        ...chatbotOnly
      } = settings
      ;({ data, error } = await upsert(chatbotOnly))
    }
    if (isMissingTable(error)) return MISSING
    if (error) return NextResponse.json({ error: (console.error('[api] database error:', error.message), 'Something went wrong. Please try again.') }, { status: 500 })
    return NextResponse.json({ settings: normalizeChatbotSettings(data) })
  } catch (err) {
    return toErrorResponse(err)
  }
}
