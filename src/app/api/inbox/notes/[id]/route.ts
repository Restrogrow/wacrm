// DELETE /api/inbox/notes/[id] — remove a note. RLS lets the author (or an
// account admin) delete; anyone else matches no row and gets a 404.

import { NextResponse } from 'next/server'

import { requireRole, toErrorResponse } from '@/lib/auth/account'

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

export async function DELETE(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const ctx = await requireRole('agent')
    const { id } = await params
    if (!UUID_RE.test(id)) return NextResponse.json({ error: 'Note not found' }, { status: 404 })

    const { data, error } = await ctx.supabase
      .from('conversation_notes')
      .delete()
      .eq('id', id)
      .eq('account_id', ctx.accountId)
      .select('id')
    if (error) {
      console.error('[notes] delete failed:', error.message)
      return NextResponse.json({ error: 'Could not delete the note.' }, { status: 500 })
    }
    if (!data || data.length === 0) return NextResponse.json({ error: 'Note not found' }, { status: 404 })
    return NextResponse.json({ ok: true })
  } catch (err) {
    return toErrorResponse(err)
  }
}
