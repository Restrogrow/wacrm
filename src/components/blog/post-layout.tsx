// ============================================================
// Blog post layout — every /blog/<slug> page renders inside this.
//
// Hero (category, title, date, reading time), cover image, a table of
// contents, the article body (typography via the .blog-prose rules in
// BlogProseStyles), an optional FAQ, a call to action and related
// posts. Emits BreadcrumbList, BlogPosting and FAQPage JSON-LD.
// Server component; no client JS.
// ============================================================

import type { ReactNode } from 'react';
import Image from 'next/image';
import Link from 'next/link';
import { SiteLinks } from "@/components/marketing/site-links";

import { buildArticleSchema, buildBreadcrumbSchema, buildFAQNode, buildImageSchema } from '@/lib/seo';
import { formatPostDate, relatedPosts, type BlogPost } from '@/lib/blog';

export interface TocItem {
  id: string;
  label: string;
}

export interface FaqItem {
  question: string;
  answer: string;
}

export function BlogPostLayout({
  post,
  toc,
  faq,
  related: relatedOverride,
  author,
  children,
}: {
  post: BlogPost;
  toc: TocItem[];
  faq?: FaqItem[];
  /** Database posts pass their own list; hand-coded posts use the static one. */
  related?: BlogPost[];
  author?: string;
  children: ReactNode;
}) {
  const path = `/blog/${post.slug}`;
  const schemas = [
    buildBreadcrumbSchema([
      { name: 'Blog', path: '/blog' },
      { name: post.title, path },
    ]),
    buildArticleSchema({
      title: post.title,
      description: post.description,
      path,
      datePublished: post.datePublished,
      dateModified: post.dateModified,
      image: [post.cover, `${path}/opengraph-image`],
      keywords: post.keywords,
      section: post.category,
    }),
    ...(faq?.length ? [{ '@context': 'https://schema.org', ...buildFAQNode(faq) }] : []),
    buildImageSchema({ src: post.cover, caption: post.coverAlt, width: 1200, height: 630 }),
  ];
  const related = relatedOverride ?? relatedPosts(post.slug);

  return (
    <article className="mx-auto max-w-3xl px-5 py-12 sm:px-6 sm:py-16">
      {schemas.map((schema, i) => (
        <script
          key={i}
          type="application/ld+json"
          // Post fields come from the database: escape "<" so a title
          // holding "</script>" can't close the tag and run as HTML.
          dangerouslySetInnerHTML={{ __html: JSON.stringify(schema).replace(/</g, "\\u003c") }}
        />
      ))}
      <BlogProseStyles />

      <nav aria-label="Breadcrumb" className="text-sm text-muted-foreground">
        <Link href="/" className="hover:text-foreground">
          Home
        </Link>
        <span className="mx-1.5">/</span>
        <Link href="/blog" className="hover:text-foreground">
          Blog
        </Link>
      </nav>

      <header className="mt-6">
        <p className="text-xs font-semibold tracking-wide text-emerald-600 uppercase dark:text-emerald-400">
          {post.category}
        </p>
        <h1 className="mt-2 text-3xl leading-tight font-bold tracking-tight sm:text-4xl">
          {post.title}
        </h1>
        <p className="mt-4 text-base leading-relaxed text-foreground/80">{post.description}</p>
        <p className="mt-4 text-xs text-muted-foreground">
          By {author ?? 'the Repeat Grow team'} · <time dateTime={post.datePublished}>{formatPostDate(post.datePublished)}</time>
          {post.dateModified && (
            <>
              {' '}· Updated <time dateTime={post.dateModified}>{formatPostDate(post.dateModified)}</time>
            </>
          )}{' '}
          · {post.readMinutes} min read
        </p>
      </header>

      <Image
        src={post.cover}
        alt={post.coverAlt}
        width={1200}
        height={630}
        priority
        unoptimized
        className="mt-8 w-full rounded-2xl border border-border"
      />

      {toc.length > 0 && (
        <nav
          aria-label="On this page"
          className="mt-10 rounded-xl border border-border bg-muted/40 p-5"
        >
          <p className="text-sm font-semibold">On this page</p>
          <ol className="mt-3 list-decimal space-y-1.5 pl-5 text-sm">
            {toc.map((item) => (
              <li key={item.id}>
                <a href={`#${item.id}`} className="text-foreground/80 hover:text-foreground hover:underline">
                  {item.label}
                </a>
              </li>
            ))}
          </ol>
        </nav>
      )}

      <BlogDemoCta />

      <div className="blog-prose mt-10">{children}</div>

      {faq && faq.length > 0 && (
        <section aria-labelledby="faq" className="mt-12">
          <h2 id="faq" className="text-2xl font-bold tracking-tight">
            Frequently asked questions
          </h2>
          <div className="mt-5 divide-y divide-border rounded-xl border border-border">
            {faq.map((item) => (
              <details key={item.question} className="group p-5">
                <summary className="cursor-pointer list-none font-medium marker:hidden">
                  <span className="flex items-start justify-between gap-4">
                    {item.question}
                    <span className="text-muted-foreground transition-transform group-open:rotate-45" aria-hidden>
                      +
                    </span>
                  </span>
                </summary>
                <p className="mt-3 text-sm leading-relaxed text-foreground/80">{item.answer}</p>
              </details>
            ))}
          </div>
        </section>
      )}

      <aside className="mt-12 rounded-2xl border border-emerald-500/30 bg-emerald-500/5 p-6 sm:p-8">
        <p className="text-lg font-semibold">Put this on autopilot with Repeat Grow</p>
        <p className="mt-2 text-sm leading-relaxed text-foreground/80">
          The official WhatsApp Business API with a shared team inbox, broadcasts, automations and
          ready-made Shopify and Calendly integrations. Try it free for 7 days.
        </p>
        <div className="mt-5 flex flex-wrap gap-3">
          <Link
            href="/demo"
            className="rounded-lg bg-emerald-700 px-4 py-2 text-sm font-semibold text-white hover:bg-emerald-800"
          >
            Book a demo
          </Link>
          <Link
            href="/signup"
            className="rounded-lg border border-border px-4 py-2 text-sm font-semibold hover:bg-muted"
          >
            Start free trial
          </Link>
          <Link
            href="/pricing"
            className="rounded-lg border border-border px-4 py-2 text-sm font-semibold hover:bg-muted"
          >
            See pricing
          </Link>
        </div>
      </aside>

      {related.length > 0 && (
        <section aria-labelledby="related" className="mt-14">
          <h2 id="related" className="text-xl font-bold tracking-tight">
            Keep reading
          </h2>
          <div className="mt-5 grid gap-5 sm:grid-cols-2">
            {related.map((p) => (
              <Link
                key={p.slug}
                href={`/blog/${p.slug}`}
                className="group overflow-hidden rounded-xl border border-border transition-colors hover:border-foreground/30"
              >
                <Image
                  src={p.cover}
                  alt=""
                  width={1200}
                  height={630}
                  unoptimized
                  className="aspect-[1200/630] w-full object-cover"
                />
                <div className="p-4">
                  <p className="text-xs font-semibold text-emerald-600 uppercase dark:text-emerald-400">
                    {p.category}
                  </p>
                  <p className="mt-1 font-semibold group-hover:underline">{p.title}</p>
                </div>
              </Link>
            ))}
          </div>
        </section>
      )}

      <SiteLinks />
    </article>
  );
}

