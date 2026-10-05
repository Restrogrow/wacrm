import type { Metadata } from "next";
import Link from "next/link";
import { buildBreadcrumbSchema } from "@/lib/seo";

const BREADCRUMB_SCHEMA = buildBreadcrumbSchema([
  {
    name: "Official vs Unofficial WhatsApp API",
    path: "/official-vs-unofficial-whatsapp-api",
  },
]);

const PAGE_TITLE = "Official WhatsApp Business API vs. Unofficial WhatsApp Tools";
const PAGE_DESCRIPTION =
  "Unofficial WhatsApp automation tools can get a business number banned. Here's the real difference between the official WhatsApp Business API and unofficial/session-based tools.";

export const metadata: Metadata = {
  title: PAGE_TITLE,
  description: PAGE_DESCRIPTION,
  alternates: {
    canonical: "/official-vs-unofficial-whatsapp-api",
  },
  openGraph: {
    type: "website",
    url: "/official-vs-unofficial-whatsapp-api",
    title: `${PAGE_TITLE} — Repeat Grow`,
    description: PAGE_DESCRIPTION,
  },
  robots: {
    index: true,
    follow: true,
  },
};

export default function OfficialVsUnofficialApiPage() {
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
        Not every tool that says &quot;WhatsApp automation&quot; connects to WhatsApp
        the same way. The difference between official and unofficial access
        matters more than most of the feature list, because it affects
        whether your business number stays usable at all.
      </p>

      <div className="mt-10 space-y-8 text-sm leading-relaxed text-foreground/90">
        <section>
          <h2 className="text-lg font-semibold tracking-tight">
            How unofficial tools work
          </h2>
          <p className="mt-2">
            Unofficial tools typically automate a real WhatsApp account by
            scraping or driving a logged-in session — the same thing as
            running a bot through your personal WhatsApp Web login. This is
            against WhatsApp&apos;s Terms of Service, and Meta actively
            detects and bans numbers used this way, often without warning.
          </p>
        </section>

        <section>
          <h2 className="text-lg font-semibold tracking-tight">
            How the official WhatsApp Business API works
          </h2>
          <p className="mt-2">
            The official WhatsApp Business API (Meta&apos;s Cloud API) is a
            real integration Meta provides for businesses, accessed through
            an approved Business Solution Provider. Message templates go
            through Meta&apos;s approval process, and the number operates
            within WhatsApp&apos;s actual rules rather than around them.
          </p>
        </section>

        <section>
          <h2 className="text-lg font-semibold tracking-tight">
            What this means in practice
          </h2>
          <p className="mt-2">
            A number on an unofficial tool can be banned at any time,
            taking every saved contact and conversation history with it. A
            number on the official API doesn&apos;t carry that risk — it&apos;s
            the same infrastructure WhatsApp itself expects businesses to
            use at scale.
          </p>
        </section>

        <section>
          <h2 className="text-lg font-semibold tracking-tight">
            Where Repeat Grow fits
          </h2>
          <p className="mt-2">
            Repeat Grow is built entirely on the official WhatsApp Business
            API — there is no unofficial or session-based mode. We handle
            the Business verification and number registration as part of
            setup, so you get the shared inbox, pipelines, and automation
            without the ban risk.
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
