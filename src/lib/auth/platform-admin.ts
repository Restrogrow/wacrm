// ============================================================
// Platform-admin guard — gates /admin, the internal cross-tenant
// support view used by the Repeat Grow team. Unrelated to
// `AccountRole` (owner/admin/agent/viewer): those are scoped to one
// customer's account, this is scoped above every account.
//
// The `platform_admins` table has no client-side RLS policies (see
// migration 030), so this must always read it through the
// service-role client, never the user-scoped SSR client.
// ============================================================

import { notFound, redirect } from "next/navigation";

import { createClient } from "@/lib/supabase/server";
import { supabaseAdmin } from "@/lib/flows/admin-client";

export async function isPlatformAdmin(userId: string): Promise<boolean> {
  const { data, error } = await supabaseAdmin()
    .from("platform_admins")
    .select("user_id")
    .eq("user_id", userId)
    .maybeSingle();

  if (error) {
    console.error("[isPlatformAdmin] lookup failed:", error);
    return false;
  }
  return data !== null;
}

/**
 * Guard for /admin server components/layouts. Redirects to /login
 * when signed out; 404s (not 403 — don't confirm the route exists to
 * a signed-in non-admin) when signed in but not a platform admin.
 */
export async function requirePlatformAdmin(): Promise<{
  userId: string;
  email: string | null;
}> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    redirect("/login");
  }
  if (!(await isPlatformAdmin(user.id))) {
    notFound();
  }

  return { userId: user.id, email: user.email ?? null };
}
