// ============================================================
// POST   /api/mobile/push-token  { token, platform, deviceName?, appVersion? }
// DELETE /api/mobile/push-token  { token }
//
// The mobile app registers its Expo push token here after sign-in and
// removes it at sign-out. Any signed-in member. The token is UNIQUE, so if a
// phone changes hands the row moves to the new user/account. Writes use the
// service role (the table has no client insert/update policies), but the
// user and account always come from the verified session, never the body.
// ============================================================

import { NextResponse } from 'next/server'

import { getCurrentAccount, toErrorResponse } from '@/lib/auth/account'
import { supabaseAdmin } from '@/lib/automations/admin-client'
import { parseRegistration, parseTokenRemoval } from '@/lib/push/core'
import { checkRateLimit, rateLimitResponse } from '@/lib/rate-limit'

export async function POST(request: Request) {
  try {
    const ctx = await getCurrentAccount()
    const limit = checkRateLimit(`push-token:${ctx.userId}`, { limit: 20, windowMs: 60_000 })
    if (!limit.success) return rateLimitResponse(limit)

    const parsed = parseRegistration(await request.json().catch(() => null))
    if (!parsed.ok) return NextResponse.json({ error: parsed.error }, { status: 400 })
    const { token, platform, deviceName, appVersion } = parsed.value

    const { error } = await supabaseAdmin()
      .from('device_push_tokens')
      .upsert(
        {
          token,
          user_id: ctx.userId,
          account_id: ctx.accountId,
          platform,
          device_name: deviceName,
          app_version: appVersion,
          enabled: true,
          last_seen_at: new Date().toISOString(),
        },
        { onConflict: 'token' },
      )
    if (error) {
      console.error('[push-token] upsert failed:', error.message)
      return NextResponse.json({ error: 'Could not register this device. Try again.' }, { status: 500 })
    }
    return NextResponse.json({ ok: true })
  } catch (err) {
    return toErrorResponse(err)
  }
}

export async function DELETE(request: Request) {
  try {
    const ctx = await getCurrentAccount()
    const limit = checkRateLimit(`push-token:${ctx.userId}`, { limit: 20, windowMs: 60_000 })
    if (!limit.success) return rateLimitResponse(limit)

    const token = parseTokenRemoval(await request.json().catch(() => null))
    if (!token) return NextResponse.json({ error: 'Invalid push token' }, { status: 400 })

    // Only ever removes the caller's own registration.
    const { error } = await supabaseAdmin().from('device_push_tokens').delete().eq('token', token).eq('user_id', ctx.userId)
    if (error) {
      console.error('[push-token] delete failed:', error.message)
      return NextResponse.json({ error: 'Could not remove this device.' }, { status: 500 })
    }
    return NextResponse.json({ ok: true })
  } catch (err) {
    return toErrorResponse(err)
  }
}
