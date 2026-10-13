// ============================================================
// /api/account/delete — "Delete my account"
//
//   GET  — what deleting would do for the caller (owner vs teammate,
//          teammates still in the account, the email to confirm with).
//   POST — { confirm: "<your email>" } deletes the caller's login.
//
// Owner:    deletes the whole business account and all its data.
//           Refused while teammates are still in it.
// Teammate: deletes only their login; business data they created is
//           handed to the owner (migration 046 prepare_user_deletion).
//
// Order matters: integrations are disconnected first (best effort),
// then prepare_user_deletion removes / reassigns rows, then the auth
// user is deleted. If the last step fails the user can simply retry.
// ============================================================

import { NextResponse } from 'next/server'

import { getCurrentAccount, toErrorResponse } from '@/lib/auth/account'
import { checkRateLimit, rateLimitResponse, RATE_LIMITS } from '@/lib/rate-limit'
import { supabaseAdmin } from '@/lib/flows/admin-client'
import { decrypt } from '@/lib/whatsapp/encryption'
import { deleteWebhookSubscription, friendlyCalendlyError } from '@/lib/calendly/api'

export const dynamic = 'force-dynamic'

async function otherMemberCount(accountId: string, userId: string): Promise<number> {
  const { count } = await supabaseAdmin()
    .from('profiles')
    .select('user_id', { count: 'exact', head: true })
    .eq('account_id', accountId)
    .neq('user_id', userId)
  return count ?? 0
}

export async function GET() {
  try {
    const ctx = await getCurrentAccount()
    const {
      data: { user },
    } = await ctx.supabase.auth.getUser()
    const isOwner = ctx.role === 'owner'
    const others = isOwner ? await otherMemberCount(ctx.accountId, ctx.userId) : 0
    return NextResponse.json({
      is_owner: isOwner,
      account_name: ctx.account.name,
      other_members: others,
      can_delete: !isOwner || others === 0,
      confirm_with: user?.email ?? null,
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

    const body = (await request.json().catch(() => null)) as { confirm?: unknown } | null
    const confirm = typeof body?.confirm === 'string' ? body.confirm.trim().toLowerCase() : ''
    const expected = (user.email ?? '').trim().toLowerCase()
    if (!expected || confirm !== expected) {
      return NextResponse.json(
        { error: 'Type your email address exactly to confirm.' },
        { status: 400 },
      )
    }

    const admin = supabaseAdmin()
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
      await disconnectIntegrations(ctx.accountId)
    }

    const { error: prepError } = await admin.rpc('prepare_user_deletion', { p_user_id: ctx.userId })
    if (prepError) {
      if (prepError.code === 'PL002') {
        return NextResponse.json({ error: prepError.message }, { status: 409 })
      }
      if (prepError.code === 'PGRST202' || /prepare_user_deletion/.test(prepError.message)) {
        return NextResponse.json(
          { error: 'Account deletion is not set up yet. Please contact support@repeatgrow.com.' },
          { status: 503 },
        )
      }
      console.error('[account/delete] prepare failed:', prepError.message)
      return NextResponse.json({ error: 'Could not delete your account. Please try again.' }, { status: 500 })
    }

    const { error: deleteError } = await admin.auth.admin.deleteUser(ctx.userId)
    if (deleteError) {
      console.error('[account/delete] auth delete failed:', deleteError.message)
      return NextResponse.json(
        { error: 'Your data was removed but signing you out failed. Please try again.' },
        { status: 500 },
      )
    }

    // Clear the session cookies; the client also signs out and redirects.
    await ctx.supabase.auth.signOut().catch(() => {})

    return NextResponse.json({ ok: true, deleted_business: isOwner })
  } catch (err) {
    return toErrorResponse(err)
  }
}

/**
 * Stop integrations from sending to an account that's about to be
 * deleted. Best effort — deletion goes ahead even if this fails.
 */
async function disconnectIntegrations(accountId: string) {
  const admin = supabaseAdmin()
  try {
    const { data: conn } = await admin
      .from('calendly_connections')
      .select('access_token, webhook_subscription_uri')
      .eq('account_id', accountId)
      .maybeSingle()
    if (conn?.webhook_subscription_uri && conn.access_token) {
      await deleteWebhookSubscription(decrypt(conn.access_token), conn.webhook_subscription_uri)
    }
  } catch (err) {
    console.warn('[account/delete] calendly subscription not removed:', friendlyCalendlyError(err))
  }
  // Shopify: OAuth stores keep sending webhooks until the merchant
  // uninstalls the app; the receiver ignores shops with no active store,
  // and the store row is deleted with the account.
}
