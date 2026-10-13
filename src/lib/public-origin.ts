import { SITE_URL } from '@/lib/seo'

// The site's public origin (e.g. https://repeatgrow.com) for building
// absolute redirect and callback URLs.
//
// Never derive it from `request.url` / `nextUrl.origin`: behind
// Hostinger's reverse proxy those carry the internal bind address
// (https://0.0.0.0:3000), so a redirect built from them sends the
// visitor to an unreachable host. NEXT_PUBLIC_SITE_URL is
// http://localhost:3000 in development and https://repeatgrow.com in
// production; SITE_URL is the fallback.
//
// A public host is always upgraded to https: production once had
// NEXT_PUBLIC_SITE_URL=http://repeatgrow.com, and OAuth providers
// (Shopify) reject a redirect_uri that isn't the exact https URL. The
// CDN rewrites http Location headers, which hid it for plain redirects.
export function publicOrigin(): string {
  const raw = (process.env.NEXT_PUBLIC_SITE_URL || SITE_URL).trim().replace(/\/+$/, '')
  try {
    const url = new URL(raw)
    const isLocal = /^(localhost|127\.0\.0\.1|0\.0\.0\.0|\[::1\])$/.test(url.hostname)
    if (url.protocol === 'http:' && !isLocal) url.protocol = 'https:'
    return url.origin
  } catch {
    return SITE_URL.replace(/\/+$/, '')
  }
}
