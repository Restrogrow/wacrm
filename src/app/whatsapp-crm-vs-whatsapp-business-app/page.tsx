import type { Metadata } from "next";
import Link from "next/link";
import { buildBreadcrumbSchema } from "@/lib/seo";

const BREADCRUMB_SCHEMA = buildBreadcrumbSchema([
  {
    name: "WhatsApp CRM vs WhatsApp Business App",
    path: "/whatsapp-crm-vs-whatsapp-business-app",
  },
]);

const PAGE_TITLE = "WhatsApp CRM vs. the WhatsApp Business App: What's the Difference?";
const PAGE_DESCRIPTION =
  "The free WhatsApp Business app works for one person on one phone. Here's what changes — shared inbox, pipelines, automation, and the official API — once a team needs more than that.";

export const metadata: Metadata = {
  title: PAGE_TITLE,
  description: PAGE_DESCRIPTION,
  alternates: {
    canonical: "/whatsapp-crm-vs-whatsapp-business-app",
  },
  openGraph: {
    type: "website",
    url: "/whatsapp-crm-vs-whatsapp-business-app",
    title: `${PAGE_TITLE} — Repeat Grow`,
    description: PAGE_DESCRIPTION,
  },
  robots: {
    index: true,
    follow: true,
  },
};

export default function WhatsappCrmVsBusinessAppPage() {
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
        The free WhatsApp Business app is a solid starting point for a
        single person handling a small volume of chats. The gap shows up
        once more than one person needs to answer, or once you need to know
        what happened to a lead after the conversation ended.
      </p>

      <div className="mt-10 space-y-8 text-sm leading-relaxed text-foreground/90">
        <section>
          <h2 className="text-lg font-semibold tracking-tight">
            One device vs. a shared team inbox
          </h2>
          <p className="mt-2">
            The WhatsApp Business app is built around one phone, with
            limited multi-device support and no real way to assign
            conversations. A WhatsApp CRM built on the official WhatsApp
            Business API gives a whole team a shared inbox on one number,
            with per-conversation assignment and status.
          </p>
        </section>

        <section>
          <h2 className="text-lg font-semibold tracking-tight">
            Chat history vs. a pipeline
          </h2>
          <p className="mt-2">
            The app stores messages per chat thread. A CRM ties every
            contact to custom fields, tags, and a sales pipeline stage, so
            you can see not just what was said, but where that lead or
            customer stands.
          </p>
        </section>

        <section>
          <h2 className="text-lg font-semibold tracking-tight">
            Manual broadcasts vs. automation
          </h2>
          <p className="mt-2">
            The app&apos;s broadcast lists are manual and capped, and nothing
            triggers automatically. A CRM can send Meta-approved template
            broadcasts with delivery and read tracking, and run no-code
            automations off inbound messages, new contacts, or a schedule.
          </p>
        </section>

        <section>
          <h2 className="text-lg font-semibold tracking-tight">
            Both still run on WhatsApp
          </h2>
          <p className="mt-2">
            A WhatsApp CRM like Repeat Grow doesn&apos;t replace WhatsApp —
            it connects to the official WhatsApp Business API (the same
            platform behind the Business app) and adds the team inbox,
            pipeline, and automation layer on top.
          </p>
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
