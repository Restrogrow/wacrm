// ============================================================
// Data for /admin/ai-usage: Gemini calls, tokens and cost over the last
// N days, from `ai_usage_events` (migration 087, one row per call),
// `ai_usage_daily` (migration 074, per-account daily counters, older
// history) and AI voice calls (`whatsapp_calls.ai_agent`). Server only,
// platform admins only (the /admin layout checks).
// ============================================================

import { supabaseAdmin } from '@/lib/flows/admin-client'
import { aiModel } from '@/lib/ai/gemini'
import {
  LIVE_PRICE_PER_MINUTE,
  TYPICAL_CHATBOT_TOKENS,
  callCostUsd,
  modelPrice,
} from '@/lib/ai/pricing'

const MAX_EVENTS = 50_000

export interface UsageBucket {
  key: string
  label: string
  calls: number
  inputTokens: number
  outputTokens: number
  thinkingTokens: number
  usd: number
  avgLatencyMs: number | null
}

export interface AiUsageReport {
  days: number
  tableMissing: boolean
  truncated: boolean
  currentModel: string
  currentModelKnownPrice: boolean
  price: { input: number; audioInput: number; output: number }
  totals: UsageBucket
  byFeature: UsageBucket[]
  byModel: UsageBucket[]
  byAccount: UsageBucket[]
  /** Average USD per chatbot reply: measured, or a typical-prompt estimate. */
  chatbotUsdPerReply: number
  chatbotMeasured: boolean
  chatbotAvg: { input: number; output: number; thinking: number } | null
  /** From ai_usage_daily: uses per feature (includes days before 087). */
  dailyCounts: { feature: string; used: number }[]
  voiceCalls: { calls: number; minutes: number; usd: number }
}

export const FEATURE_LABELS: Record<string, string> = {
  chatbot: 'Chatbot replies',
  voice_note: 'Voice-note transcripts',
  suggest: 'Reply suggestions',
  summary: 'Chat summaries',
  translate: 'Translations',
  lead_score: 'Lead scoring',
  analysis: 'Lead scoring',
  call_notes: 'Call notes',
  app_assistant: 'App assistant',
  template_draft: 'Template drafts',
  flow_generate: 'Flow generator',
  voice_call: 'AI voice calls',
}

type EventRow = {
  account_id: string | null
  feature: string
  model: string
  input_tokens: number
  input_audio_tokens: number
  output_tokens: number
  thinking_tokens: number
  latency_ms: number | null
  created_at: string
}

function emptyBucket(key: string, label: string): UsageBucket & { _lat: number; _latN: number } {
  return { key, label, calls: 0, inputTokens: 0, outputTokens: 0, thinkingTokens: 0, usd: 0, avgLatencyMs: null, _lat: 0, _latN: 0 }
}

function finish(b: ReturnType<typeof emptyBucket>): UsageBucket {
  const { _lat, _latN, ...rest } = b
  return { ...rest, avgLatencyMs: _latN ? Math.round(_lat / _latN) : null }
}

