// ============================================================
// /api/account/delete — "Delete my account" (request only)
//
//   GET    — what deleting would mean for the caller, and any open
//            request.
//   POST   — { confirm: "<your email>", reason? } files a deletion
//            request. Nothing is deleted here: a platform admin
//            approves it on /admin (lib/account/deletion.ts).
//   DELETE — cancel your open request.
// ============================================================

import { NextResponse } from 'next/server'

import { getCurrentAccount, toErrorResponse } from '@/lib/auth/account'
import { checkRateLimit, rateLimitResponse, RATE_LIMITS } from '@/lib/rate-limit'
import { supabaseAdmin } from '@/lib/flows/admin-client'
import { isMissingObject, notifyAdminsOfRequest, otherMemberCount } from '@/lib/account/deletion'

export const dynamic = 'force-dynamic'

const NOT_SET_UP = 'Account deletion is not set up yet. Please email support@repeatgrow.com.'

async function pendingRequest(userId: string) {
  const { data, error } = await supabaseAdmin()
    .from('account_deletion_requests')
    .select('id, requested_at, reason')
    .eq('user_id', userId)
    .eq('status', 'pending')
    .maybeSingle()
  if (error && isMissingObject(error)) return { request: null, available: false }
  return { request: data ?? null, available: !error }
}

export async function GET() {
  try {
    const ctx = await getCurrentAccount()
    const {
      data: { user },
    } = await ctx.supabase.auth.getUser()
    const isOwner = ctx.role === 'owner'
    const others = isOwner ? await otherMemberCount(ctx.accountId, ctx.userId) : 0
    const { request, available } = await pendingRequest(ctx.userId)
    return NextResponse.json({
      is_owner: isOwner,
      account_name: ctx.account.name,
      other_members: others,
      can_delete: available && (!isOwner || others === 0),
      available,
      confirm_with: user?.email ?? null,
      pending_request: request,
    })
  } catch (err) {
    return toErrorResponse(err)
  }
}

export async function POST(request: Request) {
  try {
    const ctx = await getCurrentAccount()

    const limit = checkRateLimit(`account:delete:${ctx.userId}`, RATE_LIMITS.accountDelete)
    if (!limit.success) return rateLimitResponse(limit)

    const {
      data: { user },
    } = await ctx.supabase.auth.getUser()
    if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

    const body = (await request.json().catch(() => null)) as { confirm?: unknown; reason?: unknown } | null
    const confirm = typeof body?.confirm === 'string' ? body.confirm.trim().toLowerCase() : ''
    const expected = (user.email ?? '').trim().toLowerCase()
    if (!expected || confirm !== expected) {
      return NextResponse.json({ error: 'Type your email address exactly to confirm.' }, { status: 400 })
    }
    const reason = typeof body?.reason === 'string' ? body.reason.trim().slice(0, 1000) || null : null

    const isOwner = ctx.role === 'owner'
    if (isOwner) {
      const others = await otherMemberCount(ctx.accountId, ctx.userId)
      if (others > 0) {
        return NextResponse.json(
          {
            error: `Remove your ${others} teammate${others === 1 ? '' : 's'} or transfer ownership in Settings → Team members first.`,
          },
          { status: 409 },
        )
      }
    }

    const existing = await pendingRequest(ctx.userId)
    if (!existing.available) return NextResponse.json({ error: NOT_SET_UP }, { status: 503 })
    if (existing.request) {
      return NextResponse.json({ ok: true, pending_request: existing.request })
    }

    const { data: created, error } = await supabaseAdmin()
      .from('account_deletion_requests')
      .insert({
        user_id: ctx.userId,
        account_id: ctx.accountId,
        is_owner: isOwner,
        email: user.email ?? null,
        business_name: ctx.account.name,
        reason,
      })
      .select('id, requested_at, reason')
      .single()
    if (error) {
      console.error('[account/delete] request not saved:', error.message)
      return NextResponse.json({ error: 'Could not send your request. Please try again.' }, { status: 500 })
    }

    await notifyAdminsOfRequest({
      email: user.email ?? null,
      businessName: ctx.account.name,
      isOwner,
      reason,
    })

    return NextResponse.json({ ok: true, pending_request: created })
  } catch (err) {
    return toErrorResponse(err)
  }
}

export async function DELETE() {
  try {
    const ctx = await getCurrentAccount()
    const { error } = await supabaseAdmin()
      .from('account_deletion_requests')
      .update({ status: 'cancelled', decided_at: new Date().toISOString() })
      .eq('user_id', ctx.userId)
      .eq('status', 'pending')
    if (error) {
      if (isMissingObject(error)) return NextResponse.json({ error: NOT_SET_UP }, { status: 503 })
      return NextResponse.json({ error: 'Could not cancel the request.' }, { status: 500 })
    }
    return NextResponse.json({ ok: true })
  } catch (err) {
    return toErrorResponse(err)
  }
}
