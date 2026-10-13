// ============================================================
// /api/whatsapp/forms — WhatsApp forms (Meta Flows).
//
//   GET  → the account's forms + response counts (any member)
//   POST { name, title, intro?, submit_label, category?, fields[] }
//        → validates, saves, creates + publishes the Flow on Meta.
//        Admins and above.
// ============================================================

import { NextResponse } from 'next/server'

import { getCurrentAccount, requireRole, toErrorResponse } from '@/lib/auth/account'
import { supabaseAdmin } from '@/lib/flows/admin-client'
import { publishAndSave, readDefinition } from '@/lib/whatsapp/forms-server'

export async function GET() {
  try {
    const ctx = await getCurrentAccount()
    const db = supabaseAdmin()
    const { data: forms, error } = await db
      .from('whatsapp_forms')
      .select('id, name, title, intro, submit_label, category, fields, status, error, meta_flow_id, created_at, updated_at')
      .eq('account_id', ctx.accountId)
      .neq('status', 'deprecated')
      .order('created_at', { ascending: false })
    if (error) return NextResponse.json({ available: false, forms: [] })

    const { data: responses } = await db.from('whatsapp_form_responses').select('form_id').eq('account_id', ctx.accountId)
    const counts = new Map<string, number>()
    for (const r of responses ?? []) {
      if (r.form_id) counts.set(r.form_id, (counts.get(r.form_id) ?? 0) + 1)
    }
    return NextResponse.json({
      available: true,
      forms: (forms ?? []).map((f) => ({ ...f, response_count: counts.get(f.id) ?? 0 })),
    })
  } catch (err) {
    return toErrorResponse(err)
  }
}

export async function POST(request: Request) {
  try {
    const ctx = await requireRole('admin')
    let definition
    try {
      definition = readDefinition(await request.json().catch(() => null))
    } catch (err) {
      return NextResponse.json({ error: err instanceof Error ? err.message : 'Invalid form' }, { status: 400 })
    }

    const db = supabaseAdmin()
    const { data: row, error } = await db
      .from('whatsapp_forms')
      .insert({ account_id: ctx.accountId, created_by: ctx.userId, ...definition, status: 'draft' })
      .select('id')
      .single()
    if (error || !row) {
      return NextResponse.json({ error: 'Run migration 052_whatsapp_forms.sql first, or try again.' }, { status: 500 })
    }

    const result = await publishAndSave(db, ctx.accountId, row.id, definition)
    return NextResponse.json(result, { status: result.ok ? 200 : 400 })
  } catch (err) {
    return toErrorResponse(err)
  }
}
