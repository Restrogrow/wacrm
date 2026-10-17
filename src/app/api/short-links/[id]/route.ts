// /api/short-links/[id] — change or delete one short link (admins).
//   PATCH { is_active?, label?, utm_source?, utm_medium?, utm_campaign? }
//   DELETE
// The target URL can't be edited: create a new link instead, so an old
// printed QR code can never be silently repointed.

import { NextResponse } from 'next/server'

import { requireRole, toErrorResponse } from '@/lib/auth/account'
import { supabaseAdmin } from '@/lib/flows/admin-client'
import { checkRateLimit, rateLimitResponse } from '@/lib/rate-limit'
import { sanitizeUtmValue } from '@/lib/short-links/core'

type Ctx = { params: Promise<{ id: string }> }

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

export async function PATCH(request: Request, { params }: Ctx) {
  try {
    const ctx = await requireRole('admin')
    const { id } = await params
    if (!UUID.test(id)) return NextResponse.json({ error: 'Not found' }, { status: 404 })
    const limit = checkRateLimit(`short-link-edit:${ctx.userId}`, { limit: 60, windowMs: 60_000 })
    if (!limit.success) return rateLimitResponse(limit)

    const b = ((await request.json().catch(() => null)) ?? {}) as Record<string, unknown>
    const patch: Record<string, unknown> = {}
    if (typeof b.is_active === 'boolean') patch.is_active = b.is_active
    if (typeof b.label === 'string') patch.label = b.label.replace(/[\u0000-\u001f\u007f]/g, ' ').trim().slice(0, 80)
    for (const key of ['utm_source', 'utm_medium', 'utm_campaign'] as const) {
      if (key in b) patch[key] = sanitizeUtmValue(b[key])
    }
    if (Object.keys(patch).length === 0) return NextResponse.json({ error: 'Nothing to change.' }, { status: 400 })

    const { data, error } = await supabaseAdmin()
      .from('short_links')
      .update(patch)
      .eq('id', id)
      .eq('account_id', ctx.accountId)
      .select('id, is_active, label, utm_source, utm_medium, utm_campaign')
      .maybeSingle()
    if (error) {
      console.error('[short-link] update failed:', error.message)
      return NextResponse.json({ error: 'Could not update the link.' }, { status: 500 })
    }
    if (!data) return NextResponse.json({ error: 'Not found' }, { status: 404 })
    return NextResponse.json({ link: data })
  } catch (err) {
    return toErrorResponse(err)
  }
}

export async function DELETE(_request: Request, { params }: Ctx) {
  try {
    const ctx = await requireRole('admin')
    const { id } = await params
    if (!UUID.test(id)) return NextResponse.json({ error: 'Not found' }, { status: 404 })

    const { data, error } = await supabaseAdmin()
      .from('short_links')
      .delete()
      .eq('id', id)
      .eq('account_id', ctx.accountId)
      .select('id')
      .maybeSingle()
    if (error) {
      console.error('[short-link] delete failed:', error.message)
      return NextResponse.json({ error: 'Could not delete the link.' }, { status: 500 })
    }
    if (!data) return NextResponse.json({ error: 'Not found' }, { status: 404 })
    return NextResponse.json({ ok: true })
  } catch (err) {
    return toErrorResponse(err)
  }
}
