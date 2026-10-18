// ============================================================
// POST /api/inbox/notes
//   { conversation_id, body, mentions?: string[] } → { note }
//
// An internal note on a chat: visible to the team only, never sent to the
// customer (notes live in their own table, see migration 067). Mentioned
// teammates get an in-app notification. Mentions are validated against the
// caller's own account before anything is written, because notifications
// can only be created with the service role.
// ============================================================

import { NextResponse } from 'next/server'

import { requireRole, toErrorResponse } from '@/lib/auth/account'
import { supabaseAdmin } from '@/lib/automations/admin-client'
import { accountCanSend } from '@/lib/billing/server'
import { notifyMentions } from '@/lib/push/expo'
import { parseNoteInput } from '@/lib/inbox/mentions'
import { checkRateLimit, RATE_LIMITS, rateLimitResponse } from '@/lib/rate-limit'

export async function POST(request: Request) {
  try {
    const ctx = await requireRole('agent')

    const limit = checkRateLimit(`note:${ctx.userId}`, RATE_LIMITS.send)
    if (!limit.success) return rateLimitResponse(limit)

    // Trial/plan over: the account is read-only.
    if (!(await accountCanSend(ctx.accountId))) {
      return NextResponse.json({ error: 'Your plan has expired. Renew to add notes.' }, { status: 402 })
    }

    const parsed = parseNoteInput(await request.json().catch(() => null))
    if (!parsed.ok) return NextResponse.json({ error: parsed.error }, { status: 400 })
    const { conversationId, body, mentions } = parsed.value

    const { data: conversation } = await ctx.supabase
      .from('conversations')
      .select('id, contact_id, contact:contacts(name, phone)')
      .eq('id', conversationId)
      .eq('account_id', ctx.accountId)
      .maybeSingle()
    if (!conversation) return NextResponse.json({ error: 'Conversation not found' }, { status: 404 })

    const admin = supabaseAdmin()

    // Only real members of this account, never yourself.
    let recipients: Array<{ user_id: string }> = []
    if (mentions.length > 0) {
      const { data: people } = await admin
        .from('profiles')
        .select('user_id')
        .eq('account_id', ctx.accountId)
        .in('user_id', mentions)
      recipients = (people ?? []).filter((p) => p.user_id !== ctx.userId)
    }
    const validMentions = recipients.map((r) => r.user_id)

    // RLS enforces: agent+, author = caller, conversation in this account.
    const { data: note, error } = await ctx.supabase
      .from('conversation_notes')
      .insert({
        account_id: ctx.accountId,
        conversation_id: conversationId,
        author_id: ctx.userId,
        body,
        mentions: validMentions,
      })
      .select('id, conversation_id, author_id, body, mentions, created_at')
      .single()
    if (error || !note) {
      console.error('[notes] insert failed:', error?.message)
      return NextResponse.json({ error: 'Could not save the note. Try again.' }, { status: 500 })
    }

    if (recipients.length > 0) {
      const { data: me } = await admin
        .from('profiles')
        .select('full_name, email')
        .eq('account_id', ctx.accountId)
        .eq('user_id', ctx.userId)
        .maybeSingle()
      const actorName = me?.full_name || me?.email || 'A teammate'
      const contact = Array.isArray(conversation.contact) ? conversation.contact[0] : conversation.contact
      const contactName = contact?.name || contact?.phone || 'a customer'
      const snippet = body.length > 140 ? `${body.slice(0, 137)}...` : body

      const { error: notifyError } = await admin.from('notifications').insert(
        recipients.map((r) => ({
          account_id: ctx.accountId,
          user_id: r.user_id,
          type: 'mention',
          conversation_id: conversation.id,
          contact_id: conversation.contact_id,
          actor_user_id: ctx.userId,
          title: `${actorName} mentioned you in a note`,
          body: `${contactName}: ${snippet}`,
        })),
      )
      // The note is saved either way; a failed notification is only logged.
      if (notifyError) console.error('[notes] mention notification failed:', notifyError.message)

      // Phone push for the mentioned teammates. Never throws.
      await notifyMentions({
        conversationId: conversation.id,
        contactId: conversation.contact_id,
        actorUserId: ctx.userId,
        actorName,
        snippet: `${contactName}: ${snippet}`,
        mentionedUserIds: validMentions,
      })
    }

    return NextResponse.json({ note }, { status: 201 })
  } catch (err) {
    return toErrorResponse(err)
  }
}
