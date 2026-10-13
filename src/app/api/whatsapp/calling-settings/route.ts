// ============================================================
// /api/whatsapp/calling-settings — WhatsApp calling on the number.
//
//   GET  → { status: 'ENABLED' | 'DISABLED', ... } from Meta
//   POST { enabled: boolean } → turns calling on (call button shown,
//        callback permission on) or off. Admins and above.
//
// Meta requires a messaging limit of 2,000+ to enable calling; its
// error is passed through as-is.
// ============================================================

import { NextResponse } from 'next/server'

import { requireRole } from '@/lib/auth/account'
import { supabaseAdmin } from '@/lib/flows/admin-client'
import { getCallingSettings, loadCallingConfig, setCallingEnabled } from '@/lib/whatsapp/calling'
import { callingErrorResponse } from '@/lib/whatsapp/calling-server'

export async function GET() {
  try {
    const ctx = await requireRole('agent')
    const cfg = await loadCallingConfig(supabaseAdmin(), ctx.accountId)
    return NextResponse.json(await getCallingSettings(cfg))
  } catch (err) {
    return callingErrorResponse(err)
  }
}

export async function POST(request: Request) {
  try {
    const ctx = await requireRole('admin')
    const body = (await request.json().catch(() => null)) as { enabled?: unknown } | null
    if (typeof body?.enabled !== 'boolean') {
      return NextResponse.json({ error: "'enabled' must be true or false" }, { status: 400 })
    }
    const cfg = await loadCallingConfig(supabaseAdmin(), ctx.accountId)
    await setCallingEnabled(cfg, body.enabled)
    return NextResponse.json(await getCallingSettings(cfg))
  } catch (err) {
    return callingErrorResponse(err)
  }
}
