import type { Metadata } from 'next';
import Image from 'next/image';
import Link from 'next/link';

import { SITE_URL, buildBreadcrumbSchema } from '@/lib/seo';
import { BLOG_POSTS, formatPostDate, type BlogPost } from '@/lib/blog';

const PAGE_DESCRIPTION =
  'Practical guides on the WhatsApp Business API, templates, Shopify notifications, payments and selling on WhatsApp in India, from Repeat Grow.';

const BREADCRUMB_SCHEMA = buildBreadcrumbSchema([{ name: 'Blog', path: '/blog' }]);

const BLOG_SCHEMA = {
  '@context': 'https://schema.org',
  '@type': 'Blog',
  name: 'Repeat Grow Blog',
  url: `${SITE_URL}/blog`,
  description: PAGE_DESCRIPTION,
  blogPost: BLOG_POSTS.map((post) => ({
    '@type': 'BlogPosting',
    headline: post.title,
    url: `${SITE_URL}/blog/${post.slug}`,
    datePublished: post.datePublished,
    image: `${SITE_URL}${post.cover}`,
  })),
};

export const metadata: Metadata = {
  title: 'Blog: WhatsApp Business guides',
  description: PAGE_DESCRIPTION,
  alternates: { canonical: '/blog' },
  openGraph: {
    type: 'website',
    url: '/blog',
    title: 'Blog | Repeat Grow',
    description: PAGE_DESCRIPTION,
  },
  robots: { index: true, follow: true },
};

const GUIDES = [
  {
    href: '/whatsapp-crm-vs-whatsapp-business-app',
    title: 'WhatsApp CRM vs. the WhatsApp Business App: What’s the Difference?',
    description:
      'What changes (shared inbox, pipelines, automation) once a team outgrows the free WhatsApp Business app.',
  },
  {
    href: '/official-vs-unofficial-whatsapp-api',
    title: 'Official WhatsApp Business API vs. Unofficial WhatsApp Tools',
    description:
      'Why unofficial WhatsApp automation tools risk getting a business number banned, and how the official API avoids that.',
  },
];

function PostMeta({ post }: { post: BlogPost }) {
  return (
    <p className="text-xs text-muted-foreground">
      <time dateTime={post.datePublished}>{formatPostDate(post.datePublished)}</time> ·{' '}
      {post.readMinutes} min read
    </p>
  );
}

export default function BlogIndexPage() {
  const [featured, ...rest] = BLOG_POSTS;

  return (
    <div className="mx-auto max-w-6xl px-5 py-12 sm:px-6 sm:py-16">
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: JSON.stringify(BREADCRUMB_SCHEMA) }}
      />
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: JSON.stringify(BLOG_SCHEMA) }}
      />

      <Link href="/" className="text-sm text-muted-foreground hover:text-foreground">
        &larr; Back to Repeat Grow
      </Link>

      <header className="mt-6 max-w-2xl">
        <p className="text-xs font-semibold tracking-wide text-emerald-600 uppercase dark:text-emerald-400">
          Repeat Grow Blog
        </p>
        <h1 className="mt-2 text-3xl font-bold tracking-tight sm:text-4xl">
          Grow your business on WhatsApp
        </h1>
        <p className="mt-4 text-base leading-relaxed text-foreground/80">{PAGE_DESCRIPTION}</p>
      </header>

      {featured && (
        <Link
          href={`/blog/${featured.slug}`}
          className="group mt-10 grid overflow-hidden rounded-2xl border border-border transition-colors hover:border-foreground/30 md:grid-cols-2"
        >
          <Image
            src={featured.cover}
            alt={featured.coverAlt}
            width={1200}
            height={630}
            priority
            unoptimized
            className="aspect-[1200/630] h-full w-full object-cover"
          />
          <div className="flex flex-col justify-center gap-3 p-6 sm:p-8">
            <p className="text-xs font-semibold tracking-wide text-emerald-600 uppercase dark:text-emerald-400">
              Latest · {featured.category}
            </p>
            <h2 className="text-2xl leading-snug font-bold tracking-tight group-hover:underline">
              {featured.title}
            </h2>
            <p className="text-sm leading-relaxed text-foreground/80">{featured.description}</p>
            <PostMeta post={featured} />
          </div>
        </Link>
      )}

      {rest.length > 0 && (
        <section aria-labelledby="all-posts" className="mt-14">
          <h2 id="all-posts" className="text-xl font-bold tracking-tight">
            All articles
          </h2>
          <div className="mt-6 grid gap-6 sm:grid-cols-2 lg:grid-cols-3">
            {rest.map((post) => (
              <Link
                key={post.slug}
                href={`/blog/${post.slug}`}
                className="group flex flex-col overflow-hidden rounded-xl border border-border transition-colors hover:border-foreground/30"
              >
                <Image
                  src={post.cover}
                  alt={post.coverAlt}
                  width={1200}
                  height={630}
                  unoptimized
                  className="aspect-[1200/630] w-full object-cover"
                />
                <div className="flex flex-1 flex-col gap-2 p-5">
                  <p className="text-xs font-semibold tracking-wide text-emerald-600 uppercase dark:text-emerald-400">
                    {post.category}
                  </p>
                  <h3 className="font-semibold leading-snug group-hover:underline">{post.title}</h3>
                  <p className="line-clamp-3 text-sm leading-relaxed text-foreground/80">
                    {post.description}
                  </p>
                  <div className="mt-auto pt-2">
                    <PostMeta post={post} />
                  </div>
                </div>
              </Link>
            ))}
          </div>
        </section>
      )}

      <section aria-labelledby="guides" className="mt-16">
        <h2 id="guides" className="text-xl font-bold tracking-tight">
          Guides &amp; comparisons
        </h2>
        <div className="mt-6 grid gap-6 sm:grid-cols-2">
          {GUIDES.map((guide) => (
            <Link
              key={guide.href}
              href={guide.href}
              className="group rounded-xl border border-border p-5 transition-colors hover:border-foreground/30"
            >
              <h3 className="font-semibold leading-snug group-hover:underline">{guide.title}</h3>
              <p className="mt-2 text-sm leading-relaxed text-foreground/80">{guide.description}</p>
            </Link>
          ))}
        </div>
      </section>

      <aside className="mt-16 rounded-2xl border border-emerald-500/30 bg-emerald-500/5 p-6 text-center sm:p-10">
        <p className="text-xl font-semibold">Ready to run your business on WhatsApp?</p>
        <p className="mx-auto mt-2 max-w-xl text-sm leading-relaxed text-foreground/80">
          Shared inbox, broadcasts, automations and Shopify &amp; Calendly integrations on the
          official WhatsApp Business API. Free for 7 days.
        </p>
        <div className="mt-6 flex flex-wrap justify-center gap-3">
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
    </div>
  );
}
