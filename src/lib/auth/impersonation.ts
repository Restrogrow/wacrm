// ============================================================
// "Log in as this user" — platform-admin impersonation.
//
// How it works, in one paragraph: `start()` asks the Supabase admin
// API for a magic-link token for the target user and redeems it
// against the *caller's own* cookie jar. The browser ends up holding a
// genuine session for that user, so every RLS policy, `account_role`
// check and `account_id` filter in the app applies exactly as it would
// for the real customer — impersonation adds no bypass path, which is
// the whole reason to do it this way rather than with an
// "acting-as" override threaded through the data layer.
//
// The trade-off is that the admin's own session gets overwritten.
// `stop()` undoes that by replaying the same trick in reverse, using
// the `impersonation_sessions` row (migration 034) to learn which
// admin to restore. The browser cookie holds only a random token; the
// admin's uuid never leaves the server, because anything that decides
// "log this browser in as uuid X" is a credential — see the migration
// header for the escalation this avoids.
//
// Everything here is server-only: it reads `platform_admins` and
// `impersonation_sessions`, neither of which has a client-side RLS
// policy, through the service-role client.
// ============================================================

import { createHash, randomBytes } from "node:crypto";
import { cookies } from "next/headers";

import { createClient } from "@/lib/supabase/server";
import { supabaseAdmin } from "@/lib/flows/admin-client";
import { isPlatformAdmin } from "@/lib/auth/platform-admin";

/**
 * Cookie carrying the impersonation token. `__Host-` prefixed in
 * production: the browser then refuses to accept it unless it's
 * Secure, path=/ and host-locked with no Domain attribute, which stops
 * a subdomain (a docs site, a preview deploy) from planting one.
 * Dropped on http://localhost, where `__Host-` requires Secure and
 * would therefore never be set at all.
 */
export const IMPERSONATION_COOKIE =
  process.env.NODE_ENV === "production"
    ? "__Host-rg_impersonation"
    : "rg_impersonation";

/**
 * How long the one-click way back stays valid. Long enough to actually
 * debug something, short enough that a forgotten tab doesn't leave a
 * live "become this admin" token lying around for a day.
 */
const SESSION_TTL_MS = 60 * 60 * 1000; // 1 hour

type ImpersonationRow = {
  id: string;
  admin_user_id: string;
  target_user_id: string;
  account_id: string | null;
  expires_at: string;
  ended_at: string | null;
};

function hashToken(token: string): string {
  return createHash("sha256").update(token).digest("hex");
}

/**
 * Swap the caller's session cookies for a fresh session belonging to
 * `userId`.
 *
 * `generateLink` does NOT send mail — the admin API hands back the
 * token it would have emailed, and we redeem the `hashed_token`
 * ourselves through the SSR client so the Set-Cookie headers land on
 * this response. No redirect through Supabase, nothing in the user's
 * inbox, no trace in their mail that support logged in.
 *
 * Only callable where cookies are writable (route handlers / server
 * actions); from a server component the writes are silently dropped
 * and the session would not change.
 */
async function assumeSession(userId: string): Promise<void> {
  const admin = supabaseAdmin();

  const { data: userData, error: userError } =
    await admin.auth.admin.getUserById(userId);
  if (userError || !userData.user?.email) {
    throw new Error(
      `Cannot impersonate ${userId}: no email on the auth user (${userError?.message ?? "missing"})`,
    );
  }

  const { data: link, error: linkError } = await admin.auth.admin.generateLink({
    type: "magiclink",
    email: userData.user.email,
  });
  if (linkError || !link?.properties?.hashed_token) {
    throw new Error(
      `Failed to mint a session for ${userId}: ${linkError?.message ?? "no token returned"}`,
    );
  }

  const supabase = await createClient();
  const { error: verifyError } = await supabase.auth.verifyOtp({
    type: "magiclink",
    token_hash: link.properties.hashed_token,
  });
  if (verifyError) {
    throw new Error(`Failed to establish session: ${verifyError.message}`);
  }
}

/**
 * Begin impersonating `targetUserId`. On return the caller's browser
 * is signed in as that user and holds the token needed by `stop()`.
 *
 * Caller must already have established that `adminUserId` is a
 * platform admin and that the target belongs to `accountId`.
 */
