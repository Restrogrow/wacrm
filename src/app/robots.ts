import type { MetadataRoute } from "next";
import { SITE_URL } from "@/lib/seo";

// AI search and answer engines. Listed explicitly so it is clear they are
// welcome on the public pages; they get the same limits as everyone else.
const AI_CRAWLERS = [
  "GPTBot",
  "OAI-SearchBot",
  "ChatGPT-User",
  "PerplexityBot",
  "Perplexity-User",
  "ClaudeBot",
  "Claude-SearchBot",
  "Google-Extended",
  "Applebot-Extended",
  "Bingbot",
];

const PRIVATE_PATHS = [
  "/api/",
  "/admin",
  "/dashboard",
  "/inbox",
  "/contacts",
  "/pipelines",
  "/broadcasts",
  "/automations",
  "/flows",
  "/notifications",
  "/calls",
  "/settings",
  "/login",
  "/signup",
  "/forgot-password",
  "/join",
  "/connect",
];

export default function robots(): MetadataRoute.Robots {
  return {
    rules: [
      {
        userAgent: AI_CRAWLERS,
        allow: ["/", "/api/v1/openapi.json"],
        disallow: PRIVATE_PATHS,
      },
      {
        userAgent: "*",
        // The OpenAPI spec is public documentation; keep it crawlable even
        // though the rest of /api/ is not.
        allow: ["/", "/api/v1/openapi.json"],
        disallow: PRIVATE_PATHS,
      },
    ],
    sitemap: `${SITE_URL}/sitemap.xml`,
  };
}
