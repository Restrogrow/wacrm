// ============================================================
// /api/journeys/:id
//
//   GET    one journey with its steps (any member).
//   PATCH  agents and above:
//            { status: 'active' | 'paused' | 'draft' }   switch on / off
//            { name, kind, config, daily_cap, steps }     edit the journey
//          Switching on checks the plan, WhatsApp and that every
//          template is approved by Meta.
//   DELETE agents and above; also removes its enrollments and history.
// ============================================================

import { NextResponse } from 'next/server'

import { getCurrentAccount, requireRole, toErrorResponse } from '@/lib/auth/account'
import { supabaseAdmin } from '@/lib/flows/admin-client'
import { checkRateLimit, rateLimitResponse } from '@/lib/rate-limit'
import { validateJourneyInput } from '@/lib/journeys/core'
import {
  activationProblem,
  loadJourney,
  referencesBelongToAccount,
  replaceSteps,
} from '@/lib/journeys/server'

type Ctx = { params: Promise<{ id: string }> }
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

export async function GET(_request: Request, { params }: Ctx) {
  try {
    const ctx = await getCurrentAccount()
    const { id } = await params
    if (!UUID.test(id)) return NextResponse.json({ error: 'Not found' }, { status: 404 })
    const journey = await loadJourney(supabaseAdmin(), ctx.accountId, id)
    if (!journey) return NextResponse.json({ error: 'Not found' }, { status: 404 })
    return NextResponse.json({ journey })
  } catch (err) {
    return toErrorResponse(err)
  }
}

export async function PATCH(request: Request, { params }: Ctx) {
  try {
    const ctx = await requireRole('agent')
    const limit = checkRateLimit(`journey-write:${ctx.userId}`, { limit: 30, windowMs: 60_000 })
    if (!limit.success) return rateLimitResponse(limit)

    const { id } = await params
    if (!UUID.test(id)) return NextResponse.json({ error: 'Not found' }, { status: 404 })
    const db = supabaseAdmin()
    const existing = await loadJourney(db, ctx.accountId, id)
    if (!existing) return NextResponse.json({ error: 'Not found' }, { status: 404 })

    const body = ((await request.json().catch(() => null)) ?? {}) as Record<string, unknown>
    const patch: Record<string, unknown> = { updated_at: new Date().toISOString() }
    let steps = existing.steps

    // Edit the definition.
    if (body.steps !== undefined || body.config !== undefined || body.name !== undefined) {
      const parsed = validateJourneyInput({
        name: body.name ?? existing.name,
        kind: existing.kind, // the type cannot change
        config: body.config ?? existing.config,
        daily_cap: body.daily_cap ?? existing.daily_cap,
        steps: body.steps ?? existing.steps,
      })
      if (!parsed.ok) return NextResponse.json({ error: parsed.error }, { status: 400 })
      const refProblem = await referencesBelongToAccount(db, ctx.accountId, parsed.value)
      if (refProblem) return NextResponse.json({ error: refProblem }, { status: 400 })
      patch.name = parsed.value.name
      patch.config = parsed.value.config
      patch.daily_cap = parsed.value.daily_cap
      patch.last_scan_on = null // re-scan after an edit
      steps = parsed.value.steps.map((s, i) => ({ ...s, position: i }))
      if (body.steps !== undefined) {
        const stepErr = await replaceSteps(db, ctx.accountId, id, parsed.value.steps)
        if (stepErr) {
          console.error('[journeys] steps update failed:', stepErr)
          return NextResponse.json({ error: 'Could not save the messages.' }, { status: 500 })
        }
      }
    }

    // Switch on / off.
    const nextStatus = body.status
    if (nextStatus !== undefined) {
      if (nextStatus !== 'active' && nextStatus !== 'paused' && nextStatus !== 'draft') {
        return NextResponse.json({ error: 'Invalid status.' }, { status: 400 })
      }
      if (nextStatus === 'active') {
        const problem = await activationProblem(db, ctx.accountId, steps)
        if (problem) return NextResponse.json({ error: problem }, { status: 400 })
        patch.last_scan_on = null
      }
      patch.status = nextStatus
    } else if (existing.status === 'active' && patch.config !== undefined) {
      // An edited running journey must still pass the checks.
      const problem = await activationProblem(db, ctx.accountId, steps)
      if (problem) return NextResponse.json({ error: problem }, { status: 400 })
    }

    const { error } = await db.from('journeys').update(patch).eq('id', id).eq('account_id', ctx.accountId)
    if (error) {
      console.error('[journeys] update failed:', error.message)
      return NextResponse.json({ error: 'Could not save the journey.' }, { status: 500 })
    }
    return NextResponse.json({ ok: true })
  } catch (err) {
    return toErrorResponse(err)
  }
}

export async function DELETE(_request: Request, { params }: Ctx) {
  try {
    const ctx = await requireRole('agent')
    const { id } = await params
    if (!UUID.test(id)) return NextResponse.json({ error: 'Not found' }, { status: 404 })
    const { error } = await supabaseAdmin().from('journeys').delete().eq('id', id).eq('account_id', ctx.accountId)
    if (error) {
      console.error('[journeys] delete failed:', error.message)
      return NextResponse.json({ error: 'Could not delete the journey.' }, { status: 500 })
    }
    return NextResponse.json({ ok: true })
  } catch (err) {
    return toErrorResponse(err)
  }
}
