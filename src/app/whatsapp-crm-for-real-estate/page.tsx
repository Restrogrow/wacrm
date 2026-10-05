import type { Metadata } from "next";
import Link from "next/link";
import { buildBreadcrumbSchema } from "@/lib/seo";

const BREADCRUMB_SCHEMA = buildBreadcrumbSchema([
  { name: "WhatsApp CRM for Real Estate", path: "/whatsapp-crm-for-real-estate" },
]);

const PAGE_TITLE = "WhatsApp CRM for Real Estate Teams";
const PAGE_DESCRIPTION =
  "Capture property leads straight into a WhatsApp pipeline, automate site-visit follow-ups, and broadcast new listings on the official WhatsApp Business API — with your whole sales team on one shared number.";

export const metadata: Metadata = {
  title: PAGE_TITLE,
  description: PAGE_DESCRIPTION,
  alternates: {
    canonical: "/whatsapp-crm-for-real-estate",
  },
  openGraph: {
    type: "website",
    url: "/whatsapp-crm-for-real-estate",
    title: `${PAGE_TITLE} — Repeat Grow`,
    description: PAGE_DESCRIPTION,
  },
  robots: {
    index: true,
    follow: true,
  },
};

export default function RealEstateUseCasePage() {
  return (
    <div className="mx-auto max-w-3xl px-6 py-16">
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: JSON.stringify(BREADCRUMB_SCHEMA) }}
      />
      <Link href="/" className="text-sm text-muted-foreground hover:text-foreground">
        &larr; Back to Repeat Grow
      </Link>

      <h1 className="mt-6 text-3xl font-bold tracking-tight">{PAGE_TITLE}</h1>
      <p className="mt-4 text-sm leading-relaxed text-foreground/80">
        Property leads come in fast from ads and portals, go cold fast, and
        get passed between agents constantly. Repeat Grow keeps every lead,
        conversation, and site-visit tied to a pipeline stage instead of
        scattered across personal phones.
      </p>

      <div className="mt-10 space-y-8 text-sm leading-relaxed text-foreground/90">
        <section>
          <h2 className="text-lg font-semibold tracking-tight">
            Leads go straight into a pipeline, not a phone
          </h2>
          <p className="mt-2">
            Every inbound enquiry lands in the shared inbox and can be moved
            through pipeline stages — new enquiry, site visit scheduled,
            negotiation, closed — with the full chat history attached to the
            deal.
          </p>
        </section>

        <section>
          <h2 className="text-lg font-semibold tracking-tight">
            Automated site-visit and follow-up reminders
          </h2>
          <p className="mt-2">
            No-code automations can send a confirmation after a site visit
            is booked, a reminder the day before, and a follow-up afterward
            — so leads don&apos;t go cold between visits because nobody
            remembered to text back.
          </p>
        </section>

        <section>
          <h2 className="text-lg font-semibold tracking-tight">
            Broadcast new listings on an official number
          </h2>
          <p className="mt-2">
            Send new-listing and price-drop broadcasts using Meta-approved
            templates, with delivery and read tracking, from the same
            business number your leads already have saved.
          </p>
        </section>

        <section>
          <h2 className="text-lg font-semibold tracking-tight">
            One number, multiple agents
          </h2>
          <p className="mt-2">
            Assign conversations to specific agents, see who&apos;s handling
            what, and transfer a lead without losing its history — all on
            one shared WhatsApp Business number instead of individual agent
            phones.
          </p>
        </section>

        <section>
          <h2 className="text-lg font-semibold tracking-tight">FAQ</h2>
          <div className="mt-3 space-y-5">
            <div>
              <p className="font-medium text-foreground">
                Can different agents handle leads for different properties?
              </p>
              <p className="mt-1 text-foreground/80">
                Yes — use tags and pipeline stages per property or project,
                and assign conversations to the agent responsible for that
                listing.
              </p>
            </div>
            <div>
              <p className="font-medium text-foreground">
                What happens if an agent leaves the team?
              </p>
              <p className="mt-1 text-foreground/80">
                Conversations and deal history stay with the business
                number and pipeline, not the individual agent, so
                reassigning a lead doesn&apos;t mean losing its context.
              </p>
            </div>
          </div>
        </section>
      </div>

      <div className="mt-12 flex flex-wrap gap-3">
        <Link
          href="/signup"
          className="rounded-md bg-primary px-5 py-2.5 text-sm font-semibold text-primary-foreground"
        >
          Start Free Trial
        </Link>
        <Link
          href="/pricing"
          className="rounded-md border px-5 py-2.5 text-sm font-semibold text-foreground"
        >
          See plans &amp; pricing
        </Link>
      </div>
    </div>
  );
}
