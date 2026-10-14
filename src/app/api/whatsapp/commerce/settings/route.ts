// ============================================================
// /api/whatsapp/commerce/settings — catalog + payment setup.
//   GET → current settings (any member)
//   PUT { catalog_id?, payment_mode, payment_configuration?,
//         payment_gateway?, upi_id?, upi_name?, goods_type? } (admins)
// ============================================================

import { NextResponse } from 'next/server'

import { getCurrentAccount, requireRole, toErrorResponse } from '@/lib/auth/account'
import { supabaseAdmin } from '@/lib/flows/admin-client'

const MODES = new Set(['none', 'whatsapp_pay', 'upi_id'])
const GATEWAYS = new Set(['razorpay', 'payu', 'billdesk', 'zaakpay'])

export async function GET() {
  try {
    const ctx = await getCurrentAccount()
    const { data, error } = await supabaseAdmin().from('commerce_settings').select('*').eq('account_id', ctx.accountId).maybeSingle()
    if (error) return NextResponse.json({ available: false, settings: null })
    return NextResponse.json({ available: true, settings: data })
  } catch (err) {
    return toErrorResponse(err)
  }
}

export async function PUT(request: Request) {
  try {
    const ctx = await requireRole('admin')
    const b = ((await request.json().catch(() => null)) ?? {}) as Record<string, unknown>
    const str = (v: unknown, max = 120) => (typeof v === 'string' && v.trim() ? v.trim().slice(0, max) : null)

    const payment_mode = typeof b.payment_mode === 'string' && MODES.has(b.payment_mode) ? b.payment_mode : 'none'
    const payment_gateway = typeof b.payment_gateway === 'string' && GATEWAYS.has(b.payment_gateway) ? b.payment_gateway : null
    const row = {
      account_id: ctx.accountId,
      catalog_id: str(b.catalog_id, 40),
      payment_mode,
      payment_configuration: str(b.payment_configuration),
      payment_gateway,
      upi_id: str(b.upi_id, 80),
      upi_name: str(b.upi_name, 80),
      goods_type: b.goods_type === 'digital-goods' ? 'digital-goods' : 'physical-goods',
      updated_at: new Date().toISOString(),
    }

    if (row.catalog_id && !/^\d{5,30}$/.test(row.catalog_id)) {
      return NextResponse.json({ error: 'The catalog ID is a number — copy it from Commerce Manager.' }, { status: 400 })
    }
    if (payment_mode === 'whatsapp_pay' && (!row.payment_configuration || !payment_gateway)) {
      return NextResponse.json({ error: 'Enter the payment configuration name and choose the gateway.' }, { status: 400 })
    }
    if (payment_mode === 'upi_id' && !/^[\w.\-]{2,}@[a-zA-Z]{2,}$/.test(row.upi_id ?? '')) {
      return NextResponse.json({ error: 'Enter a valid UPI ID, like yourshop@okaxis.' }, { status: 400 })
    }

    const { data, error } = await supabaseAdmin().from('commerce_settings').upsert(row, { onConflict: 'account_id' }).select('*').single()
    if (error) return NextResponse.json({ error: 'Run migration 053_orders_and_payments.sql first.' }, { status: 500 })
    return NextResponse.json({ available: true, settings: data })
  } catch (err) {
    return toErrorResponse(err)
  }
}
