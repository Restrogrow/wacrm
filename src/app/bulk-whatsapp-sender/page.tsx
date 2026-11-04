import type { Metadata } from "next";
import Link from "next/link";
import { SiteLinks } from "@/components/marketing/site-links";
import { buildBreadcrumbSchema, buildFAQNode } from "@/lib/seo";

const BREADCRUMB_SCHEMA = buildBreadcrumbSchema([
  { name: "Bulk WhatsApp Sender", path: "/bulk-whatsapp-sender" },
]);

// Same questions as the FAQ section below, as FAQPage structured data.
const FAQ_SCHEMA = {
  "@context": "https://schema.org",
  ...buildFAQNode([
    {
      question: "Is bulk WhatsApp messaging legal in India?",
      answer:
        "Yes, when you use the official WhatsApp Business API, send Meta-approved templates, and message people who opted in. What is not allowed is automating the consumer WhatsApp or WhatsApp Business app with an unofficial sender, which breaks WhatsApp's terms and gets numbers banned.",
    },
    {
      question: "How many WhatsApp messages can I send per day?",
      answer:
        "On the official API your number sits in a messaging tier that rises as you send good-quality messages, and falls if people block or report you. New numbers start small and scale within days. Repeat Grow shows your number's current limit and quality rating under Settings, WhatsApp, Number health.",
    },
    {
      question: "Will a bulk WhatsApp sender get my number banned?",
      answer:
        "An unofficial sender very likely will, because it automates an app that is not meant to be automated. The official API will not ban you for volume alone, but it does cut your sending limit if your quality rating drops, which is driven by blocks and reports rather than by how many messages you send.",
    },
    {
      question: "Do I need to upload a contact list?",
      answer:
        "You can import contacts from CSV, or build an audience from tags and filters on contacts already in the CRM. Either way, recipients must have opted in to marketing messages for a Marketing-category broadcast.",
    },
    {
      question: "Can I see who received and read a broadcast?",
      answer:
        "Yes. The official API reports status per recipient, so each broadcast shows sent, delivered, read and failed counts, and replies land in the shared inbox instead of a no-reply address.",
    },
  ]),
};

const PAGE_TITLE = "Bulk WhatsApp Sender for India: The Official Way";
const SEO_TITLE = "Bulk WhatsApp Sender India (Official API)";
const PAGE_DESCRIPTION =
  "Send bulk WhatsApp messages in India on the official Business API: approved templates, opt-in audiences, per-recipient delivery and read status. No ban risk from grey senders.";

export const metadata: Metadata = {
  title: SEO_TITLE,
  description: PAGE_DESCRIPTION,
  keywords: [
    "bulk whatsapp sender",
    "bulk whatsapp sender india",
    "whatsapp broadcast software",
    "bulk whatsapp message india",
    "whatsapp bulk message sender official api",
    "whatsapp marketing software india",
  ],
  alternates: {
    canonical: "/bulk-whatsapp-sender",
  },
  openGraph: {
    type: "website",
    url: "/bulk-whatsapp-sender",
    title: `${PAGE_TITLE} | Repeat Grow`,
    description: PAGE_DESCRIPTION,
  },
  robots: {
    index: true,
    follow: true,
  },
};