export async function loadAiUsage(days = 30): Promise<AiUsageReport> {
  const db = supabaseAdmin()
  const since = new Date(Date.now() - days * 86_400_000)
  const sinceIso = since.toISOString()
  const sinceDay = sinceIso.slice(0, 10)

  const [events, daily, calls] = await Promise.all([
    db
      .from('ai_usage_events')
      .select('account_id, feature, model, input_tokens, input_audio_tokens, output_tokens, thinking_tokens, latency_ms, created_at')
      .gte('created_at', sinceIso)
      .order('created_at', { ascending: false })
      .limit(MAX_EVENTS),
    db.from('ai_usage_daily').select('feature, used').gte('day', sinceDay),
    db.from('whatsapp_calls').select('duration_seconds').eq('ai_agent', true).gte('created_at', sinceIso),
  ])

  const rows = (events.data ?? []) as EventRow[]
  const totals = emptyBucket('all', 'All AI')
  const byFeature = new Map<string, ReturnType<typeof emptyBucket>>()
  const byModel = new Map<string, ReturnType<typeof emptyBucket>>()
  const byAccount = new Map<string, ReturnType<typeof emptyBucket>>()
  const bump = (map: Map<string, ReturnType<typeof emptyBucket>>, key: string, label: string, r: EventRow, usd: number) => {
    const b = map.get(key) ?? emptyBucket(key, label)
    add(b, r, usd)
    map.set(key, b)
  }
  const add = (b: ReturnType<typeof emptyBucket>, r: EventRow, usd: number) => {
    b.calls += 1
    b.inputTokens += r.input_tokens
    b.outputTokens += r.output_tokens
    b.thinkingTokens += r.thinking_tokens
    b.usd += usd
    if (r.latency_ms !== null) {
      b._lat += r.latency_ms
      b._latN += 1
    }
  }

  let chat = { n: 0, usd: 0, input: 0, output: 0, thinking: 0 }
  for (const r of rows) {
    const usd = callCostUsd(r.model, r, new Date(r.created_at))
    add(totals, r, usd)
    bump(byFeature, r.feature, FEATURE_LABELS[r.feature] ?? r.feature, r, usd)
    bump(byModel, r.model, r.model, r, usd)
    if (r.account_id) bump(byAccount, r.account_id, r.account_id, r, usd)
    if (r.feature === 'chatbot') {
      chat = {
        n: chat.n + 1,
        usd: chat.usd + usd,
        input: chat.input + r.input_tokens,
        output: chat.output + r.output_tokens,
        thinking: chat.thinking + r.thinking_tokens,
      }
    }
  }

  // Account names for the top spenders.
  const topAccounts = [...byAccount.values()].sort((a, b) => b.usd - a.usd).slice(0, 25)
  if (topAccounts.length) {
    const { data: names } = await db.from('accounts').select('id, name').in('id', topAccounts.map((a) => a.key))
    const byId = new Map((names ?? []).map((n) => [n.id as string, n.name as string]))
    for (const a of topAccounts) a.label = byId.get(a.key) ?? a.key
  }

  const dailyTotals = new Map<string, number>()
  for (const d of (daily.data ?? []) as { feature: string; used: number }[]) {
    dailyTotals.set(d.feature, (dailyTotals.get(d.feature) ?? 0) + d.used)
  }

  const seconds = ((calls.data ?? []) as { duration_seconds: number | null }[]).reduce((n, c) => n + (c.duration_seconds ?? 0), 0)
  const minutes = seconds / 60

  const model = aiModel()
  const price = modelPrice(model)
  const sortUsd = (m: Map<string, ReturnType<typeof emptyBucket>>) => [...m.values()].sort((a, b) => b.usd - a.usd).map(finish)

  return {
    days,
    tableMissing: Boolean(events.error),
    truncated: rows.length >= MAX_EVENTS,
    currentModel: model,
    currentModelKnownPrice: price.known,
    price: { input: price.input, audioInput: price.audioInput, output: price.output },
    totals: finish(totals),
    byFeature: sortUsd(byFeature),
    byModel: sortUsd(byModel),
    byAccount: topAccounts.map(finish),
    chatbotUsdPerReply: chat.n ? chat.usd / chat.n : callCostUsd(model, TYPICAL_CHATBOT_TOKENS),
    chatbotMeasured: chat.n > 0,
    chatbotAvg: chat.n
      ? { input: Math.round(chat.input / chat.n), output: Math.round(chat.output / chat.n), thinking: Math.round(chat.thinking / chat.n) }
      : null,
    dailyCounts: [...dailyTotals.entries()].map(([feature, used]) => ({ feature, used })).sort((a, b) => b.used - a.used),
    // Both sides talk during a call; bill the whole call as audio in + out.
    voiceCalls: {
      calls: (calls.data ?? []).length,
      minutes,
      usd: minutes * (LIVE_PRICE_PER_MINUTE.audioIn + LIVE_PRICE_PER_MINUTE.audioOut),
    },
  }
}
