// ============================================================
// /api/journeys/settings — account-wide sending rules for journeys.
//
//   GET  quiet hours, wait between messages per contact, daily account
//        limit (any member; defaults when never saved).
//   PUT  admins and above.
// ============================================================

import { NextResponse } from 'next/server'

import { getCurrentAccount, requireRole, toErrorResponse } from '@/lib/auth/account'
import { supabaseAdmin } from '@/lib/flows/admin-client'
import { validateSettingsInput } from '@/lib/journeys/core'

const DEFAULTS = {
  timezone: 'Asia/Kolkata',
  quiet_start: '21:00',
  quiet_end: '09:00',
  contact_cooldown_hours: 24,
  account_daily_cap: 300,
}

export async function GET() {
  try {
    const ctx = await getCurrentAccount()
    const { data, error } = await supabaseAdmin()
      .from('journey_settings')
      .select('timezone, quiet_start, quiet_end, contact_cooldown_hours, account_daily_cap')
      .eq('account_id', ctx.accountId)
      .maybeSingle()
    if (error) return NextResponse.json({ available: false, settings: DEFAULTS })
    return NextResponse.json({ available: true, settings: data ?? DEFAULTS })
  } catch (err) {
    return toErrorResponse(err)
  }
}

export async function PUT(request: Request) {
  try {
    const ctx = await requireRole('admin')
    const parsed = validateSettingsInput(await request.json().catch(() => null))
    if (!parsed.ok) return NextResponse.json({ error: parsed.error }, { status: 400 })

    const { error } = await supabaseAdmin()
      .from('journey_settings')
      .upsert(
        { account_id: ctx.accountId, ...parsed.value, updated_by: ctx.userId, updated_at: new Date().toISOString() },
        { onConflict: 'account_id' },
      )
    if (error) {
      console.error('[journeys] settings save failed:', error.message)
      return NextResponse.json({ error: 'Could not save the settings.' }, { status: 500 })
    }
    return NextResponse.json({ ok: true })
  } catch (err) {
    return toErrorResponse(err)
  }
}
