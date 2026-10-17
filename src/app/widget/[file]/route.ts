// GET /widget/<publicId>.js — PUBLIC. Serves the tiny embeddable widget
// script for one widget id. The script only embeds the id (validated to
// letters and digits); everything else is fetched from /api/widget/<id>.

import { NextResponse } from 'next/server'

import { checkRateLimit, getClientIp } from '@/lib/rate-limit'
import { widgetScript } from '@/lib/widget/script'
import { WIDGET_CORS_HEADERS } from '@/lib/widget/server'

export async function GET(request: Request, { params }: { params: Promise<{ file: string }> }) {
  const { file } = await params
  const match = /^([A-Za-z0-9]{10,24})\.js$/.exec(file)
  const script = match ? widgetScript(match[1]) : null
  if (!script) return new NextResponse('Not found', { status: 404 })

  const limit = checkRateLimit(`widget-js:${getClientIp(request)}`, { limit: 240, windowMs: 60_000 })
  if (!limit.success) return new NextResponse('Too many requests', { status: 429 })

  return new NextResponse(script, {
    status: 200,
    headers: {
      ...WIDGET_CORS_HEADERS,
      'Content-Type': 'application/javascript; charset=utf-8',
      'Cache-Control': 'public, max-age=3600, s-maxage=3600',
      'X-Content-Type-Options': 'nosniff',
    },
  })
}
