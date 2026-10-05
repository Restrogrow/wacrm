import type { Metadata } from "next";
import Link from "next/link";
import { buildArticleSchema, buildBreadcrumbSchema } from "@/lib/seo";
import { BLOG_POSTS } from "@/lib/blog";

const POST = BLOG_POSTS.find((p) => p.slug === "whatsapp-broadcast-template-rules")!;

const BREADCRUMB_SCHEMA = buildBreadcrumbSchema([
  { name: "Blog", path: "/blog" },
  { name: POST.title, path: `/blog/${POST.slug}` },
]);

const ARTICLE_SCHEMA = buildArticleSchema({
  title: POST.title,
  description: POST.description,
  path: `/blog/${POST.slug}`,
  datePublished: POST.datePublished,
});

export const metadata: Metadata = {
  title: POST.title,
  description: POST.description,
  alternates: {
    canonical: `/blog/${POST.slug}`,
  },
  openGraph: {
    type: "article",
    url: `/blog/${POST.slug}`,
    title: `${POST.title} — Repeat Grow`,
    description: POST.description,
  },
  robots: {
    index: true,
    follow: true,
  },
};

export default function TemplateRulesPost() {
  return (
    <div className="mx-auto max-w-3xl px-6 py-16">
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: JSON.stringify(BREADCRUMB_SCHEMA) }}
      />
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: JSON.stringify(ARTICLE_SCHEMA) }}
      />
      <Link href="/blog" className="text-sm text-muted-foreground hover:text-foreground">
        &larr; Back to Blog
      </Link>

      <h1 className="mt-6 text-3xl font-bold tracking-tight">{POST.title}</h1>
      <p className="mt-2 text-xs text-muted-foreground">
        Published {new Date(POST.datePublished).toLocaleDateString("en-US", {
          year: "numeric",
          month: "long",
          day: "numeric",
        })}
      </p>

      <div className="mt-8 space-y-8 text-sm leading-relaxed text-foreground/90">
        <p>
          Any message you broadcast to a customer who hasn&apos;t messaged you in
          the last 24 hours has to go through a pre-approved WhatsApp
          message template. Here&apos;s what actually gets checked, and why
          templates get rejected.
        </p>

        <section>
          <h2 className="text-lg font-semibold tracking-tight">
            Templates are categorized, and the category affects pricing
          </h2>
          <p className="mt-2">
            Meta classifies every template as Marketing, Utility, or
            Authentication. A promo broadcast is Marketing; an order
            confirmation or shipping update is Utility; an OTP is
            Authentication. Conversation pricing from Meta differs by
            category, so miscategorizing a template (e.g. dressing up a
            promo as a utility update) is both a rejection risk and a
            billing issue.
          </p>
        </section>

        <section>
          <h2 className="text-lg font-semibold tracking-tight">
            Variables need realistic sample content
          </h2>
          <p className="mt-2">
            Templates with variables like {"{{1}}"} for a name or order
            number must include example values when submitted for review —
            reviewers reject templates where the sample content is missing,
            placeholder-only, or inconsistent with the stated category.
          </p>
        </section>

        <section>
          <h2 className="text-lg font-semibold tracking-tight">
            Common rejection reasons
          </h2>
          <p className="mt-2">
            The most frequent ones: promotional language in a template
            marked as Utility, missing or generic variable examples,
            requesting sensitive personal information, and formatting that
            doesn&apos;t match the approved template exactly once it&apos;s live
            (templates can&apos;t be edited after approval — a changed template
            is a new submission).
          </p>
        </section>

        <section>
          <h2 className="text-lg font-semibold tracking-tight">
            Delivery and read tracking
          </h2>
          <p className="mt-2">
            Once approved, each broadcast send reports delivery and read
            status per recipient back through the API — useful for
            confirming an order-update broadcast actually reached customers,
            not just that it was sent.
          </p>
        </section>

        <p>
          Repeat Grow&apos;s broadcast tool manages templates, variable
          substitution, and per-recipient tracking in one place — see{" "}
          <Link href="/pricing" className="underline">
            pricing and plan limits
          </Link>{" "}
          for broadcast volume per plan.
        </p>
      </div>
    </div>
  );
}
