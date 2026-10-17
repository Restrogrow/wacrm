// /api/widget-config — settings for the website chat widget.
//
//   GET  → { available, widget, stats }          (any member)
//   PUT  { ...config } → saves the widget        (admins)
//
// The public id used in the embed snippet is generated once, server-side.

import { NextResponse } from 'next/server'

import { getCurrentAccount, requireRole, toErrorResponse } from '@/lib/auth/account'
import { supabaseAdmin } from '@/lib/flows/admin-client'
import { publicOrigin } from '@/lib/public-origin'
import { checkRateLimit, rateLimitResponse } from '@/lib/rate-limit'
import { sanitizeWidgetConfig, widgetSnippet } from '@/lib/widget/core'
import { generatePublicId } from '@/lib/widget/server'

const COLUMNS =
  'id, public_id, enabled, phone, position, color, button_label, greeting, prefill_message, hours_aware, offline_text, collect_name'

/** Today's date in India time as YYYY-MM-DD, `back` days ago. */
function istDay(back = 0): string {
  const d = new Date(Date.now() + 5.5 * 3600_000 - back * 86_400_000)
  return d.toISOString().slice(0, 10)
}

export async function GET() {
  try {
    const ctx = await getCurrentAccount()
    const db = supabaseAdmin()
    const { data, error } = await db.from('chat_widgets').select(COLUMNS).eq('account_id', ctx.accountId).maybeSingle()
    // Table missing (migration 073 not applied) reads as "not available".
    if (error) return NextResponse.json({ available: false, widget: null, stats: null })
    if (!data) return NextResponse.json({ available: true, widget: null, stats: { days: [], impressions: 0, clicks: 0 } })

    const { data: rows } = await db
      .from('widget_stats_daily')
      .select('day, impressions, clicks')
      .eq('widget_id', data.id)
      .gte('day', istDay(29))
      .order('day', { ascending: true })
    const days = (rows ?? []) as { day: string; impressions: number; clicks: number }[]

    return NextResponse.json({
      available: true,
      widget: {
        public_id: data.public_id,
        snippet: widgetSnippet(publicOrigin(), data.public_id),
        config: {
          enabled: data.enabled,
          phone: data.phone,
          position: data.position,
          color: data.color,
          button_label: data.button_label,
          greeting: data.greeting,
          prefill_message: data.prefill_message,
          hours_aware: data.hours_aware,
          offline_text: data.offline_text,
          collect_name: data.collect_name,
        },
      },
      stats: {
        days,
        impressions: days.reduce((n, d) => n + d.impressions, 0),
        clicks: days.reduce((n, d) => n + d.clicks, 0),
      },
    })
  } catch (err) {
    return toErrorResponse(err)
  }
}

export async function PUT(request: Request) {
  try {
    const ctx = await requireRole('admin')
    const limit = checkRateLimit(`widget-save:${ctx.userId}`, { limit: 30, windowMs: 60_000 })
    if (!limit.success) return rateLimitResponse(limit)

    const parsed = sanitizeWidgetConfig(await request.json().catch(() => null))
    if (!parsed.ok) return NextResponse.json({ error: parsed.error }, { status: 400 })

    const db = supabaseAdmin()
    const { data: existing } = await db.from('chat_widgets').select('id, public_id').eq('account_id', ctx.accountId).maybeSingle()

    if (existing) {
      const { error } = await db
        .from('chat_widgets')
        .update({ ...parsed.value, updated_at: new Date().toISOString() })
        .eq('id', existing.id)
        .eq('account_id', ctx.accountId)
      if (error) {
        console.error('[widget] update failed:', error.message)
        return NextResponse.json({ error: 'Could not save the widget. Please try again.' }, { status: 500 })
      }
      return NextResponse.json({ ok: true, public_id: existing.public_id, snippet: widgetSnippet(publicOrigin(), existing.public_id) })
    }

    // First save: mint the public id (retry on the astronomically unlikely collision).
    for (let attempt = 0; attempt < 5; attempt++) {
      const publicId = generatePublicId()
      const { error } = await db.from('chat_widgets').insert({ account_id: ctx.accountId, public_id: publicId, ...parsed.value })
      if (!error) return NextResponse.json({ ok: true, public_id: publicId, snippet: widgetSnippet(publicOrigin(), publicId) })
      if (error.code !== '23505') {
        console.error('[widget] insert failed:', error.message)
        return NextResponse.json({ error: 'Could not save the widget. Please try again.' }, { status: 500 })
      }
    }
    return NextResponse.json({ error: 'Could not save the widget. Please try again.' }, { status: 500 })
  } catch (err) {
    return toErrorResponse(err)
  }
}
