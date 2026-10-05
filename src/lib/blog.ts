// Single source of truth for blog post metadata, shared by the /blog index
// page and sitemap.ts so a new post only needs an entry here plus its own
// page.tsx under src/app/blog/<slug>/.
export const BLOG_POSTS = [
  {
    slug: "whatsapp-business-api-verification-guide",
    title: "How to Get WhatsApp Business API Verified: A Step-by-Step Guide",
    description:
      "What Meta Business verification and WhatsApp Business API approval actually require, in order — from a Meta Business Manager account to your first approved number.",
    datePublished: "2026-10-05",
  },
  {
    slug: "whatsapp-broadcast-template-rules",
    title: "WhatsApp Broadcast Template Rules Explained",
    description:
      "What Meta actually checks before approving a WhatsApp message template, the categories that affect pricing, and the most common reasons templates get rejected.",
    datePublished: "2026-10-05",
  },
] as const;
