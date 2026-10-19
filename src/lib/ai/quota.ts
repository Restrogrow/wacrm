// Per-account daily AI quota, so one account cannot run up the Gemini bill.
// Caps depend on the plan; the counter lives in `ai_usage_daily` and is
// bumped atomically by the `ai_usage_bump` SQL function (migration 074).
// If that migration is not applied yet the check fails OPEN (the per-user
// rate limits still apply), so a missing migration never breaks the inbox.

import { supabaseAdmin } from '@/lib/flows/admin-client'
import { loadEffectivePlan } from '@/lib/billing/server'
import type { EffectivePlan } from '@/lib/billing/plans'

export type AiFeature = 'suggest' | 'analysis' | 'summary' | 'voice_call'

export const AI_DAILY_CAPS: Record<EffectivePlan, Record<AiFeature, number>> = {
  // voice_call: AI-agent WhatsApp calls (up to 10 minutes of Gemini Live each).
  trial: { suggest: 40, analysis: 40, summary: 20, voice_call: 5 },
  starter: { suggest: 100, analysis: 100, summary: 50, voice_call: 20 },
  growth: { suggest: 500, analysis: 500, summary: 200, voice_call: 100 },
  pro: { suggest: 1500, analysis: 1500, summary: 500, voice_call: 300 },
  enterprise: { suggest: 5000, analysis: 5000, summary: 2000, voice_call: 1000 },
  expired: { suggest: 0, analysis: 0, summary: 0, voice_call: 0 },
}

const FEATURE_LABEL: Record<AiFeature, string> = {
  suggest: 'reply suggestions',
  analysis: 'lead scoring',
  summary: 'chat summaries',
  voice_call: 'calls',
}

export function aiDailyCap(plan: EffectivePlan | null, feature: AiFeature): number {
  // Unknown plan (billing columns missing): treat like the smallest paid plan.
  return AI_DAILY_CAPS[plan ?? 'starter'][feature]
}

export function quotaMessage(feature: AiFeature, plan: EffectivePlan | null, cap: number): string {
  if (plan === 'expired') {
    return 'Your trial or plan has ended, so AI features are paused. Renew to use them again.'
  }
  return `You have used today's limit of ${cap} AI ${FEATURE_LABEL[feature]} for this account. It resets at midnight IST.`
}

export interface QuotaResult {
  allowed: boolean
  cap: number
  plan: EffectivePlan | null
  message?: string
}

let warnedMissing = false

export async function consumeAiQuota(accountId: string, feature: AiFeature): Promise<QuotaResult> {
  const plan = await loadEffectivePlan(accountId).catch(() => null)
  const cap = aiDailyCap(plan, feature)
  if (cap <= 0) return { allowed: false, cap, plan, message: quotaMessage(feature, plan, cap) }

  const { data, error } = await supabaseAdmin().rpc('ai_usage_bump', {
    p_account_id: accountId,
    p_feature: feature,
    p_cap: cap,
  })
  if (error) {
    if (!warnedMissing) {
      warnedMissing = true
      console.warn('[ai-quota] ai_usage_bump unavailable (migration 074 not applied?), allowing:', error.message)
    }
    return { allowed: true, cap, plan }
  }
  if (data === false) return { allowed: false, cap, plan, message: quotaMessage(feature, plan, cap) }
  return { allowed: true, cap, plan }
}
