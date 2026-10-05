import type { Metadata } from "next";
import Link from "next/link";
import { buildBreadcrumbSchema } from "@/lib/seo";
import { BLOG_POSTS } from "@/lib/blog";

const BREADCRUMB_SCHEMA = buildBreadcrumbSchema([{ name: "Blog", path: "/blog" }]);

const PAGE_DESCRIPTION =
  "Guides on the official WhatsApp Business API, message templates, and running sales and support on WhatsApp — from the Repeat Grow team.";

export const metadata: Metadata = {
  title: "Blog",
  description: PAGE_DESCRIPTION,
  alternates: {
    canonical: "/blog",
  },
  openGraph: {
    type: "website",
    url: "/blog",
    title: "Blog — Repeat Grow",
    description: PAGE_DESCRIPTION,
  },
  robots: {
    index: true,
    follow: true,
  },
};

export default function BlogIndexPage() {
  return (
    <div className="mx-auto max-w-3xl px-6 py-16">
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: JSON.stringify(BREADCRUMB_SCHEMA) }}
      />
      <Link href="/" className="text-sm text-muted-foreground hover:text-foreground">
        &larr; Back to Repeat Grow
      </Link>

      <h1 className="mt-6 text-3xl font-bold tracking-tight">Blog</h1>
      <p className="mt-4 text-sm leading-relaxed text-foreground/80">
        {PAGE_DESCRIPTION}
      </p>

      <ul className="mt-10 space-y-8 border-t pt-8">
        {BLOG_POSTS.map((post) => (
          <li key={post.slug}>
            <Link
              href={`/blog/${post.slug}`}
              className="text-lg font-semibold tracking-tight hover:underline"
            >
              {post.title}
            </Link>
            <p className="mt-2 text-sm leading-relaxed text-foreground/80">
              {post.description}
            </p>
          </li>
        ))}
      </ul>

      <h2 className="mt-14 text-xl font-bold tracking-tight">Guides &amp; comparisons</h2>
      <ul className="mt-6 space-y-8 border-t pt-8">
        <li>
          <Link
            href="/whatsapp-crm-vs-whatsapp-business-app"
            className="text-lg font-semibold tracking-tight hover:underline"
          >
            WhatsApp CRM vs. the WhatsApp Business App: What&apos;s the Difference?
          </Link>
          <p className="mt-2 text-sm leading-relaxed text-foreground/80">
            What changes — shared inbox, pipelines, automation — once a team
            outgrows the free WhatsApp Business app.
          </p>
        </li>
        <li>
          <Link
            href="/official-vs-unofficial-whatsapp-api"
            className="text-lg font-semibold tracking-tight hover:underline"
          >
            Official WhatsApp Business API vs. Unofficial WhatsApp Tools
          </Link>
          <p className="mt-2 text-sm leading-relaxed text-foreground/80">
            Why unofficial WhatsApp automation tools risk getting a business
            number banned, and how the official API avoids that.
          </p>
        </li>
      </ul>
    </div>
  );
}
