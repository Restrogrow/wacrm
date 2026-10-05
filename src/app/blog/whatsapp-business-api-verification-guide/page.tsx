import type { Metadata } from "next";
import Link from "next/link";
import { buildArticleSchema, buildBreadcrumbSchema } from "@/lib/seo";
import { BLOG_POSTS } from "@/lib/blog";

const POST = BLOG_POSTS.find(
  (p) => p.slug === "whatsapp-business-api-verification-guide"
)!;

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

export default function VerificationGuidePost() {
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
          &quot;WhatsApp Business API verification&quot; is really two separate
          approvals: Meta Business verification for your company, and
          WhatsApp Business account approval for the number itself. Here is
          the order they actually happen in.
        </p>

        <section>
          <h2 className="text-lg font-semibold tracking-tight">
            1. Create a Meta Business Manager account
          </h2>
          <p className="mt-2">
            Every WhatsApp Business API number lives inside a Meta Business
            Manager account tied to a real company. This is where Meta
            verifies who you are before you can send a single template
            message.
          </p>
        </section>

        <section>
          <h2 className="text-lg font-semibold tracking-tight">
            2. Submit Meta Business verification
          </h2>
          <p className="mt-2">
            Meta checks your legal business name, address, and website
            against official documents — typically a business registration
            or tax document and proof of the domain or website being yours.
            Mismatches between your legal name and what&apos;s shown publicly are
            the most common cause of delay here.
          </p>
        </section>

        <section>
          <h2 className="text-lg font-semibold tracking-tight">
            3. Register and verify your phone number
          </h2>
          <p className="mt-2">
            The number you connect to WhatsApp Business API cannot already
            be active on the regular WhatsApp or WhatsApp Business app on a
            phone — it needs to be migrated or freed up first. Verification
            is a one-time code sent by call or SMS during setup.
          </p>
        </section>

        <section>
          <h2 className="text-lg font-semibold tracking-tight">
            4. Get your display name and templates approved
          </h2>
          <p className="mt-2">
            Your business display name (what recipients see) goes through
            its own review, separate from business verification. Message
            templates for broadcasts also need individual approval before
            they can be sent — each template is checked against
            WhatsApp&apos;s commerce and content policies.
          </p>
        </section>

        <section>
          <h2 className="text-lg font-semibold tracking-tight">
            How long this actually takes
          </h2>
          <p className="mt-2">
            Business verification can take anywhere from under a day to
            around a week depending on document clarity and request volume.
            Template approval is typically much faster — often minutes to a
            few hours. This is the part of setup Repeat Grow handles for
            customers directly, rather than leaving teams to work through
            Meta&apos;s review queue on their own.
          </p>
        </section>

        <p>
          Want this handled for you instead of doing it manually?{" "}
          <Link href="/pricing" className="underline">
            See Repeat Grow&apos;s plans
          </Link>{" "}
          — WhatsApp Business API setup is included on every one.
        </p>
      </div>
    </div>
  );
}
