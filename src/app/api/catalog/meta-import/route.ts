// ============================================================
// POST /api/catalog/meta-import  { overwrite?: boolean }
// Pull the products that already exist in the WhatsApp (Meta) catalog into
// the product library. Agents and above. By default products already in the
// library are left alone; `overwrite` refreshes them from Meta.
// (Pushing the library TO Meta is /api/catalog/meta-sync.)
// ============================================================

import { NextResponse } from 'next/server'

import { requireRole, toErrorResponse } from '@/lib/auth/account'
import { importFromMetaCatalog } from '@/lib/catalog/meta-import'
import { supabaseAdmin } from '@/lib/flows/admin-client'
import { checkRateLimit, rateLimitResponse } from '@/lib/rate-limit'

export async function POST(request: Request) {
  try {
    const ctx = await requireRole('agent')
    const limit = checkRateLimit(`catalog-meta-import:${ctx.userId}`, { limit: 3, windowMs: 60_000 })
    if (!limit.success) return rateLimitResponse(limit)

    const body = (await request.json().catch(() => null)) as { overwrite?: unknown } | null
    const result = await importFromMetaCatalog(supabaseAdmin(), ctx.accountId, { overwrite: body?.overwrite === true })
    const status = result.ok ? 200 : result.code === 'meta_error' ? 502 : 400
    return NextResponse.json(result, { status })
  } catch (err) {
    return toErrorResponse(err)
  }
}
