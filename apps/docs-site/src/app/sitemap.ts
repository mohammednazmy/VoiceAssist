/**
 * Dynamic Sitemap Generator
 *
 * Generates sitemap.xml for all documentation pages.
 * Accessible at /sitemap.xml
 */

import { MetadataRoute } from "next";
import fs from "fs";
import path from "path";
import matter from "gray-matter";
import { DOCS_DIR, parseMetadata } from "@/lib/docs";

const BASE_URL =
  process.env.NEXT_PUBLIC_SITE_URL || "https://assistdocs.asimo.io";

interface SitemapEntry {
  url: string;
  lastModified: Date;
  changeFrequency:
    | "always"
    | "hourly"
    | "daily"
    | "weekly"
    | "monthly"
    | "yearly"
    | "never";
  priority: number;
}

/**
 * Recursively scan docs directory for sitemap entries
 */
function scanForSitemap(dir: string, basePath: string = ""): SitemapEntry[] {
  const entries: SitemapEntry[] = [];

  if (!fs.existsSync(dir)) {
    return entries;
  }

  const items = fs.readdirSync(dir);

  for (const item of items) {
    const fullPath = path.join(dir, item);
    const relativePath = path.join(basePath, item);
    const stat = fs.statSync(fullPath);

    if (stat.isDirectory()) {
      if (!item.startsWith(".") && item !== "node_modules") {
        entries.push(...scanForSitemap(fullPath, relativePath));
      }
    } else if (item.endsWith(".md")) {
      try {
        const content = fs.readFileSync(fullPath, "utf-8");
        const { data } = matter(content);
        const { metadata } = parseMetadata(data, relativePath);

        // Determine priority based on status and path
        let priority = 0.5;
        if (metadata.status === "stable") priority = 0.8;
        if (metadata.status === "deprecated") priority = 0.3;
        if (relativePath.includes("README")) priority = 0.9;
        if (relativePath.includes("AGENT_ONBOARDING")) priority = 0.9;
        if (relativePath.includes("UNIFIED_ARCHITECTURE")) priority = 0.9;

        // Determine change frequency
        let changeFrequency: SitemapEntry["changeFrequency"] = "weekly";
        if (metadata.status === "deprecated") changeFrequency = "monthly";
        if (metadata.status === "draft") changeFrequency = "daily";

        // Build URL from slug or path
        const urlPath =
          metadata.slug ||
          relativePath.replace(/\.md$/i, "").replace(/\\/g, "/");

        entries.push({
          url: `${BASE_URL}/docs/${urlPath}`,
          lastModified: metadata.lastUpdated
            ? new Date(metadata.lastUpdated)
            : stat.mtime,
          changeFrequency,
          priority,
        });
      } catch (error) {
        console.warn(`Could not process ${relativePath} for sitemap:`, error);
      }
    }
  }

  return entries;
}

export default function sitemap(): MetadataRoute.Sitemap {
  const docEntries = scanForSitemap(DOCS_DIR);

  // Add static pages and hub pages
  const staticPages: SitemapEntry[] = [
    {
      url: BASE_URL,
      lastModified: new Date(),
      changeFrequency: "daily",
      priority: 1.0,
    },
    // Agent API endpoints
    {
      url: `${BASE_URL}/agent/index.json`,
      lastModified: new Date(),
      changeFrequency: "weekly",
      priority: 0.9,
    },
    {
      url: `${BASE_URL}/agent/docs.json`,
      lastModified: new Date(),
      changeFrequency: "daily",
      priority: 0.8,
    },
    // Key hub pages
    {
      url: `${BASE_URL}/ai/onboarding`,
      lastModified: new Date(),
      changeFrequency: "weekly",
      priority: 0.95,
    },
    {
      url: `${BASE_URL}/ai/api`,
      lastModified: new Date(),
      changeFrequency: "weekly",
      priority: 0.9,
    },
    {
      url: `${BASE_URL}/ai/status`,
      lastModified: new Date(),
      changeFrequency: "daily",
      priority: 0.9,
    },
    {
      url: `${BASE_URL}/dev/architecture`,
      lastModified: new Date(),
      changeFrequency: "weekly",
      priority: 0.85,
    },
    {
      url: `${BASE_URL}/reference/api`,
      lastModified: new Date(),
      changeFrequency: "weekly",
      priority: 0.85,
    },
  ];

  return [...staticPages, ...docEntries];
}
