import { NextResponse } from 'next/server'

import { getCurrentAccount, toErrorResponse } from '@/lib/auth/account'
import { hasMinRole } from '@/lib/auth/roles'
import { recordAudit } from '@/lib/audit'
import { checkRateLimit, rateLimitResponse } from '@/lib/rate-limit'

/**
 * POST /api/account/security-events  { event: 'contacts_bulk_deleted', count? }
 *
 * Contacts are deleted straight from the browser, so the server learns about it here.
 */
export async function POST(request: Request) {
  try {
    const ctx = await getCurrentAccount()
    const limit = checkRateLimit(`security-event:${ctx.userId}`, { limit: 10, windowMs: 60_000 })
    if (!limit.success) return rateLimitResponse(limit)

    const body = (await request.json().catch(() => null)) as { event?: unknown; count?: unknown } | null
    const event = body?.event

    // Contacts are deleted straight from the browser, so the server can't
    // see it. Agents and above may delete; the count is client-reported
    // and flagged as such. Only accepted from a role that could have done it.
    if (event === 'contacts_bulk_deleted') {
      if (!hasMinRole(ctx.role, 'agent')) return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
      const count = Math.min(100_000, Math.max(0, Math.floor(Number(body?.count) || 0)))
      if (count < 2) return NextResponse.json({ error: 'Invalid count' }, { status: 400 })
      await recordAudit(
        { accountId: ctx.accountId, actorUserId: ctx.userId, action: 'contact.bulk_deleted', targetType: 'contact', metadata: { count, reportedBy: 'client' } },
        request,
      )
      return NextResponse.json({ ok: true })
    }

    return NextResponse.json({ error: 'Unknown event' }, { status: 400 })
  } catch (err) {
    return toErrorResponse(err)
  }
}
