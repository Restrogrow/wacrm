import type { Metadata } from "next";

import { requirePlatformAdmin } from "@/lib/auth/platform-admin";

// robots.ts already disallows /admin at the crawler level; this is
// belt-and-suspenders the same way (dashboard)/layout.tsx is for the
// tenant app.
export const metadata: Metadata = {
  title: "Admin",
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

export default async function PlatformAdminLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  await requirePlatformAdmin();

  return <div className="min-h-screen bg-background text-foreground">{children}</div>;
}
