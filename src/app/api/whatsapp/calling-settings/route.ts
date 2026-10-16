// ============================================================
// /api/whatsapp/calling-settings — WhatsApp calling on the number.
//
//   GET  → { status: 'ENABLED' | 'DISABLED', notice? } from Meta
//   POST { enabled: boolean } → turns calling on (call button shown,
//        callback permission on) or off. Admins and above.
//
// Meta requires a messaging limit of 2,000+ (and a Cloud API-only
// number) to enable calling. When it refuses, the status is reported
// as DISABLED with a plain-language notice instead of an error, so
// the admin still sees the switch.
// ============================================================

import { NextResponse } from 'next/server'

import { requireRole } from '@/lib/auth/account'
import { supabaseAdmin } from '@/lib/flows/admin-client'
import {
  callingHelpFor,
  CallingError,
  getCallingSettings,
  isCallingNotEnabledError,
  loadCallingConfig,
  setCallingEnabled,
} from '@/lib/whatsapp/calling'
import { callingErrorResponse } from '@/lib/whatsapp/calling-server'

export async function GET() {
  try {
    const ctx = await requireRole('agent')
    const cfg = await loadCallingConfig(supabaseAdmin(), ctx.accountId)
    try {
      return NextResponse.json(await getCallingSettings(cfg))
    } catch (err) {
      if (isCallingNotEnabledError(err)) {
        return NextResponse.json({ status: 'DISABLED', notice: callingHelpFor(err) })
      }
      throw err
    }
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
    try {
      await setCallingEnabled(cfg, body.enabled)
    } catch (err) {
      if (isCallingNotEnabledError(err)) throw new CallingError(callingHelpFor(err), 400, 'not_allowed')
      throw err
    }
    return NextResponse.json(await getCallingSettings(cfg))
  } catch (err) {
    return callingErrorResponse(err)
  }
}
