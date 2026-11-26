import type { Metadata } from "next";
import type { ReactNode } from "react";
import Link from "next/link";

import { BrandMark } from "@/components/brand-mark";
import { ImpersonationBanner } from "@/components/layout/impersonation-banner";

// Standalone shell for /partner — no sidebar, no workspace chrome, works
// for a signed-out visitor as well as a signed-in partner. Previously
// this page lived inside the logged-in dashboard, which forced every
// visitor through login (and, for a brand-new signup, the business
// onboarding flow) just to see the pitch. See src/proxy.ts — /partner
// was removed from `protectedPaths` so a signed-out visitor can land here.
export const metadata: Metadata = {
  title: "Partner program — Repeat Grow",
  description:
    "Bring businesses to Repeat Grow and earn a share of everything they pay for their first 12 months.",
};

export default function PartnerLayout({ children }: { children: ReactNode }) {
  return (
    <div className="min-h-screen bg-background">
      <header className="border-b border-border">
        <div className="mx-auto flex max-w-6xl items-center gap-2 px-4 py-4 sm:px-6">
          <Link href="/" className="flex items-center gap-2">
            <BrandMark className="size-8 rounded-xl" />
            <span className="font-bold tracking-tight text-foreground">Repeat Grow</span>
          </Link>
        </div>
      </header>
      <ImpersonationBanner />
      <main className="px-4 py-8 sm:px-6">{children}</main>
    </div>
  );
}
