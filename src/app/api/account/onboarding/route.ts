// ============================================================
// /api/account/onboarding
//
//   POST — save the business details the signup form normally
//          collects. Owner only.
//
// Google signups skip /signup, so their account starts without a
// business name, mobile number, nature of business or team size.
// /onboarding posts here to fill those in — same columns
// handle_new_user() writes for email signups (migration 029).
// ============================================================

import { NextResponse } from "next/server";

import { requireRole, toErrorResponse } from "@/lib/auth/account";
import {
  NATURE_OF_BUSINESS_OPTIONS,
  TEAM_SIZE_OPTIONS,
} from "@/lib/auth/business-profile";

const MAX_LEN = 80;

function field(body: Record<string, unknown> | null, key: string): string {
  const value = body?.[key];
  return typeof value === "string" ? value.trim() : "";
}

export async function POST(request: Request) {
  try {
    const ctx = await requireRole("owner");

    const body = (await request.json().catch(() => null)) as Record<
      string,
      unknown
    > | null;

    const fullName = field(body, "full_name");
    const businessName = field(body, "business_name");
    const mobileNumber = field(body, "mobile_number");
    const natureOfBusiness = field(body, "nature_of_business");
    const teamSize = field(body, "team_size");

    if (!fullName || !businessName || !mobileNumber) {
      return NextResponse.json(
        { error: "Name, business name and mobile number are required" },
        { status: 400 },
      );
    }
    if ([fullName, businessName, mobileNumber].some((v) => v.length > MAX_LEN)) {
      return NextResponse.json(
        { error: `Fields must be ${MAX_LEN} characters or fewer` },
        { status: 400 },
      );
    }
    if (!/^\+?[\d\s()-]{6,20}$/.test(mobileNumber)) {
      return NextResponse.json(
        { error: "Please enter a valid mobile number" },
        { status: 400 },
      );
    }
    if (!NATURE_OF_BUSINESS_OPTIONS.includes(natureOfBusiness)) {
      return NextResponse.json(
        { error: "Please select the nature of your business" },
        { status: 400 },
      );
    }
    if (!TEAM_SIZE_OPTIONS.includes(teamSize)) {
      return NextResponse.json(
        { error: "Please select your team size" },
        { status: 400 },
      );
    }

    // RLS: profiles_update allows a user to update their own row;
    // accounts_update allows admin+ (the caller is the owner).
    const [{ error: profileErr }, { error: accountErr }] = await Promise.all([
      ctx.supabase
        .from("profiles")
        .update({ full_name: fullName, mobile_number: mobileNumber })
        .eq("user_id", ctx.userId),
      ctx.supabase
        .from("accounts")
        .update({
          name: businessName,
          nature_of_business: natureOfBusiness,
          team_size: teamSize,
        })
        .eq("id", ctx.accountId),
    ]);

    if (profileErr || accountErr) {
      console.error(
        "[POST /api/account/onboarding] update error:",
        profileErr ?? accountErr,
      );
      return NextResponse.json(
        { error: "Failed to save your details" },
        { status: 500 },
      );
    }

    return NextResponse.json({ ok: true });
  } catch (err) {
    return toErrorResponse(err);
  }
}
