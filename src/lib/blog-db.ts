// Server-only access to database blog posts (see migration 060).
// All reads use the service-role client; "published" is enforced in the
// query, never trusted from the caller.

import { supabaseAdmin } from '@/lib/flows/admin-client';
import { BLOG_POSTS, type BlogPost } from '@/lib/blog';
import { readMinutes, type FaqEntry } from '@/lib/blog-utils';

export interface DbBlogRow {
  id: string;
  slug: string;
  title: string;
  seo_title: string | null;
  description: string;
  content: string;
  category: string;
  tags: string[];
  focus_keyword: string | null;
  keywords: string[];
  cover_url: string | null;
  cover_alt: string;
  faq: FaqEntry[];
  author_name: string;
  canonical_url: string | null;
  noindex: boolean;
  featured: boolean;
  status: 'draft' | 'published';
  published_at: string | null;
  created_at: string;
  updated_at: string;
}

export const FALLBACK_COVER = '/opengraph-image';

/** Adapt a database row to the shape the shared blog layout/index use. */
export function rowToPost(row: DbBlogRow): BlogPost & { featured: boolean } {
  const published = row.published_at ?? row.created_at;
  return {
    slug: row.slug,
    title: row.title,
    seoTitle: row.seo_title || undefined,
    description: row.description,
    category: row.category,
    datePublished: published.slice(0, 10),
    dateModified: row.updated_at.slice(0, 10) > published.slice(0, 10) ? row.updated_at.slice(0, 10) : undefined,
    readMinutes: readMinutes(row.content),
    cover: row.cover_url || FALLBACK_COVER,
    coverAlt: row.cover_alt || row.title,
    keywords: Array.from(new Set([...(row.focus_keyword ? [row.focus_keyword] : []), ...row.keywords])),
    featured: row.featured,
  };
}

const LIST_COLUMNS =
  'id, slug, title, seo_title, description, category, tags, focus_keyword, keywords, cover_url, cover_alt, featured, status, published_at, created_at, updated_at, content';

/** Published, not-in-the-future posts, newest first. */
export async function getPublishedRows(): Promise<DbBlogRow[]> {
  const { data, error } = await supabaseAdmin()
    .from('blog_posts')
    .select(LIST_COLUMNS)
    .eq('status', 'published')
    .lte('published_at', new Date().toISOString())
    .order('published_at', { ascending: false });
  if (error) {
    // Table missing (migration not applied) or DB down: the static posts still render.
    console.error('[blog] list failed:', error.message);
    return [];
  }
  return (data ?? []) as unknown as DbBlogRow[];
}

export async function getPublishedRow(slug: string): Promise<DbBlogRow | null> {
  const { data, error } = await supabaseAdmin()
    .from('blog_posts')
    .select('*')
    .eq('slug', slug)
    .eq('status', 'published')
    .lte('published_at', new Date().toISOString())
    .maybeSingle();
  if (error) {
    console.error('[blog] get failed:', error.message);
    return null;
  }
  return (data as DbBlogRow | null) ?? null;
}

/** Static + database posts merged, newest first (featured DB post is not reordered here). */
export async function getAllPosts(): Promise<Array<BlogPost & { featured?: boolean }>> {
  const rows = await getPublishedRows();
  const merged = [...rows.map(rowToPost), ...BLOG_POSTS];
  return merged.sort((a, b) => (a.datePublished < b.datePublished ? 1 : a.datePublished > b.datePublished ? -1 : 0));
}

export async function getRelatedPosts(slug: string, category: string, count = 2): Promise<BlogPost[]> {
  const all = (await getAllPosts()).filter((p) => p.slug !== slug);
  return [...all.filter((p) => p.category === category), ...all.filter((p) => p.category !== category)].slice(0, count);
}
