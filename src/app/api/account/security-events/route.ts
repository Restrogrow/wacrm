import { NextResponse } from 'next/server'

import { getCurrentAccount, toErrorResponse } from '@/lib/auth/account'
import { hasMinRole } from '@/lib/auth/roles'
import { recordAudit } from '@/lib/audit'
import { checkRateLimit, rateLimitResponse } from '@/lib/rate-limit'

/**
 * POST /api/account/security-events  { event: '2fa_enabled' | '2fa_disabled' | 'contacts_bulk_deleted', count? }
 *
 * The browser talks to Supabase MFA directly, so the server can't see when
 * two-factor is switched on or off. The settings card calls this afterwards.
 * It never trusts the claim: it re-reads the caller's factors and only logs
 * what is actually true, so the log can't be filled with made-up events.
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

    if (event !== '2fa_enabled' && event !== '2fa_disabled') {
      return NextResponse.json({ error: 'Unknown event' }, { status: 400 })
    }

    const { data, error } = await ctx.supabase.auth.mfa.listFactors()
    if (error) return NextResponse.json({ error: 'Could not check factors' }, { status: 500 })
    const hasVerified = (data?.totp ?? []).length > 0 // listFactors().totp only lists verified factors

    if (event === '2fa_enabled' && hasVerified) {
      await recordAudit({ accountId: ctx.accountId, actorUserId: ctx.userId, action: '2fa.enabled' }, request)
    } else if (event === '2fa_disabled' && !hasVerified) {
      await recordAudit({ accountId: ctx.accountId, actorUserId: ctx.userId, action: '2fa.disabled' }, request)
    }
    return NextResponse.json({ ok: true })
  } catch (err) {
    return toErrorResponse(err)
  }
}
