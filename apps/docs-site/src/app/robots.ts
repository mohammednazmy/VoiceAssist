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
      // OpenAI crawlers
      {
        userAgent: "GPTBot",
        allow: ["/", "/agent/", "/docs/", "/search-index.json", "/sitemap.xml"],
      },
      // Anthropic crawlers
      {
        userAgent: "Claude-Web",
        allow: ["/", "/agent/", "/docs/", "/search-index.json", "/sitemap.xml"],
      },
      {
        userAgent: "Anthropic-AI",
        allow: ["/", "/agent/", "/docs/", "/search-index.json", "/sitemap.xml"],
      },
      {
        userAgent: "ClaudeBot",
        allow: ["/", "/agent/", "/docs/", "/search-index.json", "/sitemap.xml"],
      },
      // Google AI crawlers
      {
        userAgent: "Google-Extended",
        allow: ["/", "/agent/", "/docs/", "/search-index.json", "/sitemap.xml"],
      },
      // Perplexity
      {
        userAgent: "PerplexityBot",
        allow: ["/", "/agent/", "/docs/", "/search-index.json", "/sitemap.xml"],
      },
    ],
    sitemap: `${BASE_URL}/sitemap.xml`,
  };
}
