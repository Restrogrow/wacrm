// ============================================================
// /api/catalog/collections
//   GET  — list collections with their retailer ids (agent+)
//   POST — { name, retailer_ids[] } create one (agent+)
// ============================================================

import { NextResponse } from 'next/server'

import { requireRole, toErrorResponse } from '@/lib/auth/account'
import { supabaseAdmin } from '@/lib/flows/admin-client'
import { parseCollectionInput } from '@/lib/catalog/messages'
import { checkRateLimit, rateLimitResponse, RATE_LIMITS } from '@/lib/rate-limit'

const MAX_COLLECTIONS = 50

export async function GET() {
  try {
    const ctx = await requireRole('agent')
    const db = supabaseAdmin()
    const { data: collections, error } = await db
      .from('catalog_collections')
      .select('id, name, updated_at')
      .eq('account_id', ctx.accountId)
      .order('name', { ascending: true })
    if (error) {
      console.error('[collections] list failed:', error.message)
      return NextResponse.json({ collections: [], ready: false })
    }
    const ids = (collections ?? []).map((c) => c.id as string)
    const items = ids.length
      ? ((
          await db
            .from('catalog_collection_items')
            .select('collection_id, retailer_id, position')
            .eq('account_id', ctx.accountId)
            .in('collection_id', ids)
            .order('position', { ascending: true })
        ).data ?? [])
      : []
    const byCollection = new Map<string, string[]>()
    for (const it of items) {
      const arr = byCollection.get(it.collection_id as string) ?? []
      arr.push(it.retailer_id as string)
      byCollection.set(it.collection_id as string, arr)
    }
    return NextResponse.json({
      collections: (collections ?? []).map((c) => ({ ...c, retailer_ids: byCollection.get(c.id as string) ?? [] })),
      ready: true,
    })
  } catch (err) {
    return toErrorResponse(err)
  }
}

export async function POST(request: Request) {
  try {
    const ctx = await requireRole('agent')
    const limit = checkRateLimit(`catalog-collection:${ctx.userId}`, RATE_LIMITS.adminAction)
    if (!limit.success) return rateLimitResponse(limit)

    const parsed = parseCollectionInput(await request.json().catch(() => null))
    if (!parsed.ok) return NextResponse.json({ error: parsed.error }, { status: 400 })

    const db = supabaseAdmin()
    const { count } = await db.from('catalog_collections').select('id', { count: 'exact', head: true }).eq('account_id', ctx.accountId)
    if ((count ?? 0) >= MAX_COLLECTIONS) {
      return NextResponse.json({ error: `You can keep up to ${MAX_COLLECTIONS} collections.` }, { status: 400 })
    }

    const { data, error } = await db
      .from('catalog_collections')
      .insert({ account_id: ctx.accountId, name: parsed.value.name, created_by: ctx.userId })
      .select('id')
      .single()
    if (error || !data) {
      if (error?.code === '23505') return NextResponse.json({ error: 'A collection with that name already exists.' }, { status: 409 })
      console.error('[collections] create failed:', error?.message)
      return NextResponse.json({ error: 'Could not create the collection.' }, { status: 500 })
    }
    const { error: itemsErr } = await db.from('catalog_collection_items').insert(
      parsed.value.retailer_ids.map((retailer_id, position) => ({ collection_id: data.id, account_id: ctx.accountId, retailer_id, position })),
    )
    if (itemsErr) {
      await db.from('catalog_collections').delete().eq('id', data.id)
      console.error('[collections] items failed:', itemsErr.message)
      return NextResponse.json({ error: 'Could not save the collection.' }, { status: 500 })
    }
    return NextResponse.json({ id: data.id }, { status: 201 })
  } catch (err) {
    return toErrorResponse(err)
  }
}
