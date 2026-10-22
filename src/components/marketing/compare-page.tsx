import type { Metadata } from "next";
import Link from "next/link";
import { SiteLinks } from "@/components/marketing/site-links";

import { COMPARE_PAGES, PRICES_CHECKED, type ComparePageData } from "@/lib/compare";
import { SITE_URL, buildBreadcrumbNode, buildFAQNode } from "@/lib/seo";

export function compareMetadata(page: ComparePageData): Metadata {
  return {
    title: { absolute: page.title },
    description: page.description,
    alternates: { canonical: `/${page.slug}` },
    openGraph: {
      type: "article",
      url: `/${page.slug}`,
      title: `${page.title} | Repeat Grow`,
      description: page.description,
    },
    twitter: {
      card: "summary_large_image",
      title: page.title,
      description: page.description,
    },
    robots: { index: true, follow: true },
  };
}

export function ComparePage({ page }: { page: ComparePageData }) {
  const schema = {
    "@context": "https://schema.org",
    "@graph": [
      buildBreadcrumbNode([{ name: page.navName, path: `/${page.slug}` }]),
      {
        "@type": "WebPage",
        name: page.title,
        url: `${SITE_URL}/${page.slug}`,
        description: page.description,
        dateModified: "2026-10-16",
        isPartOf: { "@type": "WebSite", name: "Repeat Grow", url: SITE_URL },
      },
      buildFAQNode(page.faqs),
    ],
  };
  const others = COMPARE_PAGES.filter((p) => p.slug !== page.slug);

  return (
    <div className="mx-auto max-w-4xl px-6 py-16">
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: JSON.stringify(schema) }}
      />
      <Link href="/" className="text-sm text-muted-foreground hover:text-foreground">
        &larr; Back to Repeat Grow
      </Link>

      <h1 className="mt-6 text-3xl font-bold tracking-tight">{page.h1}</h1>
      <p className="mt-2 text-xs text-muted-foreground">
        Prices checked {PRICES_CHECKED} from each provider&apos;s public pricing page.
      </p>
      <p className="mt-4 text-sm leading-relaxed text-foreground/80">{page.intro}</p>

      <div className="mt-6 rounded-xl border border-emerald-500/30 bg-emerald-500/5 p-5">
        <p className="text-sm font-semibold">The short answer</p>
        <p className="mt-1 text-sm leading-relaxed text-foreground/90">{page.quickAnswer}</p>
      </div>

      <h2 className="mt-10 text-xl font-semibold tracking-tight">Side-by-side comparison</h2>
      <div className="mt-4 overflow-x-auto rounded-lg border border-border">
        <table className="w-full min-w-[640px] border-collapse text-left text-sm">
          <thead>
            <tr className="bg-muted/50">
              {page.table.headers.map((h, i) => (
                <th key={i} scope="col" className="px-4 py-3 font-semibold">
                  {h}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {page.table.rows.map((row, r) => (
              <tr key={r} className="border-t border-border align-top">
                {row.map((cell, c) =>
                  c === 0 ? (
                    <th key={c} scope="row" className="px-4 py-3 font-medium">
                      {cell}
                    </th>
                  ) : (
                    <td key={c} className="px-4 py-3 text-foreground/85">
                      {cell}
                    </td>
                  )
                )}
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <div className="mt-10 grid gap-5 md:grid-cols-2">
        <section className="rounded-xl border border-border p-5">
          <h2 className="text-base font-semibold">{page.chooseThem.heading}</h2>
          <ul className="mt-3 list-disc space-y-2 pl-5 text-sm leading-relaxed text-foreground/85">
            {page.chooseThem.items.map((item) => (
              <li key={item}>{item}</li>
            ))}
          </ul>
        </section>
        <section className="rounded-xl border border-emerald-500/30 bg-emerald-500/5 p-5">
          <h2 className="text-base font-semibold">{page.chooseUs.heading}</h2>
          <ul className="mt-3 list-disc space-y-2 pl-5 text-sm leading-relaxed text-foreground/85">
            {page.chooseUs.items.map((item) => (
              <li key={item}>{item}</li>
            ))}
          </ul>
        </section>
      </div>

      {page.facts.map((group) => (
        <section key={group.heading} className="mt-10">
          <h2 className="text-xl font-semibold tracking-tight">{group.heading}</h2>
          <ul className="mt-3 list-disc space-y-2 pl-5 text-sm leading-relaxed text-foreground/85">
            {group.items.map((item) => (
              <li key={item}>{item}</li>
            ))}
          </ul>
        </section>
      ))}

      <section className="mt-10">
        <h2 className="text-xl font-semibold tracking-tight">FAQ</h2>
        <div className="mt-4 space-y-5 text-sm leading-relaxed">
          {page.faqs.map((f) => (
            <div key={f.question}>
              <p className="font-medium text-foreground">{f.question}</p>
              <p className="mt-1 text-foreground/80">{f.answer}</p>
            </div>
          ))}
        </div>
      </section>

      <div className="mt-12 rounded-2xl border border-emerald-500/30 bg-emerald-500/5 p-6">
        <p className="text-lg font-semibold">See Repeat Grow on your own use case</p>
        <p className="mt-2 text-sm leading-relaxed text-foreground/80">
          A free 20-minute demo, or try it free for 7 days. We set up your WhatsApp Business API
          number for you.
        </p>
        <div className="mt-5 flex flex-wrap gap-3">
          <Link
            href="/demo"
            className="rounded-md bg-primary px-5 py-2.5 text-sm font-semibold text-primary-foreground"
          >
            Book a demo
          </Link>
          <Link
            href="/pricing"
            className="rounded-md border px-5 py-2.5 text-sm font-semibold text-foreground"
          >
            See plans &amp; pricing
          </Link>
        </div>
      </div>

      <div className="mt-10 text-sm">
        <p className="font-medium">More comparisons</p>
        <ul className="mt-2 list-disc space-y-1 pl-5">
          {others.map((p) => (
            <li key={p.slug}>
              <Link href={`/${p.slug}`} className="underline">
                {p.navName}
              </Link>
            </li>
          ))}
          <li>
            <Link href="/whatsapp-crm-vs-whatsapp-business-app" className="underline">
              WhatsApp CRM vs the WhatsApp Business app
            </Link>
          </li>
        </ul>
      </div>

      <p className="mt-10 text-xs leading-relaxed text-muted-foreground">
        WATI, Interakt and AiSensy are trademarks of their respective owners. Repeat Grow is not
        affiliated with them. Competitor prices and features come from their public pricing pages
        on {PRICES_CHECKED}, exclude taxes where they say so, and may have changed since. Check
        their sites for current details. Meta&apos;s per-message WhatsApp fees apply on top of every
        platform price.
      </p>

      <SiteLinks />
    </div>
  );
}
