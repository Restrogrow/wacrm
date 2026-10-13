// ============================================================
// GET /api/account/export — "Download my data"
//
// Any signed-in member: their own data. Owners and admins: their
// own data plus the business's data. Streams a JSON file; see
// lib/account/data-export.ts for what's included and what's left out.
// ============================================================

import { NextResponse } from 'next/server'

import { getCurrentAccount, toErrorResponse } from '@/lib/auth/account'
import { checkRateLimit, rateLimitResponse, RATE_LIMITS } from '@/lib/rate-limit'
import { supabaseAdmin } from '@/lib/flows/admin-client'
import { exportFileName, streamAccountExport } from '@/lib/account/data-export'

export const dynamic = 'force-dynamic'

export async function GET() {
  try {
    const ctx = await getCurrentAccount()

    const limit = checkRateLimit(`account:export:${ctx.userId}`, RATE_LIMITS.dataExport)
    if (!limit.success) return rateLimitResponse(limit)

    const {
      data: { user },
    } = await ctx.supabase.auth.getUser()
    if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

    const body = streamAccountExport({
      supabase: ctx.supabase,
      admin: supabaseAdmin(),
      user,
      accountId: ctx.accountId,
      accountName: ctx.account.name,
      role: ctx.role,
    })

    return new Response(body, {
      headers: {
        'Content-Type': 'application/json; charset=utf-8',
        'Content-Disposition': `attachment; filename="${exportFileName()}"`,
        'Cache-Control': 'no-store',
      },
    })
  } catch (err) {
    return toErrorResponse(err)
  }
}
