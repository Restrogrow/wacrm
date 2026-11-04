import type { MetadataRoute } from "next";
import { DEFAULT_DESCRIPTION } from "@/lib/seo";

export default function manifest(): MetadataRoute.Manifest {
  return {
    name: "Repeat Grow, WhatsApp CRM",
    short_name: "Repeat Grow",
    description: DEFAULT_DESCRIPTION,
    start_url: "/login",
    display: "standalone",
    background_color: "#020617",
    theme_color: "#020617",
    // Real sizes, not "any": Chrome wants a declared 512px icon before it
    // treats the app as installable, and chooses badly when left to guess.
    // logo-v2.png is the 512×512 asset already sitting in public/.
    //
    // Deliberately no `purpose: "maskable"` on any of these — a maskable
    // icon needs roughly 20% safe padding around the mark or Android
    // crops into the logo, and none of these have it. Declaring it
    // without the padding looks worse than not declaring it. A padded
    // asset is worth adding later.
    icons: [
      { src: "/icon.png", sizes: "256x256", type: "image/png" },
      { src: "/apple-icon.png", sizes: "180x180", type: "image/png" },
      { src: "/logo-v2.png", sizes: "512x512", type: "image/png" },
    ],
  };
}
