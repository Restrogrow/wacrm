import { NextResponse } from 'next/server'
import { cookies } from 'next/headers'

import { createClient } from '@/lib/supabase/server'
import { normalizeCode, REFERRAL_COOKIE } from '@/lib/partners/program'
import { claimReferral } from '@/lib/partners/server'

/**
 * POST /api/partner/claim — credits the signed-in owner's new account to
 * the partner whose /r/<code> link set the referral cookie. Called once
 * per session by the dashboard shell; without the cookie it returns at
 * once without touching the database. The cookie is cleared after any
 * definite answer so it is only ever tried once.
 */
export async function POST() {
  const jar = await cookies()
  const code = normalizeCode(jar.get(REFERRAL_COOKIE)?.value)
  if (!code) return NextResponse.json({ ok: false })

  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  try {
    const result = await claimReferral(user.id, code)
    const res = NextResponse.json(result)
    res.cookies.delete(REFERRAL_COOKIE)
    return res
  } catch (err) {
    console.error('[partner/claim]', err)
    return NextResponse.json({ ok: false }, { status: 500 })
  }
}
