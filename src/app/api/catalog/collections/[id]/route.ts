// ============================================================
// /api/catalog/collections/[id]
//   PATCH  — { name, retailer_ids[] } replace the collection (agent+)
//   DELETE — remove it (agent+)
// ============================================================

import { NextResponse } from 'next/server'

import { requireRole, toErrorResponse } from '@/lib/auth/account'
import { supabaseAdmin } from '@/lib/flows/admin-client'
import { parseCollectionInput } from '@/lib/catalog/messages'

type Ctx = { params: Promise<{ id: string }> }

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

export async function PATCH(request: Request, { params }: Ctx) {
  try {
    const ctx = await requireRole('agent')
    const { id } = await params
    if (!UUID.test(id)) return NextResponse.json({ error: 'Not found' }, { status: 404 })
    const parsed = parseCollectionInput(await request.json().catch(() => null))
    if (!parsed.ok) return NextResponse.json({ error: parsed.error }, { status: 400 })

    const db = supabaseAdmin()
    const { data: existing } = await db.from('catalog_collections').select('id').eq('id', id).eq('account_id', ctx.accountId).maybeSingle()
    if (!existing) return NextResponse.json({ error: 'Not found' }, { status: 404 })

    const { error } = await db
      .from('catalog_collections')
      .update({ name: parsed.value.name, updated_at: new Date().toISOString() })
      .eq('id', id)
      .eq('account_id', ctx.accountId)
    if (error) {
      if (error.code === '23505') return NextResponse.json({ error: 'A collection with that name already exists.' }, { status: 409 })
      console.error('[collections] update failed:', error.message)
      return NextResponse.json({ error: 'Could not save the collection.' }, { status: 500 })
    }
    await db.from('catalog_collection_items').delete().eq('collection_id', id).eq('account_id', ctx.accountId)
    const { error: itemsErr } = await db.from('catalog_collection_items').insert(
      parsed.value.retailer_ids.map((retailer_id, position) => ({ collection_id: id, account_id: ctx.accountId, retailer_id, position })),
    )
    if (itemsErr) {
      console.error('[collections] items failed:', itemsErr.message)
      return NextResponse.json({ error: 'Could not save the collection.' }, { status: 500 })
    }
    return NextResponse.json({ ok: true })
  } catch (err) {
    return toErrorResponse(err)
  }
}

export async function DELETE(_request: Request, { params }: Ctx) {
  try {
    const ctx = await requireRole('agent')
    const { id } = await params
    if (!UUID.test(id)) return NextResponse.json({ error: 'Not found' }, { status: 404 })
    const { error } = await supabaseAdmin().from('catalog_collections').delete().eq('id', id).eq('account_id', ctx.accountId)
    if (error) {
      console.error('[collections] delete failed:', error.message)
      return NextResponse.json({ error: 'Could not delete the collection.' }, { status: 500 })
    }
    return NextResponse.json({ ok: true })
  } catch (err) {
    return toErrorResponse(err)
  }
}
