// Server side of lead scoring + the shared chat-history loader.
//
//  - loadHistory(): last N messages of a conversation as HistoryLine[].
//  - analyzeAndStore(): score one conversation and upsert conversation_ai.
//  - processAiAnalysis(): cron task. Scores a few recently active chats per
//    minute whose latest customer message is newer than the last score
//    (and at least DEBOUNCE_MS old, so a burst of messages is scored once).
//
// Everything is quota-limited per account per day and a no-op without a
// Gemini key, so it can never slow down or break the inbox.

import type { SupabaseClient } from '@supabase/supabase-js'

import { supabaseAdmin } from '@/lib/flows/admin-client'
import { aiApiKey } from './gemini'
import { messageAsText } from './inbox-ai'
import { analyzeLines, type LeadAnalysis } from './lead-score'
import { consumeAiQuota } from './quota'
import type { HistoryLine } from './reply-suggest'

export const DEBOUNCE_MS = 3 * 60_000
const LOOKBACK_MS = 48 * 3_600_000
const MAX_CANDIDATES = 150
const MAX_PER_RUN = 12

export async function loadHistory(db: SupabaseClient, conversationId: string, limit = 15): Promise<HistoryLine[]> {
  const { data, error } = await db
    .from('messages')
    .select('sender_type, content_type, content_text, template_name, created_at')
    .eq('conversation_id', conversationId)
    .order('created_at', { ascending: false })
    .limit(limit)
  if (error || !data) return []
  return data
    .reverse()
    .map((m) => ({
      from: (m.sender_type === 'customer' || m.sender_type === 'bot' ? m.sender_type : 'agent') as HistoryLine['from'],
      text: messageAsText(m),
      at: m.created_at as string,
    }))
    .filter((l) => l.text)
}

export type AnalyzeOutcome =
  | { ok: true; analysis: LeadAnalysis }
  | { ok: false; reason: 'quota' | 'no_messages'; message?: string }

/** Score one conversation and store the result. Throws on AI errors. */
export async function analyzeAndStore(input: {
  accountId: string
  conversationId: string
  lastMessageAt: string | null
}): Promise<AnalyzeOutcome> {
  const db = supabaseAdmin()
  const lines = await loadHistory(db, input.conversationId, 12)
  if (!lines.some((l) => l.from === 'customer')) return { ok: false, reason: 'no_messages' }

  const quota = await consumeAiQuota(input.accountId, 'analysis')
  if (!quota.allowed) return { ok: false, reason: 'quota', message: quota.message }

  const analysis = await analyzeLines(lines)
  const { error } = await db.from('conversation_ai').upsert(
    {
      conversation_id: input.conversationId,
      account_id: input.accountId,
      intent: analysis.intent,
      sentiment: analysis.sentiment,
      lead_score: analysis.lead_score,
      analyzed_message_at: input.lastMessageAt,
      analyzed_at: new Date().toISOString(),
    },
    { onConflict: 'conversation_id' },
  )
  if (error) throw new Error(`could not store AI score: ${error.message}`)
  return { ok: true, analysis }
}

interface Candidate {
  id: string
  account_id: string
  last_message_at: string | null
}

/** Is the stored score older than the conversation's latest message? */
export function isStale(lastMessageAt: string | null, analyzedMessageAt: string | null | undefined): boolean {
  if (!lastMessageAt) return false
  if (!analyzedMessageAt) return true
  return new Date(lastMessageAt).getTime() > new Date(analyzedMessageAt).getTime()
}

/** Returns how many chats were scored. Cron entry point. */
export async function processAiAnalysis(now = Date.now()): Promise<number> {
  if (!aiApiKey()) return 0
  const db = supabaseAdmin()

  const { data: recent, error } = await db
    .from('conversations')
    .select('id, account_id, last_message_at')
    .in('status', ['open', 'pending'])
    .gte('last_message_at', new Date(now - LOOKBACK_MS).toISOString())
    .lte('last_message_at', new Date(now - DEBOUNCE_MS).toISOString())
    .order('last_message_at', { ascending: false })
    .limit(MAX_CANDIDATES)
  // Table/column problems: nothing to do.
  if (error || !recent?.length) return 0

  const ids = recent.map((c) => c.id as string)
  const { data: existing, error: aiErr } = await db
    .from('conversation_ai')
    .select('conversation_id, analyzed_message_at')
    .in('conversation_id', ids)
  // Migration 074 not applied yet.
  if (aiErr) return 0
  const analyzedAt = new Map((existing ?? []).map((r) => [r.conversation_id as string, r.analyzed_message_at as string | null]))

  const stale = (recent as Candidate[]).filter((c) => c.account_id && isStale(c.last_message_at, analyzedAt.get(c.id)))
  const blockedAccounts = new Set<string>()
  let scored = 0

  for (const c of stale) {
    if (scored >= MAX_PER_RUN) break
    if (blockedAccounts.has(c.account_id)) continue
    try {
      const lines = await loadHistory(db, c.id, 3)
      const last = lines[lines.length - 1]
      // An agent already answered: keep the old score, just remember we looked.
      if (last && last.from !== 'customer' && analyzedAt.has(c.id)) {
        await db.from('conversation_ai').update({ analyzed_message_at: c.last_message_at }).eq('conversation_id', c.id)
        continue
      }
      const outcome = await analyzeAndStore({ accountId: c.account_id, conversationId: c.id, lastMessageAt: c.last_message_at })
      if (outcome.ok) scored += 1
      else if (outcome.reason === 'quota') blockedAccounts.add(c.account_id)
    } catch (err) {
      console.error('[ai-analysis] conversation failed:', err instanceof Error ? err.message : err)
      // A rate limit or outage affects everyone: stop this run.
      if (err instanceof Error && /rate limit|AI request failed/i.test(err.message)) break
    }
  }
  return scored
}
