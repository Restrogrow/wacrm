import { createServerClient } from '@supabase/ssr'
import { NextResponse, type NextRequest } from 'next/server'
import { SITE_URL } from '@/lib/seo'
import { safeNextPath } from '@/lib/auth/safe-next'
import { DEMO_BLOCKED_MESSAGE, isDemoBlockedRequest, isDemoEmail } from '@/lib/auth/demo-guard'
import { publicOrigin } from '@/lib/public-origin'

// Google was indexing https://repeatgrow.com/ and https://www.repeatgrow.com/
// as separate, un-deduplicated pages ("Duplicate without user-selected
// canonical" in Search Console) because both hosts served identical content
// with no redirect between them. Canonical tags alone didn't fix it — Google
// picked www as the canonical itself for some pages, ignoring our rel=canonical
// pointing at the apex. Force a single host at the edge instead.
//
// request.nextUrl.hostname reflects the address Next.js's own server is
// bound to (localhost in dev, an internal address behind Hostinger's
// reverse proxy in prod) — not the public host the visitor requested. The
// Host header carries that instead, so the redirect target is built from
// SITE_URL rather than by mutating nextUrl, which would otherwise leak the
// internal protocol/port into the Location header.
const CANONICAL_HOST = new URL(SITE_URL).hostname

