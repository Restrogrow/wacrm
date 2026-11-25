// AI quota, so one account cannot run up the Gemini bill.
//
// Two independent clocks:
//   - 'suggest' / 'analysis' / 'summary' ("AI assistant" — reply
//     suggestions, lead scoring, summaries) stay on the original DAILY
//     cap (migration 074, ai_usage_daily / ai_usage_bump). The November
//     2026 pricing sheet doesn't mention these as a plan differentiator
//     at all — they're an internal cost guardrail, not something sold.
//   - 'chatbot' (AI-generated chatbot replies) and 'voice_call' (AI
//     voice-agent minutes) are the sheet's two actual plan limits —
//     "AI replies and voice minutes reset every billing month" — and
//     run on the MONTHLY table (migration 103, ai_usage_monthly).
//
// If a migration is not applied yet the checks fail OPEN (existing
// per-user rate limits still apply), so a missing migration never
// breaks the inbox.

import { supabaseAdmin } from '@/lib/flows/admin-client'
import { loadEffectivePlan } from '@/lib/billing/server'
import {
  AI_MONTHLY_LIMITS,
  EFFECTIVE_PLAN_LABELS,
  planMeetsTier,
  type EffectivePlan,
  type PaidPlan,
} from '@/lib/billing/plans'
import { outOfCreditsMessage } from '@/lib/credits/credits'
import { spendCredits } from '@/lib/credits/server'

export type AiFeature = 'suggest' | 'analysis' | 'summary' | 'voice_call' | 'chatbot'

/**
 * Features gated to a plan tier regardless of volume — "Pro adds the
 * AI voice agent" is a real on/off switch. 'chatbot' has no entry: the
 * sheet gives every plan AI chatbot replies, just at a smaller monthly
 * number for Starter (see AI_MONTHLY_LIMITS) — it's a volume cap, not
 * an on/off feature, unlike before this changed.
 */
const FEATURE_MIN_PLAN: Partial<Record<AiFeature, PaidPlan>> = {
  voice_call: 'pro',
}

/** Daily caps — unchanged, 'suggest' / 'analysis' / 'summary' only. */
export const AI_DAILY_CAPS: Record<EffectivePlan, Record<'suggest' | 'analysis' | 'summary', number>> = {
  trial: { suggest: 40, analysis: 40, summary: 20 },
  starter: { suggest: 100, analysis: 100, summary: 50 },
  growth: { suggest: 500, analysis: 500, summary: 200 },
  pro: { suggest: 1500, analysis: 1500, summary: 500 },
  enterprise: { suggest: 5000, analysis: 5000, summary: 2000 },
  expired: { suggest: 0, analysis: 0, summary: 0 },
}

const FEATURE_LABEL: Record<AiFeature, string> = {
  suggest: 'reply suggestions',
  analysis: 'lead scoring',
  summary: 'chat summaries',
  voice_call: 'call minutes',
  chatbot: 'chatbot replies',
}

export function aiDailyCap(plan: EffectivePlan | null, feature: 'suggest' | 'analysis' | 'summary'): number {
  // Unknown plan (billing columns missing): treat like the smallest paid plan.
  return AI_DAILY_CAPS[plan ?? 'starter'][feature]
}

/** This feature's monthly cap for `plan` (minutes for voice_call, replies for chatbot). null = unlimited (Enterprise). */
export function aiMonthlyCap(plan: EffectivePlan | null, feature: 'chatbot' | 'voice_call'): number | null {
  const limits = AI_MONTHLY_LIMITS[plan ?? 'starter']
  return feature === 'chatbot' ? limits.chatbot_replies : limits.voice_minutes
}

export function quotaMessage(feature: AiFeature, plan: EffectivePlan | null, cap: number): string {
  if (plan === 'expired') {
    return 'Your trial or plan has ended, so AI features are paused. Renew to use them again.'
  }
  const period = feature === 'chatbot' || feature === 'voice_call' ? 'this month' : "today's"
  const resetsWhen = feature === 'chatbot' || feature === 'voice_call' ? 'next calendar month' : 'midnight IST'
  return `You have used ${period} limit of ${cap} AI ${FEATURE_LABEL[feature]} for this account. It resets at the ${resetsWhen}.`
}

const FEATURE_NAME: Partial<Record<AiFeature, string>> = {
  voice_call: 'The AI voice agent',
}

export function tierMessage(feature: AiFeature, minPlan: PaidPlan): string {
  return `${FEATURE_NAME[feature] ?? 'This feature'} is included from the ${EFFECTIVE_PLAN_LABELS[minPlan]} plan — upgrade in Settings → Plan & billing to turn it on.`
}

export interface QuotaResult {
  allowed: boolean
  cap: number
  plan: EffectivePlan | null
  message?: string
  /** Which limit stopped it, for callers that treat the two differently. */
  reason?: 'daily_cap' | 'monthly_cap' | 'plan_ended' | 'out_of_credits' | 'plan_tier'
  /** Credits left afterwards. Undefined when migration 100 is not applied. */
  balance?: number
}

let warnedMissingDaily = false
let warnedMissingMonthly = false

