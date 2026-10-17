// DELETE /api/scheduled-messages/:id — cancel a message that has not been
// sent yet (agents and above). A message already being sent cannot be cancelled.

import { NextResponse } from 'next/server'

import { requireRole, toErrorResponse } from '@/lib/auth/account'
import { supabaseAdmin } from '@/lib/flows/admin-client'

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

export async function DELETE(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const ctx = await requireRole('agent')
    const { id } = await params
    if (!UUID.test(id)) return NextResponse.json({ error: 'Not found' }, { status: 404 })

    const { data, error } = await supabaseAdmin()
      .from('scheduled_messages')
      .update({ status: 'cancelled', updated_at: new Date().toISOString() })
      .eq('id', id)
      .eq('account_id', ctx.accountId)
      .eq('status', 'pending')
      .select('id')
      .maybeSingle()
    if (error) {
      console.error('[api] scheduled message cancel failed:', error.message)
      return NextResponse.json({ error: 'Could not cancel the message.' }, { status: 500 })
    }
    if (!data) {
      return NextResponse.json({ error: 'It was already sent, cancelled or is being sent right now.' }, { status: 409 })
    }
    return NextResponse.json({ ok: true })
  } catch (err) {
    return toErrorResponse(err)
  }
}
