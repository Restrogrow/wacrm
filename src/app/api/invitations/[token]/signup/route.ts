// ============================================================
// POST /api/invitations/[token]/signup
//
// Public. Creates an account for someone holding a VALID invite link,
// with the email already confirmed — invited teammates skip the
// "check your email" step. Normal business signups (/signup without an
// invite) still go through Supabase email verification.
//
// Why this is safe
//   - Invitations aren't bound to an email address: the link itself is
//     the credential (256-bit token; see /join/[token]). Whoever holds
//     a valid link can already join the account, so pre-confirming the
//     email they choose grants nothing the link didn't.
//   - The invite is checked (peek_invitation) before any user is
//     created; used / expired / unknown tokens are refused.
//   - Per-IP rate limit, same bucket shape as redeem.
//
// The client then signs in with the password and calls /redeem, which
// moves the new user into the inviting account.
// ============================================================

import { NextResponse } from "next/server";

import { hashInviteToken } from "@/lib/auth/invitations";
import { supabaseAdmin } from "@/lib/flows/admin-client";
import {
  checkRateLimit,
  rateLimitResponse,
  RATE_LIMITS,
} from "@/lib/rate-limit";
import { createClient } from "@/lib/supabase/server";

function getClientIp(request: Request): string {
  const xff = request.headers.get("x-forwarded-for");
  if (xff) return xff.split(",")[0].trim();
  const xri = request.headers.get("x-real-ip");
  if (xri) return xri.trim();
  return "unknown";
}

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

export async function POST(
  request: Request,
  { params }: { params: Promise<{ token: string }> },
) {
  const ip = getClientIp(request);
  const limit = checkRateLimit(`invite-signup:${ip}`, RATE_LIMITS.invitationRedeem);
  if (!limit.success) return rateLimitResponse(limit);

  const { token } = await params;
  const body = (await request.json().catch(() => null)) as {
    full_name?: string;
    email?: string;
    password?: string;
  } | null;
  const fullName = body?.full_name?.trim().slice(0, 120) ?? "";
  const email = body?.email?.trim().toLowerCase() ?? "";
  const password = body?.password ?? "";

  if (!token) {
    return NextResponse.json({ error: "Missing invitation token" }, { status: 400 });
  }
  if (!fullName) {
    return NextResponse.json({ error: "Please enter your name" }, { status: 400 });
  }
  if (!EMAIL_RE.test(email)) {
    return NextResponse.json({ error: "Please enter a valid email" }, { status: 400 });
  }
  if (password.length < 6) {
    return NextResponse.json(
      { error: "Password must be at least 6 characters" },
      { status: 400 },
    );
  }

  // Only a live invitation may create a pre-confirmed account.
  const supabase = await createClient();
  const { data: peek, error: peekErr } = await supabase.rpc("peek_invitation", {
    p_token_hash: hashInviteToken(token),
  });
  if (peekErr) {
    console.error("[invite-signup] peek error:", peekErr);
    return NextResponse.json({ error: "Could not check the invitation" }, { status: 500 });
  }
  if (!(peek as { ok?: boolean } | null)?.ok) {
    return NextResponse.json(
      { error: "This invitation is no longer valid. Ask for a new link." },
      { status: 400 },
    );
  }

  const { error: createErr } = await supabaseAdmin().auth.admin.createUser({
    email,
    password,
    email_confirm: true,
    user_metadata: { full_name: fullName },
  });
  if (createErr) {
    const msg = createErr.message ?? "";
    if (
      (createErr as { code?: string }).code === "email_exists" ||
      /already (been )?registered|already exists/i.test(msg)
    ) {
      return NextResponse.json(
        {
          error: "An account with this email already exists — use “I already have an account” to sign in and join.",
          code: "email_exists",
        },
        { status: 409 },
      );
    }
    console.error("[invite-signup] createUser error:", createErr);
    return NextResponse.json({ error: msg || "Could not create the account" }, { status: 500 });
  }

  return NextResponse.json({ ok: true });
}
