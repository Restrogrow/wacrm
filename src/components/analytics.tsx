"use client";

import Script from "next/script";
import { usePathname } from "next/navigation";

// Google Analytics 4. Loads only when a measurement ID is set, and only on
// the public marketing pages (home, pricing, demo, blog, docs and so on).
// Signed-in app screens never load it, so customer data in the inbox and
// dashboard is never sent to Google Analytics.
// The measurement ID is public (it appears in every page that uses GA), so the
// production ID is the default. Set NEXT_PUBLIC_GA_ID to override it, or to an
// empty string to turn analytics off.
const GA_ID = process.env.NEXT_PUBLIC_GA_ID ?? "G-L56ZRQGJ67";

const PRIVATE_PREFIXES = [
  "/admin",
  "/dashboard",
  "/inbox",
  "/contacts",
  "/pipelines",
  "/broadcasts",
  "/automations",
  "/flows",
  "/notifications",
  "/settings",
  "/login",
  "/signup",
  "/forgot-password",
  "/reset-password",
  "/onboarding",
  "/join",
  "/connect",
  "/auth",
  "/api",
];

function isPublicPath(pathname: string | null): boolean {
  if (!pathname) return false;
  return !PRIVATE_PREFIXES.some((p) => pathname === p || pathname.startsWith(`${p}/`));
}

export function Analytics() {
  const pathname = usePathname();
  if (!GA_ID || !isPublicPath(pathname)) return null;

  return (
    <>
      <Script
        src={`https://www.googletagmanager.com/gtag/js?id=${GA_ID}`}
        strategy="afterInteractive"
      />
      <Script id="ga-init" strategy="afterInteractive">
        {`window.dataLayer = window.dataLayer || [];
function gtag(){dataLayer.push(arguments);}
window.gtag = gtag;
gtag('js', new Date());
gtag('config', '${GA_ID}', { anonymize_ip: true });`}
      </Script>
    </>
  );
}
