// Validation for the admin blog API. Hand-rolled (no schema lib in the
// project) and strict: anything unexpected is dropped, not stored.

import { slugify, type FaqEntry } from '@/lib/blog-utils';

export interface BlogInput {
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
}

const str = (v: unknown, max: number): string => (typeof v === 'string' ? v.trim().slice(0, max) : '');
const strList = (v: unknown, maxItems: number, maxLen: number): string[] =>
  Array.isArray(v)
    ? Array.from(new Set(v.map((x) => str(x, maxLen)).filter(Boolean))).slice(0, maxItems)
    : [];

function safeUrl(v: unknown, allowRelative: boolean): string | null {
  const s = str(v, 1000);
  if (!s) return null;
  if (allowRelative && s.startsWith('/') && !s.startsWith('//')) return s;
  try {
    const u = new URL(s);
    return u.protocol === 'https:' || u.protocol === 'http:' ? u.toString() : null;
  } catch {
    return null;
  }
}

export function parseBlogInput(body: unknown): { ok: true; value: BlogInput } | { ok: false; error: string } {
  if (!body || typeof body !== 'object') return { ok: false, error: 'Invalid request body' };
  const b = body as Record<string, unknown>;

  const title = str(b.title, 200);
  if (!title) return { ok: false, error: 'Title is required' };

  const slug = slugify(str(b.slug, 120) || title);
  if (!slug) return { ok: false, error: 'Slug is required' };

  const status = b.status === 'published' ? 'published' : 'draft';
  const content = typeof b.content === 'string' ? b.content.slice(0, 200_000) : '';
  const description = str(b.description, 300);

  if (status === 'published') {
    if (!description) return { ok: false, error: 'Add a meta description before publishing' };
    if (content.trim().length < 50) return { ok: false, error: 'Write some content before publishing' };
  }

  let publishedAt: string | null = null;
  if (status === 'published') {
    const d = typeof b.published_at === 'string' ? new Date(b.published_at) : new Date();
    publishedAt = (Number.isNaN(d.getTime()) ? new Date() : d).toISOString();
  }

  const faq: FaqEntry[] = Array.isArray(b.faq)
    ? b.faq
        .map((f) => {
          const o = (f ?? {}) as Record<string, unknown>;
          return { question: str(o.question, 300), answer: str(o.answer, 2000) };
        })
        .filter((f) => f.question && f.answer)
        .slice(0, 20)
    : [];

  return {
    ok: true,
    value: {
      slug,
      title,
      seo_title: str(b.seo_title, 120) || null,
      description,
      content,
      category: str(b.category, 60) || 'General',
      tags: strList(b.tags, 15, 40),
      focus_keyword: str(b.focus_keyword, 100) || null,
      keywords: strList(b.keywords, 20, 80),
      cover_url: safeUrl(b.cover_url, true),
      cover_alt: str(b.cover_alt, 200),
      faq,
      author_name: str(b.author_name, 80) || 'the Repeat Grow team',
      canonical_url: safeUrl(b.canonical_url, false),
      noindex: b.noindex === true,
      featured: b.featured === true,
      status,
      published_at: publishedAt,
    },
  };
}
