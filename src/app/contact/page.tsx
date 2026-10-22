import type { Metadata } from "next";
import Link from "next/link";
import { SiteLinks } from "@/components/marketing/site-links";
import { buildBreadcrumbSchema, LINKEDIN_URL, TRUSTPILOT_URL } from "@/lib/seo";

const BREADCRUMB_SCHEMA = buildBreadcrumbSchema([
  { name: "Contact Us", path: "/contact" },
]);

const CONTACT_DESCRIPTION =
  "Contact Repeat Grow for WhatsApp CRM support, sales, and onboarding. Email, phone or WhatsApp, we reply fast.";

export const metadata: Metadata = {
  title: "Contact Us",
  description: CONTACT_DESCRIPTION,
  alternates: {
    canonical: "/contact",
  },
  openGraph: {
    type: "website",
    url: "/contact",
    title: "Contact Us | Repeat Grow",
    description: CONTACT_DESCRIPTION,
  },
  robots: {
    index: true,
    follow: true,
  },
};

export default function ContactPage() {
  return (
    <div className="mx-auto max-w-3xl px-6 py-16">
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: JSON.stringify(BREADCRUMB_SCHEMA) }}
      />
      <Link href="/" className="text-sm text-muted-foreground hover:text-foreground">
        &larr; Back to Repeat Grow
      </Link>

      <h1 className="mt-6 text-3xl font-bold tracking-tight">Contact Us</h1>
      <p className="mt-3 text-sm leading-relaxed text-foreground/90">
        Have a question, want a plan scoped for your team, or need support
        with your account? Reach us through any of the channels below.
      </p>

      <div className="mt-10 space-y-6">
        <div className="rounded-lg border border-border p-5">
          <h2 className="text-sm font-semibold text-foreground">Email</h2>
          <dl className="mt-2 grid grid-cols-[auto_1fr] gap-x-4 gap-y-1 text-sm">
            <dt className="text-muted-foreground">Support</dt>
            <dd>
              <a href="mailto:support@repeatgrow.com" className="text-muted-foreground underline">
                support@repeatgrow.com
              </a>
            </dd>
            <dt className="text-muted-foreground">Sales &amp; demos</dt>
            <dd>
              <a href="mailto:sales@repeatgrow.com" className="text-muted-foreground underline">
                sales@repeatgrow.com
              </a>
            </dd>
            <dt className="text-muted-foreground">General</dt>
            <dd>
              <a href="mailto:info@repeatgrow.com" className="text-muted-foreground underline">
                info@repeatgrow.com
              </a>
            </dd>
          </dl>
        </div>

        <div className="rounded-lg border border-border p-5">
          <h2 className="text-sm font-semibold text-foreground">Phone</h2>
          <a
            href="tel:+916377568749"
            className="mt-1 block text-sm text-muted-foreground underline"
          >
            +91 63775 68749
          </a>
        </div>

        <div className="rounded-lg border border-border p-5">
          <h2 className="text-sm font-semibold text-foreground">WhatsApp</h2>
          <a
            href="https://wa.me/916377568749"
            target="_blank"
            rel="noopener"
            className="mt-1 block text-sm text-muted-foreground underline"
          >
            +91 63775 68749
          </a>
        </div>

        <div className="rounded-lg border border-border p-5">
          <h2 className="text-sm font-semibold text-foreground">Follow and review us</h2>
          <a
            href={LINKEDIN_URL}
            target="_blank"
            rel="noopener"
            className="mt-1 block text-sm text-muted-foreground underline"
          >
            Repeat Grow on LinkedIn
          </a>
          <a
            href={TRUSTPILOT_URL}
            target="_blank"
            rel="noopener"
            className="mt-1 block text-sm text-muted-foreground underline"
          >
            Read or write a review on Trustpilot
          </a>
        </div>

        <p className="text-sm text-muted-foreground">
          Want to see the product first?{" "}
          <Link href="/demo" className="underline">
            Book a free demo
          </Link>
          .
        </p>
      </div>

      <SiteLinks />
    </div>
  );
}
