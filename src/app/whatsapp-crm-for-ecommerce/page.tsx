import type { Metadata } from "next";
import Link from "next/link";
import { buildBreadcrumbSchema } from "@/lib/seo";

const BREADCRUMB_SCHEMA = buildBreadcrumbSchema([
  { name: "WhatsApp CRM for E-commerce", path: "/whatsapp-crm-for-ecommerce" },
]);

const PAGE_TITLE = "WhatsApp CRM for E-commerce & D2C Brands";
const PAGE_DESCRIPTION =
  "Run order updates, COD confirmations, abandoned cart follow-ups, and promo broadcasts on the official WhatsApp Business API — with every customer tied to their order history in one shared inbox.";

export const metadata: Metadata = {
  title: PAGE_TITLE,
  description: PAGE_DESCRIPTION,
  alternates: {
    canonical: "/whatsapp-crm-for-ecommerce",
  },
  openGraph: {
    type: "website",
    url: "/whatsapp-crm-for-ecommerce",
    title: `${PAGE_TITLE} — Repeat Grow`,
    description: PAGE_DESCRIPTION,
  },
  robots: {
    index: true,
    follow: true,
  },
};

export default function EcommerceUseCasePage() {
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
        For online stores and D2C brands, WhatsApp is where order questions,
        COD confirmations, and repeat-purchase conversations actually
        happen. Repeat Grow turns that into a CRM instead of a chat log —
        every customer stays linked to their order history, tags, and next
        follow-up.
      </p>

      <div className="mt-10 space-y-8 text-sm leading-relaxed text-foreground/90">
        <section>
          <h2 className="text-lg font-semibold tracking-tight">
            Order updates and COD confirmation, without the spreadsheet
          </h2>
          <p className="mt-2">
            Send Meta-approved template messages for order confirmation,
            shipping, and COD verification, with delivery and read tracking
            per recipient. No more manually copy-pasting order numbers into
            chats.
          </p>
        </section>

        <section>
          <h2 className="text-lg font-semibold tracking-tight">
            Recover abandoned carts and win back repeat buyers
          </h2>
          <p className="mt-2">
            No-code automations can trigger a WhatsApp follow-up on an
            abandoned cart, a post-delivery check-in, or a win-back message
            for customers who haven&apos;t ordered in a while — tagged and
            tracked in the same pipeline as every other conversation.
          </p>
        </section>

        <section>
          <h2 className="text-lg font-semibold tracking-tight">
            One shared inbox for order support, at scale
          </h2>
          <p className="mt-2">
            Support volume spikes around sales and launches. A shared inbox
            on your official WhatsApp Business number means multiple agents
            can work the same number with per-conversation assignment —
            instead of one phone passed between people.
          </p>
        </section>

        <section>
          <h2 className="text-lg font-semibold tracking-tight">FAQ</h2>
          <div className="mt-3 space-y-5">
            <div>
              <p className="font-medium text-foreground">
                Can I send order and shipping updates automatically?
              </p>
              <p className="mt-1 text-foreground/80">
                Yes — automations can trigger a template message on events
                like a new order, a status change, or a schedule, using
                Meta-approved templates.
              </p>
            </div>
            <div>
              <p className="font-medium text-foreground">
                Does this replace my helpdesk or marketing tool?
              </p>
              <p className="mt-1 text-foreground/80">
                Repeat Grow is a shared WhatsApp inbox and CRM, not a
                helpdesk ticketing system. Most e-commerce teams use it
                specifically for the WhatsApp channel — support, order
                updates, and broadcasts — alongside their existing store
                platform.
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
