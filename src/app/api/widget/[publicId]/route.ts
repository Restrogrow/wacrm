// GET /api/widget/[publicId] — PUBLIC. The embeddable widget script calls
// this to get its look and the WhatsApp number to open. It returns ONLY
// the non-sensitive subset in `PublicWidgetConfig` (never account ids,
// emails or settings). Open to any origin because customers embed the
// widget on their own websites.

import { NextResponse } from 'next/server'

import { checkRateLimit, getClientIp } from '@/lib/rate-limit'
import { loadPublicWidgetConfig, WIDGET_CORS_HEADERS } from '@/lib/widget/server'

export async function OPTIONS() {
  return new NextResponse(null, { status: 204, headers: WIDGET_CORS_HEADERS })
}

export async function GET(request: Request, { params }: { params: Promise<{ publicId: string }> }) {
  const { publicId } = await params

  // Generous per-IP cap: a visitor loads this once per page view.
  const limit = checkRateLimit(`widget-cfg:${getClientIp(request)}`, { limit: 240, windowMs: 60_000 })
  if (!limit.success) {
    return NextResponse.json({ enabled: false }, { status: 429, headers: WIDGET_CORS_HEADERS })
  }

  const config = await loadPublicWidgetConfig(publicId)
  return NextResponse.json(config, {
    headers: {
      ...WIDGET_CORS_HEADERS,
      // Short cache so config/hours changes show up within a minute.
      'Cache-Control': 'public, max-age=60, s-maxage=60',
    },
  })
}
