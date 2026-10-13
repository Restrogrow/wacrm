import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { loadOnboardingState } from "@/lib/auth/onboarding";
import { DashboardShell } from "./dashboard-shell";

// Server layout whose only job is to declare "do not index" metadata
// for the authed app. robots.ts already disallows these paths at the
// crawler-level and middleware redirects unauthenticated visitors, so
// this is belt-and-suspenders — but SEO-critical if a URL ever leaks
// via a link shared externally.
export const metadata: Metadata = {
  robots: {
    index: false,
    follow: false,
    nocache: true,
    googleBot: {
      index: false,
      follow: false,
      noimageindex: true,
    },
  },
};

export default async function DashboardLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  // Google signups skip the /signup business-details form — finish it
  // before entering the app. Signed-out visitors fall through to the
  // shell's own redirect to /login.
  const onboarding = await loadOnboardingState();
  if (onboarding?.needsOnboarding) redirect("/onboarding");

  return <DashboardShell>{children}</DashboardShell>;
}