export async function startImpersonation({
  adminUserId,
  targetUserId,
  accountId,
}: {
  adminUserId: string;
  targetUserId: string;
  accountId: string;
}): Promise<void> {
  const token = randomBytes(32).toString("base64url");
  const expiresAt = new Date(Date.now() + SESSION_TTL_MS);

  // Insert BEFORE swapping the session. If the swap fails we still
  // hold the admin's session and just bin the row; the other order
  // risks landing in the target's account with no record of who we
  // were, i.e. no way back.
  const { data: row, error: insertError } = await supabaseAdmin()
    .from("impersonation_sessions")
    .insert({
      token_hash: hashToken(token),
      admin_user_id: adminUserId,
      target_user_id: targetUserId,
      account_id: accountId,
      expires_at: expiresAt.toISOString(),
    })
    .select("id")
    .single();

  if (insertError || !row) {
    throw new Error(
      `Failed to record impersonation: ${insertError?.message ?? "no row returned"}`,
    );
  }

  try {
    await assumeSession(targetUserId);
  } catch (err) {
    await supabaseAdmin()
      .from("impersonation_sessions")
      .delete()
      .eq("id", row.id);
    throw err;
  }

  const cookieStore = await cookies();
  cookieStore.set(IMPERSONATION_COOKIE, token, {
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
    path: "/",
    expires: expiresAt,
  });
}

/** Loads the live row for the cookie's token, or null. */
async function loadActiveRow(): Promise<ImpersonationRow | null> {
  const cookieStore = await cookies();
  const token = cookieStore.get(IMPERSONATION_COOKIE)?.value;
  if (!token) return null;

  const { data, error } = await supabaseAdmin()
    .from("impersonation_sessions")
    .select("id, admin_user_id, target_user_id, account_id, expires_at, ended_at")
    .eq("token_hash", hashToken(token))
    .is("ended_at", null)
    .gt("expires_at", new Date().toISOString())
    .maybeSingle<ImpersonationRow>();

  if (error) {
    console.error("[impersonation] lookup failed:", error);
    return null;
  }
  return data ?? null;
}

export interface ImpersonationState {
  adminEmail: string | null;
  targetEmail: string | null;
  accountName: string | null;
}

/**
 * Describes the impersonation in effect for the current request, for
 * the "you are impersonating X" banner. Returns null when there isn't
 * one — including the stale case where the cookie survives but the
 * browser has since signed in as somebody else, which is why the
 * row's `target_user_id` is checked against the live session rather
 * than trusted on its own.
 *
 * Read-only, so it's safe anywhere. Served to the banner through
 * GET /api/admin/impersonate/status: the banner sits in the dashboard
 * shell next to PlanBanner and BillingHoldBanner and fetches its own
 * state like they do, rather than having it threaded down as a prop.
 */
export async function getImpersonationState(): Promise<ImpersonationState | null> {
  const row = await loadActiveRow();
  if (!row) return null;

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user || user.id !== row.target_user_id) return null;

  const admin = supabaseAdmin();
  const [{ data: adminUser }, { data: account }] = await Promise.all([
    admin.auth.admin.getUserById(row.admin_user_id),
    row.account_id
      ? admin
          .from("accounts")
          .select("name")
          .eq("id", row.account_id)
          .maybeSingle<{ name: string }>()
      : Promise.resolve({ data: null }),
  ]);

  return {
    adminEmail: adminUser?.user?.email ?? null,
    targetEmail: user.email ?? null,
    accountName: account?.name ?? null,
  };
}

/**
 * End the impersonation and sign the browser back in as the admin who
 * started it.
 *
 * This is the one place that turns a cookie into "become user X", so
 * it re-checks that X is *still* a platform admin — if someone's
 * access was revoked mid-session, their token stops working rather
 * than handing the access back.
 *
 * Throws when there's nothing to stop (no cookie, expired, already
 * stopped, revoked admin) so callers can 400 rather than silently
 * doing nothing.
 */
export async function stopImpersonation(): Promise<void> {
  const row = await loadActiveRow();
  if (!row) {
    throw new Error("No active impersonation session");
  }
  if (!(await isPlatformAdmin(row.admin_user_id))) {
    throw new Error("Impersonating admin no longer has platform access");
  }

  // Burn the row first — single-use. A failure after this point costs
  // the admin a manual re-login, which is the right way to fail.
  const { error: closeError } = await supabaseAdmin()
    .from("impersonation_sessions")
    .update({ ended_at: new Date().toISOString() })
    .eq("id", row.id)
    .is("ended_at", null);

  if (closeError) {
    throw new Error(`Failed to close impersonation: ${closeError.message}`);
  }

  // Explicit path — `__Host-` cookies are pinned to "/" and the
  // delete only matches if it says so too.
  const cookieStore = await cookies();
  cookieStore.delete({ name: IMPERSONATION_COOKIE, path: "/" });

  await assumeSession(row.admin_user_id);
}
