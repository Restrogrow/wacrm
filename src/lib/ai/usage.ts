// Record one Gemini call in `ai_usage_events` (migration 087) for
// /admin/ai-usage. Server only. Never throws and never blocks the reply:
// a missing table or a failed insert only logs a warning.

import { supabaseAdmin } from '@/lib/flows/admin-client'

export interface AiUsageRecord {
  accountId: string | null
  feature: string
  model: string
  input_tokens: number
  input_audio_tokens: number
  input_image_tokens: number
  output_tokens: number
  thinking_tokens: number
  latency_ms: number
}

let warned = false

export async function recordAiUsage(r: AiUsageRecord): Promise<void> {
  try {
    const { error } = await supabaseAdmin().from('ai_usage_events').insert({
      account_id: r.accountId,
      feature: r.feature.slice(0, 40),
      model: r.model.slice(0, 80),
      input_tokens: r.input_tokens,
      input_audio_tokens: r.input_audio_tokens,
      input_image_tokens: r.input_image_tokens,
      output_tokens: r.output_tokens,
      thinking_tokens: r.thinking_tokens,
      latency_ms: r.latency_ms,
    })
    if (error && !warned) {
      warned = true
      console.warn('[ai-usage] not recorded (migration 087 applied?):', error.message)
    }
  } catch (err) {
    if (!warned) {
      warned = true
      console.warn('[ai-usage] not recorded:', err instanceof Error ? err.message : err)
    }
  }
}
