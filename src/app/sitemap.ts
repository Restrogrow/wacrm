import { readdirSync } from "node:fs";
import nodePath from "node:path";
import type { MetadataRoute } from "next";
import { SITE_URL } from "@/lib/seo";
import { BLOG_POSTS } from "@/lib/blog";
import { getPublishedRows } from "@/lib/blog-db";

type Entry = {
  path: string;
  /** Date the page's content last really changed (YYYY-MM-DD). Bump it when you edit the page. */
  updated: string;
  changeFrequency: MetadataRoute.Sitemap[number]["changeFrequency"];
  priority: number;
  /** Site-relative image URLs on the page, listed so Google Images finds them. */
  images?: string[];
};

/** The WebP images in public/blog/<slug>/ (built by scripts/build-blog-images.mjs), cover first. */
function blogImages(slug: string): string[] {
  try {
    return readdirSync(nodePath.join(process.cwd(), "public", "blog", slug))
      .filter((f) => f.endsWith(".webp"))
      .sort((a, b) => (a === "cover.webp" ? -1 : b === "cover.webp" ? 1 : a.localeCompare(b)))
      .map((f) => `/blog/${slug}/${f}`);
  } catch {
    return [];
  }
}

// Real last-changed dates, not "now": Google ignores <lastmod> on sites
// where every URL claims to have changed on every crawl.
const PAGES: Entry[] = [
  { path: "/", updated: "2026-10-22", changeFrequency: "weekly", priority: 1 },
  { path: "/pricing", updated: "2026-10-20", changeFrequency: "weekly", priority: 0.9 },
  { path: "/demo", updated: "2026-10-20", changeFrequency: "monthly", priority: 0.9 },
  { path: "/about", updated: "2026-10-20", changeFrequency: "monthly", priority: 0.7 },
  { path: "/contact", updated: "2026-10-16", changeFrequency: "monthly", priority: 0.7 },
  { path: "/whatsapp-crm-for-ecommerce", updated: "2026-10-16", changeFrequency: "monthly", priority: 0.8 },
  { path: "/whatsapp-crm-for-real-estate", updated: "2026-10-16", changeFrequency: "monthly", priority: 0.8 },
  { path: "/whatsapp-crm-for-education", updated: "2026-10-16", changeFrequency: "monthly", priority: 0.8 },
  { path: "/whatsapp-crm-vs-whatsapp-business-app", updated: "2026-10-16", changeFrequency: "monthly", priority: 0.7 },
  { path: "/wati-alternative", updated: "2026-10-16", changeFrequency: "monthly", priority: 0.8 },
  { path: "/interakt-alternative", updated: "2026-10-16", changeFrequency: "monthly", priority: 0.8 },
  { path: "/aisensy-alternative", updated: "2026-10-16", changeFrequency: "monthly", priority: 0.8 },
  { path: "/wati-vs-interakt-vs-aisensy", updated: "2026-10-16", changeFrequency: "monthly", priority: 0.8 },
  { path: "/official-vs-unofficial-whatsapp-api", updated: "2026-10-16", changeFrequency: "monthly", priority: 0.7 },
  { path: "/docs", updated: "2026-10-18", changeFrequency: "monthly", priority: 0.6 },
  { path: "/docs/api", updated: "2026-10-18", changeFrequency: "monthly", priority: 0.5 },
  { path: "/security", updated: "2026-10-09", changeFrequency: "yearly", priority: 0.3 },
  { path: "/terms", updated: "2026-10-09", changeFrequency: "yearly", priority: 0.3 },
  { path: "/privacy", updated: "2026-10-16", changeFrequency: "yearly", priority: 0.3 },
  { path: "/disclaimer", updated: "2026-10-09", changeFrequency: "yearly", priority: 0.3 },
];

export default async function sitemap(): Promise<MetadataRoute.Sitemap> {
  const dbPosts = (await getPublishedRows()).filter((r) => !r.noindex);

  const posts: Entry[] = [
    ...BLOG_POSTS.map((post) => ({
      path: `/blog/${post.slug}`,
      updated: post.dateModified ?? post.datePublished,
      changeFrequency: "monthly" as const,
      priority: 0.6,
      images: blogImages(post.slug),
    })),
    ...dbPosts.map((row) => ({
      path: `/blog/${row.slug}`,
      updated: row.updated_at.slice(0, 10),
      changeFrequency: "monthly" as const,
      priority: 0.6,
      images: row.cover_url ? [row.cover_url] : [],
    })),
  ];

  // The blog index changes whenever a post is added or edited.
  const newestPost = posts.reduce((max, p) => (p.updated > max ? p.updated : max), "2026-10-17");
  const blogIndex: Entry = { path: "/blog", updated: newestPost, changeFrequency: "weekly", priority: 0.7 };

  return [...PAGES, blogIndex, ...posts].map(({ path, updated, changeFrequency, priority, images }) => ({
    url: `${SITE_URL}${path}`,
    lastModified: updated,
    changeFrequency,
    priority,
    ...(images?.length
      ? { images: images.map((src) => (src.startsWith("http") ? src : `${SITE_URL}${src}`)) }
      : {}),
  }));
}
