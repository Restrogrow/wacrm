// ============================================================
// Onboarding state — server-only (imports the SSR Supabase client).
//
// Account owners whose business details are missing (Google signups,
// or accounts created before migration 029) are sent to /onboarding
// by the dashboard layout. Invited teammates are never prompted: the
// business details describe the account they joined, which its owner
// already set up.
// ============================================================

import { createClient } from "@/lib/supabase/server";
import { isBusinessProfileComplete } from "./business-profile";

export interface OnboardingState {
  fullName: string;
  email: string;
  mobileNumber: string;
  businessName: string;
  natureOfBusiness: string;
  teamSize: string;
  needsOnboarding: boolean;
}

/** Returns null when there's no signed-in user or linked account. */
export async function loadOnboardingState(): Promise<OnboardingState | null> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return null;

  const { data: profile } = await supabase
    .from("profiles")
    .select("full_name, mobile_number, account_id, account_role")
    .eq("user_id", user.id)
    .maybeSingle();
  if (!profile?.account_id) return null;

  const { data: account } = await supabase
    .from("accounts")
    .select("name, nature_of_business, team_size")
    .eq("id", profile.account_id)
    .maybeSingle();
  if (!account) return null;

  const fullName =
    profile.full_name ||
    (user.user_metadata?.full_name as string | undefined) ||
    (user.user_metadata?.name as string | undefined) ||
    "";
  const email = user.email ?? "";

  // handle_new_user() falls back to the person's name / email as the
  // account name when no business name was given — don't prefill that
  // as if it were a real business name.
  const businessName =
    account.name && account.name !== fullName && account.name !== email
      ? account.name
      : "";

  return {
    fullName,
    email,
    mobileNumber: profile.mobile_number ?? "",
    businessName,
    natureOfBusiness: account.nature_of_business ?? "",
    teamSize: account.team_size ?? "",
    needsOnboarding:
      profile.account_role === "owner" &&
      !isBusinessProfileComplete({
        natureOfBusiness: account.nature_of_business,
        teamSize: account.team_size,
        mobileNumber: profile.mobile_number,
      }),
  };
}
