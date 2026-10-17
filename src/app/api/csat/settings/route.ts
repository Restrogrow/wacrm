// /api/csat/settings
//   GET → { enabled, message_text } (any member)
//   PUT { enabled, message_text } → save (admins)

import { NextResponse } from 'next/server'

import { getCurrentAccount, requireRole, toErrorResponse } from '@/lib/auth/account'
import { CSAT_DEFAULT_MESSAGE, normalizeCsatMessage } from '@/lib/csat/core'
import { supabaseAdmin } from '@/lib/flows/admin-client'

export async function GET() {
  try {
    const ctx = await getCurrentAccount()
    const { data, error } = await supabaseAdmin()
      .from('csat_settings')
      .select('enabled, message_text')
      .eq('account_id', ctx.accountId)
      .maybeSingle()
    if (error) return NextResponse.json({ available: false, enabled: false, message_text: CSAT_DEFAULT_MESSAGE })
    return NextResponse.json({
      available: true,
      enabled: !!data?.enabled,
      message_text: normalizeCsatMessage(data?.message_text),
    })
  } catch (err) {
    return toErrorResponse(err)
  }
}

export async function PUT(request: Request) {
  try {
    const ctx = await requireRole('admin')
    const body = ((await request.json().catch(() => null)) ?? {}) as Record<string, unknown>
    const { error } = await supabaseAdmin()
      .from('csat_settings')
      .upsert({
        account_id: ctx.accountId,
        enabled: body.enabled === true,
        message_text: normalizeCsatMessage(body.message_text),
        updated_by: ctx.userId,
        updated_at: new Date().toISOString(),
      })
    if (error) {
      console.error('[api] csat settings save failed:', error.message)
      return NextResponse.json({ error: 'Could not save. The latest database update may be missing.' }, { status: 503 })
    }
    return NextResponse.json({ ok: true })
  } catch (err) {
    return toErrorResponse(err)
  }
}
