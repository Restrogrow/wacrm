// ============================================================
// POST /api/inbox/conversations/[id]/share
//   { user_ids: string[], note?: string } → { shared, names }
//
// "Share this chat with teammates": separate from ASSIGNING it. The
// assignee owns the chat; people you share it with just get a
// notification linking to it (and an internal note is left on the
// contact so the team can see who was looped in). Every member of the
// account can already open every chat, so this grants nothing new — it
// points the right people at it. No customer message is sent.
//
// Notifications can only be written with the service role (there is no
// client INSERT policy), so recipients are validated here first: they
// must belong to the caller's own account.
// ============================================================

import { NextResponse } from 'next/server'

import { requireRole, toErrorResponse } from '@/lib/auth/account'
import { supabaseAdmin } from '@/lib/automations/admin-client'
import { checkRateLimit, RATE_LIMITS, rateLimitResponse } from '@/lib/rate-limit'

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i
const MAX_RECIPIENTS = 10
const MAX_NOTE = 300

export async function POST(request: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const ctx = await requireRole('agent')
    const { id } = await params
    if (!UUID_RE.test(id)) return NextResponse.json({ error: 'Conversation not found' }, { status: 404 })

    const limit = checkRateLimit(`share:${ctx.userId}`, RATE_LIMITS.send)
    if (!limit.success) return rateLimitResponse(limit)

    const body = (await request.json().catch(() => null)) as { user_ids?: unknown; note?: unknown } | null
    const requested = Array.isArray(body?.user_ids)
      ? Array.from(new Set(body.user_ids.filter((v): v is string => typeof v === 'string' && UUID_RE.test(v))))
      : []
    const note = typeof body?.note === 'string' ? body.note.trim().slice(0, MAX_NOTE) : ''
    if (requested.length === 0) {
      return NextResponse.json({ error: 'Pick at least one teammate.' }, { status: 400 })
    }
    if (requested.length > MAX_RECIPIENTS) {
      return NextResponse.json({ error: `Share with up to ${MAX_RECIPIENTS} people at a time.` }, { status: 400 })
    }

    const { data: conversation } = await ctx.supabase
      .from('conversations')
      .select('id, contact_id, contact:contacts(name, phone)')
      .eq('id', id)
      .eq('account_id', ctx.accountId)
      .maybeSingle()
    if (!conversation) return NextResponse.json({ error: 'Conversation not found' }, { status: 404 })

    const admin = supabaseAdmin()

    // Only people who actually belong to this account, and not yourself.
    const { data: people } = await admin
      .from('profiles')
      .select('user_id, full_name, email')
      .eq('account_id', ctx.accountId)
      .in('user_id', requested)
    const recipients = (people ?? []).filter((p) => p.user_id !== ctx.userId)
    if (recipients.length === 0) {
      return NextResponse.json({ error: 'Those teammates are not in this account.' }, { status: 400 })
    }

    const { data: me } = await admin
      .from('profiles')
      .select('full_name, email')
      .eq('account_id', ctx.accountId)
      .eq('user_id', ctx.userId)
      .maybeSingle()
    const actorName = me?.full_name || me?.email || 'A teammate'

    const contact = Array.isArray(conversation.contact) ? conversation.contact[0] : conversation.contact
    const contactName = contact?.name || contact?.phone || 'a customer'

    const { error: notifyError } = await admin.from('notifications').insert(
      recipients.map((r) => ({
        account_id: ctx.accountId,
        user_id: r.user_id,
        type: 'conversation_assigned',
        conversation_id: conversation.id,
        contact_id: conversation.contact_id,
        actor_user_id: ctx.userId,
        title: `${actorName} shared a chat with you`,
        body: note ? `${contactName} — ${note}` : contactName,
      })),
    )
    if (notifyError) {
      return NextResponse.json({ error: 'Could not notify your teammates. Try again.' }, { status: 500 })
    }

    const names = recipients.map((r) => r.full_name || r.email)

    // Leave a visible trail in the contact's internal notes. Best effort —
    // the notifications above are what matter.
    await ctx.supabase.from('contact_notes').insert({
      contact_id: conversation.contact_id,
      user_id: ctx.userId,
      account_id: ctx.accountId,
      note_text: `Shared with ${names.join(', ')} by ${actorName}${note ? `: ${note}` : ''}`,
    })

    return NextResponse.json({ shared: recipients.length, names })
  } catch (err) {
    return toErrorResponse(err)
  }
}
