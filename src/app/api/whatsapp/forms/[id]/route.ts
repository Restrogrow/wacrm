// ============================================================
// /api/whatsapp/forms/[id]
//
//   GET    → the form + its responses (newest first, up to 500)
//   PATCH  → change the form: publishes a new Flow on Meta (published
//            Flows can't be edited) and retires the old one. Admins.
//   DELETE → retire the Flow on Meta and remove the form (responses
//            are kept). Admins.
// ============================================================

import { NextResponse } from 'next/server'

import { getCurrentAccount, requireRole, toErrorResponse } from '@/lib/auth/account'
import { supabaseAdmin } from '@/lib/flows/admin-client'
import { loadFormCreds, retireFlow } from '@/lib/whatsapp/forms'
import { publishAndSave, readDefinition } from '@/lib/whatsapp/forms-server'

async function loadForm(accountId: string, id: string) {
  const { data } = await supabaseAdmin()
    .from('whatsapp_forms')
    .select('*')
    .eq('id', id)
    .eq('account_id', accountId)
    .maybeSingle()
  return data
}

export async function GET(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const ctx = await getCurrentAccount()
    const { id } = await params
    const form = await loadForm(ctx.accountId, id)
    if (!form) return NextResponse.json({ error: 'Form not found' }, { status: 404 })
    const { data: responses } = await supabaseAdmin()
      .from('whatsapp_form_responses')
      .select('id, answers, created_at, contact_id, conversation_id, contacts ( name, phone )')
      .eq('form_id', id)
      .eq('account_id', ctx.accountId)
      .order('created_at', { ascending: false })
      .limit(500)
    return NextResponse.json({ form, responses: responses ?? [] })
  } catch (err) {
    return toErrorResponse(err)
  }
}

export async function PATCH(request: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const ctx = await requireRole('admin')
    const { id } = await params
    const form = await loadForm(ctx.accountId, id)
    if (!form) return NextResponse.json({ error: 'Form not found' }, { status: 404 })

    let definition
    try {
      definition = readDefinition(await request.json().catch(() => null))
    } catch (err) {
      return NextResponse.json({ error: err instanceof Error ? err.message : 'Invalid form' }, { status: 400 })
    }

    const db = supabaseAdmin()
    await db.from('whatsapp_forms').update({ ...definition, updated_at: new Date().toISOString() }).eq('id', id)
    const result = await publishAndSave(db, ctx.accountId, id, definition)
    if (result.ok && form.meta_flow_id && form.meta_flow_id !== result.flow_id) {
      await retireFlow(await loadFormCreds(db, ctx.accountId), form.meta_flow_id)
    }
    return NextResponse.json(result, { status: result.ok ? 200 : 400 })
  } catch (err) {
    return toErrorResponse(err)
  }
}

export async function DELETE(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const ctx = await requireRole('admin')
    const { id } = await params
    const form = await loadForm(ctx.accountId, id)
    if (!form) return NextResponse.json({ ok: true })
    const db = supabaseAdmin()
    if (form.meta_flow_id) {
      try {
        await retireFlow(await loadFormCreds(db, ctx.accountId), form.meta_flow_id)
      } catch {
        // WhatsApp disconnected — still remove it here.
      }
    }
    await db.from('whatsapp_forms').delete().eq('id', id)
    return NextResponse.json({ ok: true })
  } catch (err) {
    return toErrorResponse(err)
  }
}
