import { NextResponse } from 'next/server'

import { requirePlatformAdmin } from '@/lib/auth/platform-admin'
import { supabaseAdmin } from '@/lib/flows/admin-client'
import {
  DeletionError,
  executeAccountDeletion,
  notifyUserOfDecision,
} from '@/lib/account/deletion'

/**
 * POST /api/admin/deletion-requests/[id] — platform admin only.
 *
 * { action: "approve" | "reject", note? }
 *
 * approve — deletes the user (and an owner's business) via
 *           executeAccountDeletion, then marks the request approved and
 *           clears the email / business name kept for review.
 * reject  — keeps the account; the note is emailed to the user.
 */
export async function POST(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const adminUser = await requirePlatformAdmin()
  const { id } = await params

  const body = (await request.json().catch(() => null)) as { action?: unknown; note?: unknown } | null
  const action = body?.action
  if (action !== 'approve' && action !== 'reject') {
    return NextResponse.json({ error: 'Choose approve or reject' }, { status: 400 })
  }
  const note = typeof body?.note === 'string' ? body.note.trim().slice(0, 1000) || null : null

  const db = supabaseAdmin()
  const { data: req, error } = await db
    .from('account_deletion_requests')
    .select('id, user_id, email, status')
    .eq('id', id)
    .maybeSingle()
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  if (!req) return NextResponse.json({ error: 'Request not found' }, { status: 404 })
  if (req.status !== 'pending') {
    return NextResponse.json({ error: `This request is already ${req.status}.` }, { status: 409 })
  }

  const decided = { decided_at: new Date().toISOString(), decided_by: adminUser.userId, admin_note: note }

  if (action === 'reject') {
    const { error: updError } = await db
      .from('account_deletion_requests')
      .update({ status: 'rejected', ...decided })
      .eq('id', id)
      .eq('status', 'pending')
    if (updError) return NextResponse.json({ error: updError.message }, { status: 500 })
    await notifyUserOfDecision(req.email, 'rejected', note)
    return NextResponse.json({ ok: true, status: 'rejected' })
  }

  let deletedBusiness = false
  try {
    ;({ deletedBusiness } = await executeAccountDeletion(req.user_id))
  } catch (err) {
    if (err instanceof DeletionError) {
      return NextResponse.json({ error: err.message }, { status: err.status })
    }
    console.error('[admin/deletion-requests] approve failed:', err)
    return NextResponse.json({ error: 'Deletion failed. Nothing more was changed.' }, { status: 500 })
  }

  await notifyUserOfDecision(req.email, 'approved', note)
  await db
    .from('account_deletion_requests')
    .update({ status: 'approved', email: null, business_name: null, ...decided })
    .eq('id', id)

  return NextResponse.json({ ok: true, status: 'approved', deleted_business: deletedBusiness })
}
