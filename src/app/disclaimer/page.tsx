import type { Metadata } from "next";
import Link from "next/link";

export const metadata: Metadata = {
  title: "Disclaimer",
  robots: {
    index: true,
    follow: true,
  },
};

export default function DisclaimerPage() {
  return (
    <div className="mx-auto max-w-3xl px-6 py-16">
      <Link href="/" className="text-sm text-muted-foreground hover:text-foreground">
        &larr; Back to Repeat Grow
      </Link>

      <h1 className="mt-6 text-3xl font-bold tracking-tight">Disclaimer</h1>
      <p className="mt-2 text-sm text-muted-foreground">Last updated: August 25, 2026</p>

      <div className="mt-10 space-y-6 text-sm leading-relaxed text-foreground/90">
        <section>
          <h2 className="text-lg font-semibold text-foreground">No Affiliation with Meta / WhatsApp</h2>
          <p className="mt-3">
            Repeat Grow is an independent platform built on the official
            WhatsApp Business API. Repeat Grow is not owned, operated, or
            endorsed by WhatsApp Inc. or Meta Platforms, Inc. &quot;WhatsApp&quot; is
            a trademark of Meta Platforms, Inc.
          </p>
        </section>

        <section>
          <h2 className="text-lg font-semibold text-foreground">Service Provided &quot;As Is&quot;</h2>
          <p className="mt-3">
            Repeat Grow is provided on an &quot;as is&quot; and &quot;as available&quot; basis,
            without warranties of any kind, whether express or implied,
            including but not limited to warranties of merchantability,
            fitness for a particular purpose, or non-infringement.
          </p>
        </section>

        <section>
          <h2 className="text-lg font-semibold text-foreground">Message Delivery</h2>
          <p className="mt-3">
            Message delivery, read receipts, and template approvals depend
            on WhatsApp/Meta&apos;s systems and policies, which are outside our
            control. We are not responsible for delays, failures, or
            account restrictions imposed by WhatsApp/Meta.
          </p>
        </section>

        <section>
          <h2 className="text-lg font-semibold text-foreground">Not Professional Advice</h2>
          <p className="mt-3">
            Nothing on this website constitutes legal, financial, or
            business advice. You should seek independent professional
            advice relevant to your own circumstances before making
            decisions based on information from this site.
          </p>
        </section>

        <section>
          <h2 className="text-lg font-semibold text-foreground">Contact</h2>
          <p className="mt-3">
            Questions about this Disclaimer can be sent to{" "}
            <a href="mailto:restrogrow@gmail.com" className="underline">
              restrogrow@gmail.com
            </a>
            . See also our{" "}
            <Link href="/terms" className="underline">
              Terms &amp; Conditions
            </Link>{" "}
            and{" "}
            <Link href="/privacy" className="underline">
              Privacy Policy
            </Link>
            .
          </p>
        </section>
      </div>
    </div>
  );
}
