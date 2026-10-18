// ============================================================
// POST /api/inbox/conversations/bulk
//   { action: 'assign' | 'status' | 'tag' | 'mark_read', ids: string[], value? }
//   → { updated: number }
//
// Bulk actions for the inbox list. Agent role or above. Every id is checked
// against the caller's account BEFORE anything changes (one foreign id
// rejects the whole request), batches are capped at 100, and the writes go
// through the caller's own RLS-scoped client, so database rules back up the
// checks here. Assigning also fires the existing "conversation assigned"
// notification trigger for the new owner.
// ============================================================

import { NextResponse } from 'next/server'

import { requireRole, toErrorResponse } from '@/lib/auth/account'
import { supabaseAdmin } from '@/lib/automations/admin-client'
import { accountCanSend } from '@/lib/billing/server'
import { parseBulkRequest } from '@/lib/inbox/bulk'
import { notifyAssignment } from '@/lib/push/expo'
import { checkRateLimit, RATE_LIMITS, rateLimitResponse } from '@/lib/rate-limit'

export async function POST(request: Request) {
  try {
    const ctx = await requireRole('agent')

    const limit = checkRateLimit(`inbox-bulk:${ctx.userId}`, RATE_LIMITS.send)
    if (!limit.success) return rateLimitResponse(limit)

    if (!(await accountCanSend(ctx.accountId))) {
      return NextResponse.json({ error: 'Your plan has expired. Renew to make changes.' }, { status: 402 })
    }

    const parsed = parseBulkRequest(await request.json().catch(() => null))
    if (!parsed.ok) return NextResponse.json({ error: parsed.error }, { status: 400 })
    const req = parsed.value

    // Account isolation: every id must be a conversation of this account.
    const { data: owned, error: ownedError } = await ctx.supabase
      .from('conversations')
      .select('id, contact_id')
      .eq('account_id', ctx.accountId)
      .in('id', req.ids)
    if (ownedError) {
      console.error('[inbox-bulk] lookup failed:', ownedError.message)
      return NextResponse.json({ error: 'Something went wrong. Please try again.' }, { status: 500 })
    }
    if ((owned ?? []).length !== req.ids.length) {
      return NextResponse.json({ error: 'Some conversations were not found.' }, { status: 404 })
    }

    switch (req.action) {
      case 'assign': {
        if (req.userId) {
          // The new owner must belong to this account.
          const { data: member } = await supabaseAdmin()
            .from('profiles')
            .select('user_id')
            .eq('account_id', ctx.accountId)
            .eq('user_id', req.userId)
            .maybeSingle()
          if (!member) return NextResponse.json({ error: 'That teammate is not in this account.' }, { status: 400 })
        }
        const { error } = await ctx.supabase
          .from('conversations')
          .update({ assigned_agent_id: req.userId })
          .eq('account_id', ctx.accountId)
          .in('id', req.ids)
        if (error) return fail('assign', error.message)
        // Phone push for the new assignee (one summary push for a batch).
        if (req.userId && req.userId !== ctx.userId) {
          await notifyAssignment({
            conversationId: req.ids[0],
            assignedUserId: req.userId,
            actorUserId: ctx.userId,
            count: req.ids.length,
          })
        }
        break
      }
      case 'status': {
        const { error } = await ctx.supabase
          .from('conversations')
          .update({ status: req.status })
          .eq('account_id', ctx.accountId)
          .in('id', req.ids)
        if (error) return fail('status', error.message)
        break
      }
      case 'mark_read': {
        const { error } = await ctx.supabase
          .from('conversations')
          .update({ unread_count: 0 })
          .eq('account_id', ctx.accountId)
          .in('id', req.ids)
        if (error) return fail('mark_read', error.message)
        break
      }
      case 'tag': {
        // Tags belong to contacts. The tag must be one of this account's.
        const { data: tag } = await ctx.supabase
          .from('tags')
          .select('id')
          .eq('id', req.tagId)
          .eq('account_id', ctx.accountId)
          .maybeSingle()
        if (!tag) return NextResponse.json({ error: 'Tag not found.' }, { status: 404 })

        const contactIds = Array.from(new Set((owned ?? []).map((c) => c.contact_id as string)))
        const { error } = await ctx.supabase
          .from('contact_tags')
          .upsert(
            contactIds.map((contact_id) => ({ contact_id, tag_id: req.tagId })),
            { onConflict: 'contact_id,tag_id', ignoreDuplicates: true },
          )
        if (error) return fail('tag', error.message)
        break
      }
    }

    return NextResponse.json({ updated: req.ids.length })
  } catch (err) {
    return toErrorResponse(err)
  }
}

function fail(action: string, message: string) {
  console.error(`[inbox-bulk] ${action} failed:`, message)
  return NextResponse.json({ error: 'Something went wrong. Please try again.' }, { status: 500 })
}
