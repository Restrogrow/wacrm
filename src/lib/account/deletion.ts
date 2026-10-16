// ============================================================
// Account deletion — request (user) → approve / reject (platform
// admin) → delete.
//
// Users file a request in Settings → Your data
// (POST /api/account/delete). Nothing is deleted until a platform
// admin approves it on /admin (POST /api/admin/deletion-requests/:id),
// which calls executeAccountDeletion below.
//
// executeAccountDeletion:
//   1. owner: refuse if teammates remain; disconnect Calendly;
//   2. prepare_user_deletion (migration 046) — deletes the owner's
//      business, or reassigns a teammate's rows to the owner;
//   3. deletes the auth user.
// ============================================================

import { supabaseAdmin } from '@/lib/flows/admin-client'
import { decrypt } from '@/lib/whatsapp/encryption'
import { deleteWebhookSubscription, friendlyCalendlyError } from '@/lib/calendly/api'
import { isEmailConfigured, sendEmail } from '@/lib/email/mailer'
import { deletionDecisionEmail, deletionRequestAdminEmail, type BuiltEmail } from '@/lib/email/content'
import { SITE_URL, SUPPORT_EMAIL } from '@/lib/seo'

export class DeletionError extends Error {
  constructor(
    message: string,
    readonly status: number,
  ) {
    super(message)
    this.name = 'DeletionError'
  }
}

/** Postgres / PostgREST "table or function missing" — a migration wasn't run. */
export function isMissingObject(error: { code?: string; message?: string } | null): boolean {
  if (!error) return false
  return (
    error.code === '42P01' ||
    error.code === 'PGRST202' ||
    error.code === 'PGRST205' ||
    /does not exist|schema cache|Could not find/i.test(error.message ?? '')
  )
}

/** Teammates in the account other than this user. */
export async function otherMemberCount(accountId: string, userId: string): Promise<number> {
  const { count } = await supabaseAdmin()
    .from('profiles')
    .select('user_id', { count: 'exact', head: true })
    .eq('account_id', accountId)
    .neq('user_id', userId)
  return count ?? 0
}

/**
 * Delete a user (and, for an owner, their business). Only called after
 * a platform admin approves the request.
 */
export async function executeAccountDeletion(userId: string): Promise<{ deletedBusiness: boolean }> {
  const admin = supabaseAdmin()

  const { data: owned } = await admin
    .from('accounts')
    .select('id')
    .eq('owner_user_id', userId)
    .maybeSingle()

  if (owned) {
    const others = await otherMemberCount(owned.id, userId)
    if (others > 0) {
      throw new DeletionError(
        `The business still has ${others} teammate${others === 1 ? '' : 's'}. They must be removed or ownership transferred first.`,
        409,
      )
    }
    await disconnectIntegrations(owned.id)
  }

  const { error: prepError } = await admin.rpc('prepare_user_deletion', { p_user_id: userId })
  if (prepError) {
    if (prepError.code === 'PL002') throw new DeletionError(prepError.message, 409)
    if (isMissingObject(prepError)) {
      throw new DeletionError('Run migration 046_account_deletion.sql first.', 503)
    }
    console.error('[account-deletion] prepare failed:', prepError.message)
    throw new DeletionError('Could not prepare the deletion. Nothing was deleted.', 500)
  }

  const { error: deleteError } = await admin.auth.admin.deleteUser(userId)
  if (deleteError) {
    console.error('[account-deletion] auth delete failed:', deleteError.message)
    throw new DeletionError('Data was removed but the login could not be deleted. Approve again to retry.', 500)
  }

  return { deletedBusiness: !!owned }
}

/** Stop Calendly sending to an account that's about to be deleted. Best effort. */
async function disconnectIntegrations(accountId: string) {
  try {
    const { data: conn } = await supabaseAdmin()
      .from('calendly_connections')
      .select('access_token, webhook_subscription_uri')
      .eq('account_id', accountId)
      .maybeSingle()
    if (conn?.webhook_subscription_uri && conn.access_token) {
      await deleteWebhookSubscription(decrypt(conn.access_token), conn.webhook_subscription_uri)
    }
  } catch (err) {
    console.warn('[account-deletion] calendly subscription not removed:', friendlyCalendlyError(err))
  }
  // Shopify: OAuth stores keep sending webhooks until the merchant
  // uninstalls the app; the receiver ignores shops with no store row.
}

// ------------------------------------------------------------
// Emails (best effort — never block the request or the decision)
// ------------------------------------------------------------

function adminAlertRecipients(): string[] {
  const raw = process.env.ADMIN_ALERT_EMAIL || SUPPORT_EMAIL
  return raw
    .split(',')
    .map((s) => s.trim())
    .filter(Boolean)
}

async function safeSend(message: { to: string[] } & BuiltEmail) {
  if (!isEmailConfigured() || message.to.length === 0) return
  try {
    await sendEmail(message)
  } catch (err) {
    console.warn('[account-deletion] email not sent:', err instanceof Error ? err.message : err)
  }
}

function escapeHtml(s: string): string {
  return s.replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]!)
}

export async function notifyAdminsOfRequest(req: {
  email: string | null
  businessName: string | null
  isOwner: boolean
  reason: string | null
}) {
  await safeSend({ to: adminAlertRecipients(), ...deletionRequestAdminEmail(req) })
}

export async function notifyUserOfDecision(
  email: string | null,
  decision: 'approved' | 'rejected',
  note: string | null,
) {
  if (!email) return
  await safeSend({ to: [email], ...deletionDecisionEmail(decision, note) })
}
