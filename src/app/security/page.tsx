import type { Metadata } from "next";
import Link from "next/link";

export const metadata: Metadata = {
  title: "Security",
  robots: {
    index: true,
    follow: true,
  },
};

export default function SecurityPage() {
  return (
    <div className="mx-auto max-w-3xl px-6 py-16">
      <Link href="/" className="text-sm text-muted-foreground hover:text-foreground">
        &larr; Back to Repeat Grow
      </Link>

      <h1 className="mt-6 text-3xl font-bold tracking-tight">Security</h1>
      <p className="mt-2 text-sm text-muted-foreground">Last updated: August 25, 2026</p>

      <div className="mt-10 space-y-8 text-sm leading-relaxed text-foreground/90">
        <section>
          <p>
            We take the security of your business and customer data
            seriously. This page summarizes the main safeguards built into
            Repeat Grow.
          </p>
        </section>

        <section>
          <h2 className="text-lg font-semibold text-foreground">Encryption</h2>
          <ul className="mt-3 list-disc space-y-2 pl-6">
            <li>All traffic between your browser and Repeat Grow is encrypted in transit over HTTPS/TLS.</li>
            <li>WhatsApp API access tokens are encrypted at rest using AES-256-GCM before being stored.</li>
          </ul>
        </section>

        <section>
          <h2 className="text-lg font-semibold text-foreground">Access Controls</h2>
          <ul className="mt-3 list-disc space-y-2 pl-6">
            <li>Database access is enforced with row-level security policies on every table, scoping each account&apos;s data to that account.</li>
            <li>Team access within an account follows role-based permissions (owner / admin / agent / viewer).</li>
            <li>API keys are scoped and revocable, and are stored hashed rather than in plain text.</li>
          </ul>
        </section>

        <section>
          <h2 className="text-lg font-semibold text-foreground">Webhook &amp; Request Verification</h2>
          <p className="mt-3">
            Inbound WhatsApp webhook requests are verified using HMAC-SHA256
            signature checks before being processed, so unsigned or spoofed
            requests are rejected.
          </p>
        </section>

        <section>
          <h2 className="text-lg font-semibold text-foreground">Infrastructure</h2>
          <p className="mt-3">
            Repeat Grow is built on the official WhatsApp Business API and
            hosted on Supabase infrastructure, with baseline security
            headers (HSTS, X-Content-Type-Options, X-Frame-Options,
            Content-Security-Policy, and a restrictive Permissions-Policy)
            applied to every response.
          </p>
        </section>

        <section>
          <h2 className="text-lg font-semibold text-foreground">Responsible Disclosure</h2>
          <p className="mt-3">
            If you believe you&apos;ve found a security vulnerability in Repeat
            Grow, please report it privately to{" "}
            <a href="mailto:restrogrow@gmail.com" className="underline">
              restrogrow@gmail.com
            </a>{" "}
            rather than disclosing it publicly. We&apos;ll acknowledge your
            report and work with you to understand and address the issue.
          </p>
        </section>
      </div>
    </div>
  );
}
