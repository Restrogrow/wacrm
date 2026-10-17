// GET /l/<code> — PUBLIC short-link redirect.
//
// Only links created by an authenticated admin of an account exist in
// `short_links`, and their targets were validated at creation (public
// http(s) only). The target is validated AGAIN here before redirecting, so
// a bad row can never become an open redirect to javascript:/internal
// addresses. The visit is counted by a service-role-only SQL function;
// only a device class and the referrer HOST are recorded, never the IP or
// user agent. Link-preview fetchers are classed as 'bot' and don't count.

import { NextResponse } from 'next/server'

import { supabaseAdmin } from '@/lib/flows/admin-client'
import { checkRateLimit, getClientIp } from '@/lib/rate-limit'
import { appendUtm, classifyDevice, CODE_RE, referrerHost, validateTargetUrl } from '@/lib/short-links/core'

const notFound = () =>
  new NextResponse('This link does not exist or has been turned off.', {
    status: 404,
    headers: { 'Content-Type': 'text/plain; charset=utf-8', 'Cache-Control': 'no-store', 'X-Robots-Tag': 'noindex' },
  })

export async function GET(request: Request, { params }: { params: Promise<{ code: string }> }) {
  const { code } = await params
  if (!CODE_RE.test(code)) return notFound()

  // Stops a script from inflating click counts or hammering the lookup.
  const limit = checkRateLimit(`short-link:${getClientIp(request)}`, { limit: 120, windowMs: 60_000 })
  if (!limit.success) {
    return new NextResponse('Too many requests. Try again in a minute.', {
      status: 429,
      headers: { 'Retry-After': '60', 'Content-Type': 'text/plain; charset=utf-8' },
    })
  }

  const device = classifyDevice(request.headers.get('user-agent'))
  const referrer = referrerHost(request.headers.get('referer'))

  const { data, error } = await supabaseAdmin().rpc('short_link_hit', {
    p_code: code,
    p_device: device,
    p_referrer: referrer,
  })
  if (error) {
    console.error('[short-link] lookup failed:', error.message)
    return notFound()
  }
  const row = (Array.isArray(data) ? data[0] : data) as
    | { target_url: string; utm_source: string; utm_medium: string; utm_campaign: string }
    | undefined
  if (!row) return notFound()

  const checked = validateTargetUrl(row.target_url)
  if (!checked.ok) return notFound()

  const destination = appendUtm(checked.url, {
    utm_source: row.utm_source,
    utm_medium: row.utm_medium,
    utm_campaign: row.utm_campaign,
  })

  return NextResponse.redirect(destination, {
    status: 302,
    headers: { 'Cache-Control': 'no-store', 'Referrer-Policy': 'no-referrer', 'X-Robots-Tag': 'noindex' },
  })
}
