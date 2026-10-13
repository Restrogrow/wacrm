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
export function publicOrigin(): string {
  return (process.env.NEXT_PUBLIC_SITE_URL || SITE_URL).replace(/\/$/, '')
}