export async function proxy(request: NextRequest) {
  const requestHost = (
    request.headers.get('x-forwarded-host') ?? request.headers.get('host') ?? ''
  ).split(':')[0]
  if (requestHost && requestHost !== CANONICAL_HOST && requestHost.endsWith('repeatgrow.com')) {
    const target = new URL(
      request.nextUrl.pathname + request.nextUrl.search,
      SITE_URL
    )
    return NextResponse.redirect(target, 308)
  }

  // Supabase falls back to the project's Site URL (the homepage) when an
  // auth redirect — Google OAuth, signup confirmation — asks to return
  // somewhere not on its Redirect URLs allow-list. The PKCE `code` then
  // lands on `/` where nothing exchanges it, and the visitor is stuck on
  // the marketing page signed out. Hand it to /auth/callback instead.
  if (request.nextUrl.pathname === '/' && request.nextUrl.searchParams.has('code')) {
    // Built on publicOrigin(), not nextUrl — see CANONICAL_HOST above.
    const url = new URL('/auth/callback' + request.nextUrl.search, publicOrigin())
    if (!url.searchParams.has('next')) url.searchParams.set('next', '/dashboard')
    return NextResponse.redirect(url)
  }

  // CSRF defence for cookie-authenticated API calls: a state-changing
  // request that carries a browser Origin must come from our own site.
  // Webhooks and API-key clients send no Origin (or no session cookie), so
  // they are unaffected.
  // /api/widget/* is the public website-widget beacon: customers embed it on
  // their own sites, so a cross-origin POST (which sendBeacon sends WITH the
  // visitor's repeatgrow.com cookies if they are logged in) is expected and
  // harmless — it only bumps a counter and needs no session.
  if (
    request.nextUrl.pathname.startsWith('/api/') &&
    !request.nextUrl.pathname.startsWith('/api/widget/') &&
    !['GET', 'HEAD', 'OPTIONS'].includes(request.method)
  ) {
    const origin = request.headers.get('origin')
    const hasSession = request.cookies.getAll().some((c) => c.name.startsWith('sb-'))
    if (origin && hasSession) {
      let originHost = ''
      try {
        originHost = new URL(origin).host
      } catch {}
      const siteHost = new URL(SITE_URL).host
      const reqHost = request.headers.get('x-forwarded-host') ?? request.headers.get('host') ?? ''
      const allowed = new Set([siteHost, `www.${siteHost}`, reqHost])
      if (!allowed.has(originHost)) {
        return NextResponse.json({ error: 'Cross-site request blocked' }, { status: 403 })
      }
    }
  }

  let supabaseResponse = NextResponse.next({ request })

  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll() {
          return request.cookies.getAll()
        },
        setAll(cookiesToSet) {
          cookiesToSet.forEach(({ name, value }) => request.cookies.set(name, value))
          supabaseResponse = NextResponse.next({ request })
          cookiesToSet.forEach(({ name, value, options }) =>
            supabaseResponse.cookies.set(name, value, options)
          )
        },
      },
    }
  )

  const { data: { user } } = await supabase.auth.getUser()

  // The public demo login may not touch ownership, WhatsApp setup,
  // integrations or real sends (see demo-guard). The mobile app sends a
  // bearer token instead of cookies, so resolve that user too, but only
  // for the blocked writes, to keep every other request at one lookup.
  const demoEmail = process.env.DEMO_LOGIN_EMAIL
  if (demoEmail && isDemoBlockedRequest(request.nextUrl.pathname, request.method)) {
    let email = user?.email
    const bearer = /^Bearer\s+(\S+)$/i.exec(request.headers.get('authorization') ?? '')?.[1]
    if (!email && bearer) {
      email = (await supabase.auth.getUser(bearer)).data.user?.email
    }
    if (isDemoEmail(email, demoEmail)) {
      return NextResponse.json({ error: DEMO_BLOCKED_MESSAGE }, { status: 403 })
    }
  }

  // getUser() transparently refreshes an expired access token, which
  // ROTATES the refresh token and writes the new cookies onto
  // `supabaseResponse` via setAll() above. Any response we return in
  // place of `supabaseResponse` (every redirect / JSON branch below)
  // is a fresh object that does NOT carry those Set-Cookie headers, so
  // the rotated token never reaches the browser. The next request then
  // replays the old, now-consumed refresh token, the refresh fails, and
  // the session wedges — the user gets a broken reload after idling and
  // can only recover by manually clearing cookies (issue #288). Copy the
  // refreshed cookies onto whatever response we hand back to fix that.
  const withRefreshedCookies = <T extends NextResponse>(response: T): T => {
    supabaseResponse.cookies.getAll().forEach((cookie) => {
      response.cookies.set(cookie)
    })
    return response
  }

  // Auth pages - redirect to dashboard if already logged in.
  // Exception: when an invite token is in the query string we
  // send the already-signed-in user to /join/<token> instead so
  // they can accept the invitation in one click. Without this,
  // a forwarded invite link to someone who's already signed in
  // would silently drop them on /dashboard.
  if (user && (
    request.nextUrl.pathname === '/login' ||
    request.nextUrl.pathname === '/signup' ||
    request.nextUrl.pathname === '/forgot-password'
  )) {
    const url = request.nextUrl.clone()
    const inviteToken = request.nextUrl.searchParams.get('invite')
    if (
      inviteToken &&
      (request.nextUrl.pathname === '/login' ||
        request.nextUrl.pathname === '/signup')
    ) {
      url.pathname = `/join/${encodeURIComponent(inviteToken)}`
      url.search = ''
    } else {
      // Honour a same-origin `next` (e.g. a /connect consent page) so an
      // already-signed-in user lands back where they started.
      const next = safeNextPath(request.nextUrl.searchParams.get('next'))
      const target = new URL(next, request.nextUrl.origin)
      url.pathname = target.pathname
      url.search = target.search
    }
    return withRefreshedCookies(NextResponse.redirect(url))
  }

  // Protected pages - redirect to login if not authenticated
  const protectedPaths = ['/dashboard', '/inbox', '/contacts', '/pipelines', '/broadcasts', '/automations', '/flows', '/notifications', '/calls', '/ai-chatbot', '/forms', '/templates', '/qr-link', '/daily-summary', '/orders', '/catalog', '/reports', '/whatsapp-spend', '/journeys', '/integrations', '/settings', '/partner', '/admin', '/onboarding']
  if (!user && protectedPaths.some(path => request.nextUrl.pathname.startsWith(path))) {
    const url = request.nextUrl.clone()
    url.pathname = '/login'
    return withRefreshedCookies(NextResponse.redirect(url))
  }

  // API routes that need auth (not webhooks)
  // The mobile app authenticates with a bearer token instead of cookies; the route
  // handlers verify it themselves (see src/lib/supabase/server.ts).
  const hasBearer = /^Bearer\s/i.test(request.headers.get('authorization') ?? '')
  if (!user && !hasBearer && request.nextUrl.pathname.startsWith('/api/whatsapp/') &&
      !request.nextUrl.pathname.includes('/webhook')) {
    return withRefreshedCookies(
      NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    )
  }

  return supabaseResponse
}

export const config = {
  matcher: [
    '/((?!_next/static|_next/image|favicon.ico|.*\\.(?:svg|png|jpg|jpeg|gif|webp)$).*)',
  ],
}