/** An image with a caption inside the article body. */
export function BlogFigure({
  src,
  alt,
  caption,
  width = 1200,
  height = 675,
}: {
  src: string;
  alt: string;
  caption?: ReactNode;
  width?: number;
  height?: number;
}) {
  return (
    <figure>
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{
          __html: JSON.stringify(buildImageSchema({ src, caption: alt, width, height })).replace(/</g, '\\u003c'),
        }}
      />
      <Image
        src={src}
        alt={alt}
        title={alt}
        width={width}
        height={height}
        loading="lazy"
        unoptimized
        className="w-full rounded-xl border border-border"
      />
      {caption && <figcaption>{caption}</figcaption>}
    </figure>
  );
}

/**
 * "Book a demo" box. Every post shows one under the table of contents;
 * posts can also drop one into the body where it fits the story.
 */
export function BlogDemoCta({
  heading = 'See it working on your own WhatsApp number',
  text = 'Book a free 20-minute demo. We show you the inbox, broadcasts and automations on your use case, and set up your WhatsApp Business API number for you.',
}: {
  heading?: string;
  text?: string;
}) {
  return (
    <aside className="not-prose my-8 flex flex-col gap-4 rounded-2xl border border-emerald-500/30 bg-emerald-500/5 p-5 sm:flex-row sm:items-center sm:justify-between">
      <div>
        <p className="font-semibold">{heading}</p>
        <p className="mt-1 text-sm leading-relaxed text-foreground/80">{text}</p>
      </div>
      <Link
        href="/demo"
        className="shrink-0 rounded-lg bg-emerald-700 px-4 py-2 text-center text-sm font-semibold text-white hover:bg-emerald-800"
      >
        Book a free demo
      </Link>
    </aside>
  );
}

