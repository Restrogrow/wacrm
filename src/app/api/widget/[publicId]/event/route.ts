// POST /api/widget/[publicId]/event — PUBLIC. Counts a widget impression
// ("view") or click. The body is `{"e":"view"|"click"}`; it is read as TEXT
// so navigator.sendBeacon (which sends text/plain) needs no CORS preflight.
// Nothing about the visitor is stored: it is a bare daily counter. The
// answer is always 204 so the endpoint reveals nothing about which widget
// ids exist.

import { NextResponse } from 'next/server'

import { supabaseAdmin } from '@/lib/flows/admin-client'
import { checkRateLimit, getClientIp } from '@/lib/rate-limit'
import { PUBLIC_ID_RE } from '@/lib/widget/core'
import { WIDGET_CORS_HEADERS } from '@/lib/widget/server'

const noContent = () => new NextResponse(null, { status: 204, headers: WIDGET_CORS_HEADERS })

export async function OPTIONS() {
  return noContent()
}

export async function POST(request: Request, { params }: { params: Promise<{ publicId: string }> }) {
  const { publicId } = await params
  if (!PUBLIC_ID_RE.test(publicId)) return noContent()

  // Per-IP and per-widget so one noisy visitor can't inflate the numbers.
  const ip = getClientIp(request)
  const limit = checkRateLimit(`widget-evt:${ip}:${publicId}`, { limit: 60, windowMs: 60_000 })
  if (!limit.success) return noContent()

  let event = ''
  try {
    const raw = await request.text()
    if (raw.length <= 200) {
      const parsed = JSON.parse(raw) as { e?: unknown }
      if (parsed.e === 'view' || parsed.e === 'click') event = parsed.e
    }
  } catch {
    // malformed body: ignore
  }
  if (!event) return noContent()

  try {
    await supabaseAdmin().rpc('widget_track', { p_public_id: publicId, p_event: event })
  } catch (err) {
    console.error('[widget] track failed:', err instanceof Error ? err.message : err)
  }
  return noContent()
}
