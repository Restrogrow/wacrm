// ============================================================
// GET /api/catalog/picker?q=&limit= — active products for the inbox
// product picker (agents and above). Read-only.
// ============================================================

import { NextResponse } from 'next/server'

import { requireRole, toErrorResponse } from '@/lib/auth/account'
import { supabaseAdmin } from '@/lib/flows/admin-client'

const COLUMNS = 'id, retailer_id, title, price_paise, sale_price_paise, currency, image_url, availability, stock_qty, category'

/** Characters that could break out of the PostgREST .or() grammar are dropped. */
function safeTerm(raw: string): string {
  return raw.replace(/[^\p{L}\p{N} .\-]/gu, '').trim().slice(0, 60)
}

export async function GET(request: Request) {
  try {
    const ctx = await requireRole('agent')
    const url = new URL(request.url)
    const q = safeTerm(url.searchParams.get('q') ?? '')
    const limit = Math.min(60, Math.max(1, Number(url.searchParams.get('limit')) || 30))

    let query = supabaseAdmin()
      .from('products')
      .select(COLUMNS)
      .eq('account_id', ctx.accountId)
      .eq('status', 'active')
      .order('title', { ascending: true })
      .limit(limit)
    if (q) query = query.or(`title.ilike.%${q}%,retailer_id.ilike.%${q}%`)

    const { data, error } = await query
    if (error) {
      // Product library not set up yet (migration 076): show an empty picker.
      if (error.code === '42P01' || error.code === 'PGRST205' || /does not exist|schema cache/i.test(error.message)) {
        return NextResponse.json({ products: [], ready: false })
      }
      console.error('[catalog-picker] failed:', error.message)
      return NextResponse.json({ error: 'Could not load products.' }, { status: 500 })
    }
    return NextResponse.json({ products: data ?? [], ready: true })
  } catch (err) {
    return toErrorResponse(err)
  }
}
