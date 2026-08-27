import type { MetadataRoute } from "next";
import { SITE_URL } from "@/lib/seo";

export default function robots(): MetadataRoute.Robots {
  return {
    rules: [
      {
        userAgent: "*",
        allow: "/",
        disallow: [
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
          "/settings",
          "/login",
          "/signup",
          "/forgot-password",
          "/join",
        ],
      },
    ],
    sitemap: `${SITE_URL}/sitemap.xml`,
  };
}
