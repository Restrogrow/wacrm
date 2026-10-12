import { NextResponse, type NextRequest } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { safeNextPath } from "@/lib/auth/safe-next";

// Supabase's auth emails (password reset, signup confirmation, invites)
// land here with a PKCE `code` query param. We exchange it for a session
// (sets the sb-* cookies) then forward the user to wherever the original
// `redirectTo` call asked for via `next` — e.g. forgot-password sends
// `next=/reset-password`.
//
// `next` must stay same-origin — see safeNextPath.

export async function GET(request: NextRequest) {
  const { searchParams, origin } = new URL(request.url);
  const code = searchParams.get("code");
  const next = safeNextPath(searchParams.get("next"));

  if (code) {
    const supabase = await createClient();
    const { error } = await supabase.auth.exchangeCodeForSession(code);
    if (!error) {
      return NextResponse.redirect(`${origin}${next}`);
    }
  }

  return NextResponse.redirect(`${origin}/login?error=auth-callback-failed`);
}
