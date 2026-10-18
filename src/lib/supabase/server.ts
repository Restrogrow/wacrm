import { createServerClient } from '@supabase/ssr'
import { cookies, headers } from 'next/headers'

/**
 * Mobile-app support: the native app has no cookies, so it sends its Supabase
 * access token as `Authorization: Bearer <jwt>`. We turn that into the same
 * (in-memory only) session cookie the web app uses, so every existing route
 * guard, RLS-scoped query and `auth.getUser()` check works unchanged. The token
 * is still verified by Supabase on `getUser()`; nothing is trusted from the
 * header itself, and an expired token is simply treated as signed out.
 */
function bearerSessionCookie(authorization: string | null): { name: string; value: string } | null {
  const match = /^Bearer\s+([\w-]+\.[\w-]+\.[\w-]+)$/.exec(authorization ?? '')
  if (!match) return null
  const token = match[1]
  let exp = 0
  try {
    const payload = JSON.parse(Buffer.from(token.split('.')[1], 'base64url').toString('utf8')) as { exp?: number }
    exp = typeof payload.exp === 'number' ? payload.exp : 0
  } catch {
    return null
  }
  if (!exp || exp * 1000 < Date.now()) return null

  const ref = new URL(process.env.NEXT_PUBLIC_SUPABASE_URL!).hostname.split('.')[0]
  const session = {
    access_token: token,
    refresh_token: 'mobile-bearer',
    expires_at: exp,
    expires_in: Math.max(0, exp - Math.floor(Date.now() / 1000)),
    token_type: 'bearer',
  }
  return {
    name: `sb-${ref}-auth-token`,
    value: 'base64-' + Buffer.from(JSON.stringify(session)).toString('base64url'),
  }
}

export async function createClient() {
  const cookieStore = await cookies()
  const bearer = bearerSessionCookie((await headers()).get('authorization'))

  return createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll() {
          if (bearer) return [bearer]
          return cookieStore.getAll()
        },
        setAll(cookiesToSet) {
          if (bearer) return // never write cookies back for token-authenticated calls
          try {
            cookiesToSet.forEach(({ name, value, options }) =>
              cookieStore.set(name, value, options)
            )
          } catch {
            // The `setAll` method was called from a Server Component.
            // This can be ignored if you have middleware refreshing sessions.
          }
        },
      },
    }
  )
}
