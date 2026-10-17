// ============================================================
// POST /api/journeys/:id/enroll — add contacts to a drip sequence by hand
// (agents and above).
//
//   { contact_ids: string[] }   up to 500 contacts
//   { segment_id: string }      everyone in a saved segment (opted-out skipped)
//   { tag_id: string }          everyone with a tag (opted-out skipped)
//
// Contacts that are already in the sequence are left alone, and opted-out
// contacts are never enrolled. Each contact gets the first message after the
// first step's wait, on the next cron run.
// ============================================================

import { NextResponse } from 'next/server'

import { requireRole, toErrorResponse } from '@/lib/auth/account'
import { supabaseAdmin } from '@/lib/flows/admin-client'
import { checkRateLimit, rateLimitResponse } from '@/lib/rate-limit'
import { loadJourney } from '@/lib/journeys/server'
import { resolveSegmentContacts } from '@/lib/segments/resolve'

type Ctx = { params: Promise<{ id: string }> }
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i
const MAX_PER_REQUEST = 1000

export async function POST(request: Request, { params }: Ctx) {
  try {
    const ctx = await requireRole('agent')
    const limit = checkRateLimit(`journey-enroll:${ctx.userId}`, { limit: 10, windowMs: 60_000 })
    if (!limit.success) return rateLimitResponse(limit)

    const { id } = await params
    if (!UUID.test(id)) return NextResponse.json({ error: 'Not found' }, { status: 404 })
    const db = supabaseAdmin()
    const journey = await loadJourney(db, ctx.accountId, id)
    if (!journey) return NextResponse.json({ error: 'Not found' }, { status: 404 })
    if (journey.kind !== 'drip') {
      return NextResponse.json({ error: 'Only drip sequences take manual enrollments.' }, { status: 400 })
    }

    const body = ((await request.json().catch(() => null)) ?? {}) as Record<string, unknown>
    let contactIds: string[] = []

    if (Array.isArray(body.contact_ids)) {
      contactIds = body.contact_ids.filter((v): v is string => typeof v === 'string' && UUID.test(v))
    } else if (typeof body.segment_id === 'string' && UUID.test(body.segment_id)) {
      // Resolved as the signed-in user, so row-level security keeps it in this account.
      try {
        const contacts = await resolveSegmentContacts(ctx.supabase, ctx.accountId, body.segment_id)
        contactIds = contacts.map((c) => c.id)
      } catch (err) {
        return NextResponse.json({ error: err instanceof Error ? err.message : 'Could not load the segment.' }, { status: 400 })
      }
    } else if (typeof body.tag_id === 'string' && UUID.test(body.tag_id)) {
      const { data: tag } = await db.from('tags').select('id').eq('id', body.tag_id).eq('account_id', ctx.accountId).maybeSingle()
      if (!tag) return NextResponse.json({ error: 'That tag no longer exists.' }, { status: 400 })
      const { data } = await db.from('contact_tags').select('contact_id').eq('tag_id', body.tag_id).limit(MAX_PER_REQUEST * 2)
      contactIds = (data ?? []).map((r) => r.contact_id as string)
    } else {
      return NextResponse.json({ error: 'Choose contacts, a segment or a tag.' }, { status: 400 })
    }

    contactIds = Array.from(new Set(contactIds))
    if (contactIds.length === 0) return NextResponse.json({ enrolled: 0, skipped: 0 })
    if (contactIds.length > MAX_PER_REQUEST) {
      return NextResponse.json({ error: `Enroll up to ${MAX_PER_REQUEST} contacts at a time.` }, { status: 400 })
    }

    // Only this account's contacts, never opted-out ones.
    const valid: string[] = []
    for (let i = 0; i < contactIds.length; i += 200) {
      const { data } = await db
        .from('contacts')
        .select('id')
        .eq('account_id', ctx.accountId)
        .is('opted_out_at', null)
        .neq('phone', '')
        .in('id', contactIds.slice(i, i + 200))
      valid.push(...(data ?? []).map((r) => r.id as string))
    }

    const delay = journey.steps[0]?.delay_minutes ?? 0
    const runAt = new Date(Date.now() + delay * 60_000).toISOString()
    let enrolled = 0
    for (let i = 0; i < valid.length; i += 200) {
      const chunk = valid.slice(i, i + 200).map((contact_id) => ({
        journey_id: id,
        account_id: ctx.accountId,
        contact_id,
        occurrence_key: 'once',
        next_run_at: runAt,
      }))
      const { data, error } = await db
        .from('journey_enrollments')
        .upsert(chunk, { onConflict: 'journey_id,contact_id,occurrence_key', ignoreDuplicates: true })
        .select('id')
      if (error) {
        console.error('[journeys] enroll failed:', error.message)
        return NextResponse.json({ error: 'Could not enroll the contacts.' }, { status: 500 })
      }
      enrolled += data?.length ?? 0
    }
    return NextResponse.json({ enrolled, skipped: contactIds.length - enrolled })
  } catch (err) {
    return toErrorResponse(err)
  }
}
