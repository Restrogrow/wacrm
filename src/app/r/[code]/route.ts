// GET /r/<code> — PUBLIC partner referral link.
//
// Counts the click (approved partners only), remembers the code in a
// cookie for REFERRAL_COOKIE_DAYS and sends the visitor on. The account
// is credited after signup by POST /api/partner/claim. `?to=/pricing`
// picks a same-site landing page; the default is the home page.

import { NextResponse } from 'next/server'

import { safeNextPath } from '@/lib/auth/safe-next'
import { supabaseAdmin } from '@/lib/flows/admin-client'
import { publicOrigin } from '@/lib/public-origin'
import { normalizeCode, REFERRAL_COOKIE, REFERRAL_COOKIE_DAYS } from '@/lib/partners/program'
import { checkRateLimit, getClientIp } from '@/lib/rate-limit'

export async function GET(request: Request, { params }: { params: Promise<{ code: string }> }) {
  // request.url's origin is the internal host behind the proxy.
  const url = new URL(request.url)
  const origin = publicOrigin()
  const target = new URL(safeNextPath(url.searchParams.get('to'), '/'), origin)
  const res = NextResponse.redirect(target, 302)
  res.headers.set('Cache-Control', 'no-store')
  res.headers.set('X-Robots-Tag', 'noindex')

  const code = normalizeCode((await params).code)
  if (!code) return res

  // Click counts are best effort; a script can't inflate them quickly.
  const limit = checkRateLimit(`partner-link:${getClientIp(request)}`, { limit: 30, windowMs: 60_000 })
  let valid = false
  try {
    if (limit.success) {
      const { data, error } = await supabaseAdmin().rpc('partner_record_click', { p_code: code })
      if (error) console.error('[partner-link] click failed:', error.message)
      valid = data === true
    } else {
      const { data } = await supabaseAdmin()
        .from('partners')
        .select('id')
        .eq('code', code)
        .eq('status', 'approved')
        .maybeSingle()
      valid = !!data
    }
  } catch (err) {
    console.error('[partner-link] lookup failed:', err)
  }

  if (valid) {
    res.cookies.set(REFERRAL_COOKIE, code, {
      path: '/',
      maxAge: REFERRAL_COOKIE_DAYS * 86_400,
      sameSite: 'lax',
      secure: origin.startsWith('https:'),
      httpOnly: true,
    })
  }
  return res
}