export default function BulkWhatsAppSenderPage() {
  return (
    <div className="mx-auto max-w-3xl px-6 py-16">
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: JSON.stringify(BREADCRUMB_SCHEMA) }}
      />
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: JSON.stringify(FAQ_SCHEMA) }}
      />
      <Link href="/" className="text-sm text-muted-foreground hover:text-foreground">
        &larr; Back to Repeat Grow
      </Link>

      <h1 className="mt-6 text-3xl font-bold tracking-tight">{PAGE_TITLE}</h1>
      <p className="mt-4 text-sm leading-relaxed text-foreground/80">
        Most tools that call themselves a &ldquo;bulk WhatsApp sender&rdquo;
        drive the normal WhatsApp app with a script or a browser extension.
        They work for a few hundred messages and then the number is gone, with
        the contacts and the chat history on it. Repeat Grow sends on the{" "}
        <strong>official WhatsApp Business API</strong> instead: approved
        templates, consented audiences, and delivery status for every single
        recipient.
      </p>

      <div className="mt-10 space-y-8 text-sm leading-relaxed text-foreground/90">
        <section>
          <h2 className="text-lg font-semibold tracking-tight">
            Why unofficial senders stop working
          </h2>
          <p className="mt-2">
            An unofficial sender logs in as you and types faster than a human
            can. WhatsApp detects that pattern &mdash; identical messages to
            many numbers, no replies coming back, recipients pressing block
            &mdash; and bans the number. There is no appeal worth counting on,
            and you lose the number itself, which for most Indian businesses is
            the number printed on their packaging and their storefront.
          </p>
          <p className="mt-2">
            The official API is a different thing entirely: Meta knows who you
            are, your templates are reviewed before you can send them, and your
            number carries a published quality rating instead of a hidden
            strike count.
          </p>
        </section>

        <section>
          <h2 className="text-lg font-semibold tracking-tight">
            Build the audience without a spreadsheet
          </h2>
          <p className="mt-2">
            Import contacts from CSV, or pick an audience from tags and filters
            on contacts already in the CRM &mdash; customers who bought a
            particular product, leads from a particular campaign, anyone a
            specific agent owns. Duplicate phone numbers are merged on import,
            and numbers typed without a country code are normalised rather than
            silently failing.
          </p>
        </section>

        <section>
          <h2 className="text-lg font-semibold tracking-tight">
            Approved templates, personalised per recipient
          </h2>
          <p className="mt-2">
            Business-initiated WhatsApp messages have to use a template Meta
            has approved. Build it in the app, submit it for review, and fill
            each <code>{"{{1}}"}</code> from contact fields so every recipient
            gets their own name, order number or appointment time. Templates
            can carry images, buttons and a copyable coupon code.
          </p>
        </section>

        <section>
          <h2 className="text-lg font-semibold tracking-tight">
            Send now or schedule, and see what landed
          </h2>
          <p className="mt-2">
            Send immediately or schedule for later; the server sends in batches
            so one large broadcast does not spike your number&apos;s traffic.
            Each broadcast reports <strong>sent, delivered, read and
            failed</strong> per recipient, with automatic retries on transient
            failures. Replies arrive in the shared team inbox, so a broadcast
            can actually start conversations instead of shouting into the void.
          </p>
        </section>

        <section>
          <h2 className="text-lg font-semibold tracking-tight">
            Opt-outs handled for you
          </h2>
          <p className="mt-2">
            A customer who replies STOP is removed from marketing sends
            automatically, across every broadcast and automation, with no
            action from your team. That is both the law under India&apos;s DPDP
            Act and the single most effective way to protect your
            number&apos;s quality rating &mdash; a blocked message hurts far
            more than an unsent one.
          </p>
        </section>

        <section>
          <h2 className="text-lg font-semibold tracking-tight">
            What this will not do
          </h2>
          <p className="mt-2">
            Worth being straight about, because it is the difference between
            this and the grey tools:
          </p>
          <ul className="mt-2 list-disc space-y-1 pl-5">
            <li>
              It will not message people who never opted in. Scraped lists and
              bought databases are exactly what destroys a number&apos;s
              quality rating.
            </li>
            <li>
              It will not send unlimited messages on day one. New numbers start
              in a lower messaging tier and scale as they build a good record.
            </li>
            <li>
              It will not send free-text marketing. Business-initiated messages
              go out as approved templates &mdash; free text is only available
              inside a 24-hour window after the customer messages you.
            </li>
          </ul>
        </section>

        <section>
          <h2 className="text-lg font-semibold tracking-tight">
            Common questions
          </h2>
          <dl className="mt-3 space-y-4">
            <div>
              <dt className="font-medium text-foreground">
                Is bulk WhatsApp messaging legal in India?
              </dt>
              <dd className="mt-1">
                Yes, on the official API, with approved templates, to people
                who opted in. What is not allowed is automating the consumer
                WhatsApp or WhatsApp Business app with an unofficial sender.
              </dd>
            </div>
            <div>
              <dt className="font-medium text-foreground">
                How many messages can I send per day?
              </dt>
              <dd className="mt-1">
                Your number sits in a messaging tier that rises as you send
                good-quality messages and falls if people block or report you.
                New numbers start small and scale within days. Your current
                limit and quality rating are shown in the app under Settings
                &rarr; WhatsApp &rarr; Number health.
              </dd>
            </div>
            <div>
              <dt className="font-medium text-foreground">
                Will this get my number banned?
              </dt>
              <dd className="mt-1">
                Volume alone does not get you banned on the official API.
                Blocks and reports cut your sending limit, which is why
                consent and relevance matter more than send rate. We wrote up
                exactly what triggers it in{" "}
                <Link
                  href="/blog/bulk-whatsapp-without-getting-banned"
                  className="font-medium text-primary hover:underline"
                >
                  how to send bulk WhatsApp messages without getting banned
                </Link>
                .
              </dd>
            </div>
            <div>
              <dt className="font-medium text-foreground">
                Can I see who read it?
              </dt>
              <dd className="mt-1">
                Yes &mdash; sent, delivered, read and failed per recipient, and
                replies land in the shared inbox.
              </dd>
            </div>
          </dl>
        </section>

        <section>
          <h2 className="text-lg font-semibold tracking-tight">
            Try it with your own list
          </h2>
          <p className="mt-2">
            See <Link href="/pricing" className="font-medium text-primary hover:underline">pricing</Link>,
            or <Link href="/demo" className="font-medium text-primary hover:underline">book a demo</Link>{" "}
            and we will set up your first broadcast with you. If you are
            currently on an unofficial sender,{" "}
            <Link
              href="/official-vs-unofficial-whatsapp-api"
              className="font-medium text-primary hover:underline"
            >
              this comparison
            </Link>{" "}
            covers what changes when you move.
          </p>
        </section>
      </div>

      <SiteLinks />
    </div>
  );
}