/**
 * Spend one unit of AI for this account, against BOTH limits.
 *
 * Two independent things have to allow it: the plan's cap (daily for
 * suggest/analysis/summary, monthly for chatbot/voice_call), which
 * stops one account flooding us in a period, and the credit balance
 * (migration 100), which is what actually runs out and can be topped
 * up.
 *
 * The cap is charged first on purpose. If the order were reversed and
 * the cap then refused, the account would have paid a credit for an
 * action that never ran; this way it loses one unit of a counter that
 * resets on its own instead. Losing a credit costs the customer
 * money, losing a period unit costs them nothing.
 *
 * voice_call is the one exception: its monthly cap is in real call
 * MINUTES, known only once the call ends, so this only PEEKS at the
 * month's minutes used so far (no increment) — the actual minutes are
 * recorded by recordVoiceMinutes() when the call terminates. Credits
 * are still spent per call attempt here, unchanged.
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

  // Expired first: an account whose plan lapsed should be told to
  // renew, not to "upgrade" to a tier it may already have paid for.
  if (plan === 'expired') {
    return {
      allowed: false,
      cap: 0,
      plan,
      message: quotaMessage(feature, plan, 0),
      reason: 'plan_ended',
    }
  }

  const minPlan = FEATURE_MIN_PLAN[feature]
  if (minPlan && !planMeetsTier(plan, minPlan)) {
    return {
      allowed: false,
      cap: 0,
      plan,
      message: tierMessage(feature, minPlan),
      reason: 'plan_tier',
    }
  }

  if (feature === 'chatbot' || feature === 'voice_call') {
    const cap = aiMonthlyCap(plan, feature)
    if (cap !== null) {
      if (cap <= 0) {
        return { allowed: false, cap, plan, message: quotaMessage(feature, plan, cap), reason: 'monthly_cap' }
      }
      if (feature === 'voice_call') {
        const { data, error } = await supabaseAdmin()
          .from('ai_usage_monthly')
          .select('used')
          .eq('account_id', accountId)
          .eq('feature', 'voice_call')
          .eq('month', monthStartIso())
          .maybeSingle()
        if (error) {
          if (!warnedMissingMonthly) {
            warnedMissingMonthly = true
            console.warn('[ai-quota] ai_usage_monthly unavailable (migration 103 not applied?), allowing:', error.message)
          }
        } else if ((data?.used ?? 0) >= cap) {
          return { allowed: false, cap, plan, message: quotaMessage(feature, plan, cap), reason: 'monthly_cap' }
        }
      } else {
        const { data, error } = await supabaseAdmin().rpc('ai_usage_bump_monthly', {
          p_account_id: accountId,
          p_feature: feature,
          p_cap: cap,
        })
        if (error) {
          if (!warnedMissingMonthly) {
            warnedMissingMonthly = true
            console.warn('[ai-quota] ai_usage_bump_monthly unavailable (migration 103 not applied?), allowing:', error.message)
          }
        } else if (data === false) {
          return { allowed: false, cap, plan, message: quotaMessage(feature, plan, cap), reason: 'monthly_cap' }
        }
      }
    }

    const spend = await spendCredits(accountId, feature, idempotencyKey)
    if (!spend.ok) {
      return {
        allowed: false,
        cap: cap ?? 0,
        plan,
        message: outOfCreditsMessage(feature),
        reason: 'out_of_credits',
        balance: spend.balance,
      }
    }
    return { allowed: true, cap: cap ?? 0, plan, balance: spend.balance }
  }

  // suggest / analysis / summary: unchanged daily path.
  const cap = aiDailyCap(plan, feature)
  if (cap <= 0) {
    return {
      allowed: false,
      cap,
      plan,
      message: quotaMessage(feature, plan, cap),
      reason: 'daily_cap',
    }
  }

  const { data, error } = await supabaseAdmin().rpc('ai_usage_bump', {
    p_account_id: accountId,
    p_feature: feature,
    p_cap: cap,
  })
  if (error) {
    if (!warnedMissingDaily) {
      warnedMissingDaily = true
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

function monthStartIso(): string {
  const now = new Date()
  const kolkata = new Date(now.toLocaleString('en-US', { timeZone: 'Asia/Kolkata' }))
  return `${kolkata.getFullYear()}-${String(kolkata.getMonth() + 1).padStart(2, '0')}-01`
}

/**
 * Record an AI call's real minutes against this month's plan quota,
 * once the call has ended and the true duration is known. Never
 * refuses — there's nothing left to gate by then — and never throws;
 * a failure here only means next month's usage display is off by one
 * call, not that anything breaks.
 */
export async function recordVoiceMinutes(accountId: string, minutes: number): Promise<void> {
  const amount = Math.ceil(minutes)
  if (amount <= 0) return
  const { error } = await supabaseAdmin().rpc('ai_usage_record_monthly', {
    p_account_id: accountId,
    p_feature: 'voice_call',
    p_amount: amount,
  })
  if (error) console.warn('[ai-quota] ai_usage_record_monthly failed:', error.message)
}
