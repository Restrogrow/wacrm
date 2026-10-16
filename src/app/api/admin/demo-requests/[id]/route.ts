import { NextResponse } from 'next/server'

import { requirePlatformAdmin } from '@/lib/auth/platform-admin'
import { isDemoStatus } from '@/lib/admin/demo-requests'
import { supabaseAdmin } from '@/lib/flows/admin-client'
import { checkRateLimit, RATE_LIMITS, rateLimitResponse } from '@/lib/rate-limit'

/**
 * PATCH /api/admin/demo-requests/[id] — platform admin only.
 *
 * { status: "new" | "contacted" | "demo_done" | "won" | "lost" }
 */
export async function PATCH(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const adminUser = await requirePlatformAdmin()

  const limit = checkRateLimit(`demo-status:${adminUser.userId}`, RATE_LIMITS.adminAction)
  if (!limit.success) return rateLimitResponse(limit)

  const { id } = await params
  const body = (await request.json().catch(() => null)) as { status?: unknown } | null
  if (!isDemoStatus(body?.status)) {
    return NextResponse.json({ error: 'Choose a valid status' }, { status: 400 })
  }

  const { data, error } = await supabaseAdmin()
    .from('demo_requests')
    .update({ status: body.status })
    .eq('id', id)
    .select('id')
    .maybeSingle()
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  if (!data) return NextResponse.json({ error: 'Request not found' }, { status: 404 })
  return NextResponse.json({ ok: true, status: body.status })
}
