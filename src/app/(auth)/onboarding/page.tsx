import type { Metadata } from "next";
import { redirect } from "next/navigation";

import { loadOnboardingState } from "@/lib/auth/onboarding";
import { OnboardingForm } from "./onboarding-form";

export const metadata: Metadata = {
  title: "Complete your profile",
};

// Reached from the dashboard layout when an account owner is missing
// the business details /signup normally collects — i.e. they signed
// up with Google. Anyone who doesn't need it is sent on to the app.
export default async function OnboardingPage() {
  const state = await loadOnboardingState();
  if (!state) redirect("/login");
  if (!state.needsOnboarding) redirect("/dashboard");

  return <OnboardingForm initial={state} />;
}
