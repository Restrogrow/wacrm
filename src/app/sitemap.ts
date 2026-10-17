import type { MetadataRoute } from "next";
import { SITE_URL } from "@/lib/seo";
import { BLOG_POSTS } from "@/lib/blog";
import { getPublishedRows } from "@/lib/blog-db";

export default async function sitemap(): Promise<MetadataRoute.Sitemap> {
  const lastModified = new Date();
  const dbPosts = (await getPublishedRows()).filter((r) => !r.noindex);

  const pages: Array<{
    path: string;
    changeFrequency: MetadataRoute.Sitemap[number]["changeFrequency"];
    priority: number;
  }> = [
    { path: "/", changeFrequency: "weekly", priority: 1 },
    { path: "/pricing", changeFrequency: "weekly", priority: 0.9 },
    { path: "/demo", changeFrequency: "monthly", priority: 0.9 },
    { path: "/whatsapp-crm-for-ecommerce", changeFrequency: "monthly", priority: 0.7 },
    { path: "/whatsapp-crm-for-real-estate", changeFrequency: "monthly", priority: 0.7 },
    { path: "/whatsapp-crm-for-education", changeFrequency: "monthly", priority: 0.7 },
    { path: "/whatsapp-crm-vs-whatsapp-business-app", changeFrequency: "monthly", priority: 0.6 },
    { path: "/wati-alternative", changeFrequency: "monthly", priority: 0.8 },
    { path: "/interakt-alternative", changeFrequency: "monthly", priority: 0.8 },
    { path: "/aisensy-alternative", changeFrequency: "monthly", priority: 0.8 },
    { path: "/wati-vs-interakt-vs-aisensy", changeFrequency: "monthly", priority: 0.8 },
    { path: "/official-vs-unofficial-whatsapp-api", changeFrequency: "monthly", priority: 0.6 },
    { path: "/blog", changeFrequency: "weekly", priority: 0.6 },
    { path: "/docs", changeFrequency: "monthly", priority: 0.6 },
    { path: "/docs/api", changeFrequency: "monthly", priority: 0.6 },
    { path: "/about", changeFrequency: "monthly", priority: 0.6 },
    { path: "/contact", changeFrequency: "monthly", priority: 0.6 },
    { path: "/security", changeFrequency: "yearly", priority: 0.3 },
    { path: "/terms", changeFrequency: "yearly", priority: 0.3 },
    { path: "/privacy", changeFrequency: "yearly", priority: 0.3 },
    { path: "/disclaimer", changeFrequency: "yearly", priority: 0.3 },
    ...BLOG_POSTS.map((post) => ({
      path: `/blog/${post.slug}`,
      changeFrequency: "monthly" as const,
      priority: 0.5,
    })),
    ...dbPosts.map((row) => ({
      path: `/blog/${row.slug}`,
      changeFrequency: "monthly" as const,
      priority: 0.5,
    })),
  ];

  return pages.map(({ path, changeFrequency, priority }) => ({
    url: `${SITE_URL}${path}`,
    lastModified,
    changeFrequency,
    priority,
  }));
}
