/**
 * Robots.txt Generator
 *
 * Controls search engine crawling behavior.
 * Accessible at /robots.txt
 */

import { MetadataRoute } from "next";

const BASE_URL =
  process.env.NEXT_PUBLIC_SITE_URL || "https://assistdocs.asimo.io";

export default function robots(): MetadataRoute.Robots {
  return {
    rules: [
      {
        userAgent: "*",
        allow: "/",
        disallow: ["/api/", "/_next/"],
      },
      {
        userAgent: "GPTBot",
        allow: ["/", "/agent/", "/docs/"],
      },
      {
        userAgent: "Claude-Web",
        allow: ["/", "/agent/", "/docs/"],
      },
      {
        userAgent: "Anthropic-AI",
        allow: ["/", "/agent/", "/docs/"],
      },
    ],
    sitemap: `${BASE_URL}/sitemap.xml`,
  };
}
