// Per-account daily AI quota, so one account cannot run up the Gemini bill.
// Caps depend on the plan; the counter lives in `ai_usage_daily` and is
// bumped atomically by the `ai_usage_bump` SQL function (migration 074).
// If that migration is not applied yet the check fails OPEN (the per-user
// rate limits still apply), so a missing migration never breaks the inbox.

import { supabaseAdmin } from '@/lib/flows/admin-client'
import { loadEffectivePlan } from '@/lib/billing/server'
import type { EffectivePlan } from '@/lib/billing/plans'
import { outOfCreditsMessage } from '@/lib/credits/credits'
import { spendCredits } from '@/lib/credits/server'

export type AiFeature = 'suggest' | 'analysis' | 'summary' | 'voice_call' | 'chatbot'

export const AI_DAILY_CAPS: Record<EffectivePlan, Record<AiFeature, number>> = {
  // voice_call: AI-agent WhatsApp calls (up to 10 minutes of Gemini Live each).
  // chatbot: automatic AI replies to customers. Customers trigger these, not
  // the team, so the cap stops a flood of messages from many numbers
  // running up the bill; each conversation is also capped per hour.
  trial: { suggest: 40, analysis: 40, summary: 20, voice_call: 5, chatbot: 200 },
  starter: { suggest: 100, analysis: 100, summary: 50, voice_call: 20, chatbot: 1000 },
  growth: { suggest: 500, analysis: 500, summary: 200, voice_call: 100, chatbot: 5000 },
  pro: { suggest: 1500, analysis: 1500, summary: 500, voice_call: 300, chatbot: 15000 },
  enterprise: { suggest: 5000, analysis: 5000, summary: 2000, voice_call: 1000, chatbot: 50000 },
  expired: { suggest: 0, analysis: 0, summary: 0, voice_call: 0, chatbot: 0 },
}

const FEATURE_LABEL: Record<AiFeature, string> = {
  suggest: 'reply suggestions',
  analysis: 'lead scoring',
  summary: 'chat summaries',
  voice_call: 'calls',
  chatbot: 'chatbot replies',
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
  /** Which limit stopped it, for callers that treat the two differently. */
  reason?: 'daily_cap' | 'plan_ended' | 'out_of_credits'
  /** Credits left afterwards. Undefined when migration 100 is not applied. */
  balance?: number
}

let warnedMissing = false

/**
 * Spend one unit of AI for this account, against BOTH limits.
 *
 * Two independent things have to allow it: the per-plan daily cap
 * (migration 074), which stops one account flooding us in a day, and
 * the credit balance (migration 100), which is what actually runs out
 * and can be topped up.
 *
 * The cap is charged first on purpose. If the order were reversed and
 * the cap then refused, the account would have paid a credit for an
 * action that never ran; this way it loses one unit of a counter that
 * resets at midnight instead. Losing a credit costs the customer
 * money, losing a daily unit costs them nothing.
 */
export async function consumeAiQuota(
  accountId: string,
  feature: AiFeature,
  /**
   * Makes a retry of the same work free. Pass one wherever the caller
   * can run twice for one piece of work — a webhook retry, a re-run
   * cron, a double-clicked button. Omit it and every call charges.
   */
  idempotencyKey?: string
): Promise<QuotaResult> {
  const plan = await loadEffectivePlan(accountId).catch(() => null)
  const cap = aiDailyCap(plan, feature)
  if (cap <= 0) {
    return {
      allowed: false,
      cap,
      plan,
      message: quotaMessage(feature, plan, cap),
      reason: plan === 'expired' ? 'plan_ended' : 'daily_cap',
    }
  }

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
  if (data === false) {
    return {
      allowed: false,
      cap,
      plan,
      message: quotaMessage(feature, plan, cap),
      reason: 'daily_cap',
    }
  }

  const spend = await spendCredits(accountId, feature, idempotencyKey)
  if (!spend.ok) {
    return {
      allowed: false,
      cap,
      plan,
      message: outOfCreditsMessage(feature),
      reason: 'out_of_credits',
      balance: spend.balance,
    }
  }
  return { allowed: true, cap, plan, balance: spend.balance }
}
