// ============================================================
// /api/journeys
//
//   GET   list this account's journeys with steps and numbers
//         (enrolled / sent / replied / completed / opted out).
//   POST  create a journey (agents and above). New journeys start as
//         drafts; switch them on with PATCH /api/journeys/:id.
// ============================================================

import { NextResponse } from 'next/server'

import { getCurrentAccount, requireRole, toErrorResponse } from '@/lib/auth/account'
import { supabaseAdmin } from '@/lib/flows/admin-client'
import { checkRateLimit, rateLimitResponse } from '@/lib/rate-limit'
import { validateJourneyInput } from '@/lib/journeys/core'
import {
  MAX_JOURNEYS_PER_ACCOUNT,
  referencesBelongToAccount,
  replaceSteps,
} from '@/lib/journeys/server'

export async function GET() {
  try {
    const ctx = await getCurrentAccount()
    const db = supabaseAdmin()

    const { data: journeys, error } = await db
      .from('journeys')
      .select('id, name, kind, status, config, daily_cap, created_at, updated_at')
      .eq('account_id', ctx.accountId)
      .order('created_at', { ascending: false })
      .limit(MAX_JOURNEYS_PER_ACCOUNT)
    // Migration 075 not applied yet: behave as "feature unavailable".
    if (error) return NextResponse.json({ available: false, journeys: [] })

    const ids = (journeys ?? []).map((j) => j.id as string)
    const { data: steps } = ids.length
      ? await db
          .from('journey_steps')
          .select('journey_id, position, delay_minutes, message_type, template_name, template_language, template_params, text_body')
          .in('journey_id', ids)
          .order('position')
      : { data: [] as Array<Record<string, unknown>> }

    // Numbers run as the signed-in user, so row-level security applies.
    const { data: stats } = await ctx.supabase.rpc('journey_stats', { p_account_id: ctx.accountId })
    const statsById = new Map(
      ((stats ?? []) as Array<Record<string, unknown>>).map((s) => [s.journey_id as string, s]),
    )

    return NextResponse.json({
      available: true,
      journeys: (journeys ?? []).map((j) => {
        const s = statsById.get(j.id as string)
        return {
          ...j,
          steps: (steps ?? []).filter((st) => st.journey_id === j.id),
          stats: {
            enrolled: Number(s?.enrolled ?? 0),
            sent: Number(s?.sent ?? 0),
            replied: Number(s?.replied ?? 0),
            completed: Number(s?.completed ?? 0),
            opted_out: Number(s?.opted_out ?? 0),
            failed: Number(s?.failed ?? 0),
          },
        }
      }),
    })
  } catch (err) {
    return toErrorResponse(err)
  }
}

export async function POST(request: Request) {
  try {
    const ctx = await requireRole('agent')
    const limit = checkRateLimit(`journey-write:${ctx.userId}`, { limit: 30, windowMs: 60_000 })
    if (!limit.success) return rateLimitResponse(limit)

    const parsed = validateJourneyInput(await request.json().catch(() => null))
    if (!parsed.ok) return NextResponse.json({ error: parsed.error }, { status: 400 })

    const db = supabaseAdmin()
    const { count } = await db
      .from('journeys')
      .select('id', { count: 'exact', head: true })
      .eq('account_id', ctx.accountId)
    if ((count ?? 0) >= MAX_JOURNEYS_PER_ACCOUNT) {
      return NextResponse.json({ error: `You can have up to ${MAX_JOURNEYS_PER_ACCOUNT} journeys.` }, { status: 400 })
    }

    const refProblem = await referencesBelongToAccount(db, ctx.accountId, parsed.value)
    if (refProblem) return NextResponse.json({ error: refProblem }, { status: 400 })

    const { data: journey, error } = await db
      .from('journeys')
      .insert({
        account_id: ctx.accountId,
        name: parsed.value.name,
        kind: parsed.value.kind,
        status: 'draft',
        config: parsed.value.config,
        daily_cap: parsed.value.daily_cap,
        created_by: ctx.userId,
      })
      .select('id')
      .single()
    if (error || !journey) {
      console.error('[journeys] create failed:', error?.message)
      return NextResponse.json({ error: 'Could not create the journey.' }, { status: 500 })
    }

    const stepErr = await replaceSteps(db, ctx.accountId, journey.id as string, parsed.value.steps)
    if (stepErr) {
      await db.from('journeys').delete().eq('id', journey.id)
      console.error('[journeys] steps failed:', stepErr)
      return NextResponse.json({ error: 'Could not save the messages.' }, { status: 500 })
    }
    return NextResponse.json({ id: journey.id }, { status: 201 })
  } catch (err) {
    return toErrorResponse(err)
  }
}
