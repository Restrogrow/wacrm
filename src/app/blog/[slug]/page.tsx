// Public page for a blog post written in /admin/blog. Hand-coded posts
// (src/app/blog/<slug>/page.tsx) are static segments, so Next.js matches
// them first; this route only serves database posts.

import type { Metadata } from 'next';
import { notFound } from 'next/navigation';

import { BlogMarkdown } from '@/components/blog/markdown';
import { BlogPostLayout } from '@/components/blog/post-layout';
import { getPublishedRow, getRelatedPosts, rowToPost } from '@/lib/blog-db';
import { extractHeadings } from '@/lib/blog-utils';

// Re-check the database at most once a minute (also gives scheduled posts a go-live window).
export const revalidate = 60;

type Params = Promise<{ slug: string }>;

export async function generateMetadata({ params }: { params: Params }): Promise<Metadata> {
  const { slug } = await params;
  const row = await getPublishedRow(slug);
  if (!row) return { title: 'Post not found', robots: { index: false } };
  const post = rowToPost(row);

  return {
    title: row.seo_title ? { absolute: row.seo_title } : row.title,
    description: row.description,
    keywords: post.keywords,
    alternates: { canonical: row.canonical_url || `/blog/${row.slug}` },
    openGraph: {
      type: 'article',
      url: `/blog/${row.slug}`,
      title: `${row.seo_title || row.title} | Repeat Grow`,
      description: row.description,
      publishedTime: row.published_at ?? undefined,
      modifiedTime: row.updated_at,
      section: row.category,
      tags: row.tags,
      images: row.cover_url ? [{ url: row.cover_url, alt: row.cover_alt || row.title }] : undefined,
    },
    twitter: {
      card: 'summary_large_image',
      title: row.seo_title || row.title,
      description: row.description,
      images: row.cover_url ? [row.cover_url] : undefined,
    },
    robots: row.noindex ? { index: false, follow: true } : { index: true, follow: true },
  };
}

export default async function DbBlogPostPage({ params }: { params: Params }) {
  const { slug } = await params;
  const row = await getPublishedRow(slug);
  if (!row) notFound();

  const post = rowToPost(row);
  const toc = extractHeadings(row.content)
    .filter((h) => h.level === 2)
    .map((h) => ({ id: h.id, label: h.label }));
  const faq = (row.faq ?? []).filter((f) => f.question?.trim() && f.answer?.trim());
  const related = await getRelatedPosts(row.slug, row.category);

  return (
    <BlogPostLayout post={post} toc={toc} faq={faq} related={related} author={row.author_name}>
      <BlogMarkdown content={row.content} />
    </BlogPostLayout>
  );
}