/** A WhatsApp-style template example. */
export function TemplateExample({
  label,
  category,
  children,
}: {
  label: string;
  category: 'Utility' | 'Marketing';
  children: ReactNode;
}) {
  return (
    <div className="not-prose my-6 rounded-xl border border-border bg-muted/40 p-4">
      <p className="flex items-center justify-between text-xs font-semibold text-muted-foreground">
        <span>{label}</span>
        <span className="rounded-full border border-border px-2 py-0.5">{category}</span>
      </p>
      <div className="mt-3 rounded-lg rounded-tl-none bg-emerald-100 p-3 text-sm leading-relaxed whitespace-pre-line text-emerald-950 dark:bg-emerald-950 dark:text-emerald-50">
        {children}
      </div>
    </div>
  );
}

/** Typography for the article body (no @tailwindcss/typography dependency). */
export function BlogProseStyles() {
  return (
    <style>{`
      .blog-prose { font-size: 1rem; line-height: 1.75; color: color-mix(in oklab, var(--foreground) 90%, transparent); }
      .blog-prose > * + * { margin-top: 1.25rem; }
      .blog-prose h2 { margin-top: 2.75rem; font-size: 1.5rem; line-height: 1.3; font-weight: 700; letter-spacing: -0.01em; color: var(--foreground); scroll-margin-top: 6rem; }
      .blog-prose h3 { margin-top: 2rem; font-size: 1.15rem; font-weight: 600; color: var(--foreground); scroll-margin-top: 6rem; }
      .blog-prose a { text-decoration: underline; text-underline-offset: 3px; }
      .blog-prose strong { color: var(--foreground); font-weight: 600; }
      .blog-prose ul { list-style: disc; padding-left: 1.5rem; }
      .blog-prose ol { list-style: decimal; padding-left: 1.5rem; }
      .blog-prose li + li { margin-top: 0.4rem; }
      .blog-prose figure { margin-top: 2rem; margin-bottom: 2rem; }
      .blog-prose figcaption { margin-top: 0.6rem; text-align: center; font-size: 0.85rem; color: var(--muted-foreground); }
      .blog-prose table { width: 100%; border-collapse: collapse; font-size: 0.9rem; }
      .blog-prose th, .blog-prose td { border-bottom: 1px solid var(--border); padding: 0.6rem 0.5rem; text-align: left; vertical-align: top; }
      .blog-prose th { color: var(--foreground); font-weight: 600; }
      .blog-prose blockquote { border-left: 3px solid #10b981; padding-left: 1rem; color: var(--muted-foreground); }
      .blog-prose .not-prose { margin-top: 1.5rem; }
    `}</style>
  );
}
