// Shared server helpers for the Journeys API routes. Server-only.

import { supabaseAdmin } from '@/lib/flows/admin-client'
import { accountCanSend } from '@/lib/billing/server'
import { PLAN_EXPIRED_MESSAGE } from '@/lib/billing/plans'
import type { JourneyInput, StepInput } from './core'

type Db = ReturnType<typeof supabaseAdmin>

export const MAX_JOURNEYS_PER_ACCOUNT = 50

export interface JourneyWithSteps {
  id: string
  account_id: string
  name: string
  kind: 'date' | 'drip' | 'winback'
  status: 'draft' | 'active' | 'paused'
  config: Record<string, unknown>
  daily_cap: number
  created_at: string
  updated_at: string
  steps: Array<StepInput & { position: number }>
}

export async function loadJourney(db: Db, accountId: string, id: string): Promise<JourneyWithSteps | null> {
  const { data: j } = await db
    .from('journeys')
    .select('id, account_id, name, kind, status, config, daily_cap, created_at, updated_at')
    .eq('id', id)
    .eq('account_id', accountId)
    .maybeSingle()
  if (!j) return null
  const { data: steps } = await db
    .from('journey_steps')
    .select('position, delay_minutes, message_type, template_name, template_language, template_params, text_body')
    .eq('journey_id', id)
    .order('position')
  return { ...(j as Omit<JourneyWithSteps, 'steps'>), steps: (steps ?? []) as JourneyWithSteps['steps'] }
}

/** Tag / segment / custom-field ids in the config must belong to this account. */
export async function referencesBelongToAccount(
  db: Db,
  accountId: string,
  input: Pick<JourneyInput, 'kind' | 'config'>,
): Promise<string | null> {
  const c = input.config as Record<string, any> // eslint-disable-line @typescript-eslint/no-explicit-any
  const exists = async (table: string, id: string) => {
    const { data } = await db.from(table).select('id').eq('id', id).eq('account_id', accountId).maybeSingle()
    return !!data
  }
  if (input.kind === 'date' && c.date_source?.type === 'custom_field') {
    if (!(await exists('custom_fields', c.date_source.field_id))) return 'That contact field no longer exists.'
  }
  if (input.kind === 'drip') {
    if (c.enrollment?.mode === 'tag' && !(await exists('tags', c.enrollment.tag_id))) return 'That tag no longer exists.'
    if (c.enrollment?.mode === 'segment' && !(await exists('segments', c.enrollment.segment_id))) {
      return 'That segment no longer exists.'
    }
    if (c.exit?.tag_id && !(await exists('tags', c.exit.tag_id))) return 'The exit tag no longer exists.'
  }
  return null
}

/** Replace a journey's steps (delete then insert; positions are 0..n-1). */
export async function replaceSteps(db: Db, accountId: string, journeyId: string, steps: StepInput[]): Promise<string | null> {
  const { error: delErr } = await db.from('journey_steps').delete().eq('journey_id', journeyId)
  if (delErr) return delErr.message
  const rows = steps.map((s, i) => ({ ...s, journey_id: journeyId, account_id: accountId, position: i }))
  const { error } = await db.from('journey_steps').insert(rows)
  return error ? error.message : null
}

/**
 * Everything that must be true before a journey is switched on:
 * the plan can send, WhatsApp is connected and every template step is
 * APPROVED by Meta. Returns a plain-language problem, or null.
 */
export async function activationProblem(db: Db, accountId: string, steps: StepInput[]): Promise<string | null> {
  if (!(await accountCanSend(accountId))) return PLAN_EXPIRED_MESSAGE
  const { data: wa } = await db.from('whatsapp_config').select('id').eq('account_id', accountId).maybeSingle()
  if (!wa) return 'Connect WhatsApp in Settings before turning on a journey.'
  for (const [i, s] of steps.entries()) {
    if (s.message_type !== 'template') continue
    const { data: tpl } = await db
      .from('message_templates')
      .select('status')
      .eq('account_id', accountId)
      .eq('name', s.template_name ?? '')
      .eq('language', s.template_language || 'en_US')
      .maybeSingle()
    if (!tpl) return `Step ${i + 1}: the template "${s.template_name}" was not found. Sync templates and try again.`
    if (String(tpl.status).toUpperCase() !== 'APPROVED') {
      return `Step ${i + 1}: the template "${s.template_name}" is ${String(tpl.status).toLowerCase()}, not approved by Meta yet.`
    }
  }
  return null
}
