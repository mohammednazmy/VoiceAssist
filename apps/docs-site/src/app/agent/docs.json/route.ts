/**
 * Agent Docs API
 *
 * Provides a full list of all documentation with metadata.
 * Supports filtering by status, audience, tags, etc.
 *
 * GET /agent/docs.json
 * GET /agent/docs.json?audience=agent
 * GET /agent/docs.json?status=stable
 * GET /agent/docs.json?tag=api
 */

import { NextRequest, NextResponse } from "next/server";
import fs from "fs";
import path from "path";
import matter from "gray-matter";
import {
  DOCS_DIR,
  parseMetadata,
  DocMetadata,
  DocIndexEntry,
} from "@/lib/docs";

// Cache for document index
let cachedDocs: DocIndexEntry[] | null = null;
let cacheTime: number = 0;
const CACHE_TTL = 5 * 60 * 1000; // 5 minutes

/**
 * Recursively scan directory for markdown files
 */
function scanDocsDir(dir: string, basePath: string = ""): DocIndexEntry[] {
  const entries: DocIndexEntry[] = [];

  if (!fs.existsSync(dir)) {
    return entries;
  }

  const items = fs.readdirSync(dir);

  for (const item of items) {
    const fullPath = path.join(dir, item);
    const relativePath = path.join(basePath, item);
    const stat = fs.statSync(fullPath);

    if (stat.isDirectory()) {
      // Skip hidden directories and node_modules
      if (!item.startsWith(".") && item !== "node_modules") {
        entries.push(...scanDocsDir(fullPath, relativePath));
      }
    } else if (item.endsWith(".md")) {
      try {
        const content = fs.readFileSync(fullPath, "utf-8");
        const { data } = matter(content);
        const { metadata } = parseMetadata(data, relativePath);

        entries.push({
          slug: metadata.slug,
          path: relativePath.replace(/\\/g, "/"),
          title: metadata.title,
          summary: metadata.summary,
          status: metadata.status,
          stability: metadata.stability,
          owner: metadata.owner,
          audience: metadata.audience,
          tags: metadata.tags,
          relatedServices: metadata.relatedServices,
          lastUpdated: metadata.lastUpdated,
        });
      } catch (error) {
        // Skip files that can't be parsed
        console.warn(`Could not parse ${relativePath}:`, error);
      }
    }
  }

  return entries;
}

/**
 * Get all documents (with caching)
 */
function getAllDocs(): DocIndexEntry[] {
  const now = Date.now();

  if (cachedDocs && now - cacheTime < CACHE_TTL) {
    return cachedDocs;
  }

  cachedDocs = scanDocsDir(DOCS_DIR);
  cacheTime = now;

  return cachedDocs;
}

export async function GET(request: NextRequest) {
  const { searchParams } = new URL(request.url);

  // Get filter parameters
  const status = searchParams.get("status");
  const audience = searchParams.get("audience");
  const tag = searchParams.get("tag");
  const owner = searchParams.get("owner");
  const stability = searchParams.get("stability");

  let docs = getAllDocs();

  // Apply filters
  if (status) {
    docs = docs.filter((d) => d.status === status);
  }
  if (audience) {
    docs = docs.filter((d) => d.audience?.includes(audience as any));
  }
  if (tag) {
    docs = docs.filter((d) => d.tags?.includes(tag));
  }
  if (owner) {
    docs = docs.filter((d) => d.owner === owner);
  }
  if (stability) {
    docs = docs.filter((d) => d.stability === stability);
  }

  // Sort by lastUpdated descending
  docs.sort((a, b) => {
    if (!a.lastUpdated) return 1;
    if (!b.lastUpdated) return -1;
    return b.lastUpdated.localeCompare(a.lastUpdated);
  });

  const response = {
    count: docs.length,
    generated_at: new Date().toISOString(),
    filters: {
      status: status || null,
      audience: audience || null,
      tag: tag || null,
      owner: owner || null,
      stability: stability || null,
    },
    docs,
  };

  return NextResponse.json(response, {
    headers: {
      "Cache-Control": "public, s-maxage=300, stale-while-revalidate=3600",
    },
  });
}
