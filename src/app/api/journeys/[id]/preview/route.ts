// ============================================================
// POST /api/journeys/:id/preview — a safe dry run. Nothing is sent and
// nobody is enrolled; it only counts who the journey would reach.
//
//   drip (tag / segment) and win-back: contacts that would be enrolled now
//   date: contacts with a readable date, and how many are due today /
//         within 7 / 30 days
// ============================================================

import { NextResponse } from 'next/server'

import { getCurrentAccount, toErrorResponse } from '@/lib/auth/account'
import { supabaseAdmin } from '@/lib/flows/admin-client'
import { checkRateLimit, rateLimitResponse } from '@/lib/rate-limit'
import { addDays, dueOccurrence, localNow, parseFlexibleDate, type LooseYmd, type Recurrence } from '@/lib/journeys/core'
import { loadJourney } from '@/lib/journeys/server'

type Ctx = { params: Promise<{ id: string }> }
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i
const SCAN_LIMIT = 5000
const PAGE = 1000

export async function POST(_request: Request, { params }: Ctx) {
  try {
    const ctx = await getCurrentAccount()
    const limit = checkRateLimit(`journey-preview:${ctx.userId}`, { limit: 20, windowMs: 60_000 })
    if (!limit.success) return rateLimitResponse(limit)

    const { id } = await params
    if (!UUID.test(id)) return NextResponse.json({ error: 'Not found' }, { status: 404 })
    const db = supabaseAdmin()
    const journey = await loadJourney(db, ctx.accountId, id)
    if (!journey) return NextResponse.json({ error: 'Not found' }, { status: 404 })

    if (journey.kind === 'date') {
      const cfg = journey.config as {
        date_source: { type: 'custom_field'; field_id: string } | { type: 'contact_created' }
        offset_days: number
        recurrence: Recurrence
      }
      const { data: s } = await db.from('journey_settings').select('timezone').eq('account_id', ctx.accountId).maybeSingle()
      const tz = (s?.timezone as string) || 'Asia/Kolkata'
      const today = localNow(new Date(), tz).date

      const dates: LooseYmd[] = []
      let unreadable = 0
      for (let from = 0; from < SCAN_LIMIT; from += PAGE) {
        if (cfg.date_source.type === 'custom_field') {
          const { data } = await db
            .from('contact_custom_values')
            .select('value, contacts!inner(account_id, opted_out_at)')
            .eq('custom_field_id', cfg.date_source.field_id)
            .eq('contacts.account_id', ctx.accountId)
            .is('contacts.opted_out_at', null)
            .not('value', 'is', null)
            .order('contact_id')
            .range(from, from + PAGE - 1)
          for (const r of data ?? []) {
            const d = parseFlexibleDate(r.value as string)
            if (d) dates.push(d)
            else unreadable += 1
          }
          if ((data?.length ?? 0) < PAGE) break
        } else {
          const { data } = await db
            .from('contacts')
            .select('created_at')
            .eq('account_id', ctx.accountId)
            .is('opted_out_at', null)
            .order('id')
            .range(from, from + PAGE - 1)
          for (const r of data ?? []) {
            const l = localNow(new Date(r.created_at as string), tz).date
            dates.push({ y: l.y, m: l.m, d: l.d })
          }
          if ((data?.length ?? 0) < PAGE) break
        }
      }

      let dueToday = 0
      let next7 = 0
      let next30 = 0
      for (const date of dates) {
        for (let n = 0; n < 30; n++) {
          const day = addDays(today, n)
          if (dueOccurrence({ date, recurrence: cfg.recurrence, offsetDays: cfg.offset_days, today: day })) {
            if (n === 0) dueToday += 1
            if (n < 7) next7 += 1
            next30 += 1
            break
          }
        }
      }
      return NextResponse.json({
        kind: 'date',
        contacts_with_date: dates.length,
        unreadable_dates: unreadable,
        due_today: dueToday,
        due_next_7_days: next7,
        due_next_30_days: next30,
        truncated: dates.length + unreadable >= SCAN_LIMIT,
      })
    }

    const { data: audience, error } = await db.rpc('journey_audience_count', { p_journey_id: id })
    if (error) {
      console.error('[journeys] preview failed:', error.message)
      return NextResponse.json({ error: 'Could not count the audience.' }, { status: 500 })
    }
    const { count: alreadyEnrolled } = await db
      .from('journey_enrollments')
      .select('id', { count: 'exact', head: true })
      .eq('journey_id', id)
    return NextResponse.json({
      kind: journey.kind,
      would_enroll_now: Number(audience ?? 0),
      already_enrolled: alreadyEnrolled ?? 0,
    })
  } catch (err) {
    return toErrorResponse(err)
  }
}
