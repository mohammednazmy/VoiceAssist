/**
 * Agent Search API
 *
 * Simple text search across documentation titles, summaries, and content.
 *
 * GET /agent/search?q=authentication
 * GET /agent/search?q=api&limit=10
 */

import { NextRequest, NextResponse } from "next/server";
import fs from "fs";
import path from "path";
import matter from "gray-matter";
import { DOCS_DIR, parseMetadata, DocIndexEntry } from "@/lib/docs";

interface SearchResult extends DocIndexEntry {
  score: number;
  snippet?: string;
}

/**
 * Recursively scan and search docs
 */
function searchDocs(
  dir: string,
  query: string,
  basePath: string = "",
): SearchResult[] {
  const results: SearchResult[] = [];
  const queryLower = query.toLowerCase();
  const queryWords = queryLower.split(/\s+/).filter((w) => w.length > 2);

  if (!fs.existsSync(dir)) {
    return results;
  }

  const items = fs.readdirSync(dir);

  for (const item of items) {
    const fullPath = path.join(dir, item);
    const relativePath = path.join(basePath, item);
    const stat = fs.statSync(fullPath);

    if (stat.isDirectory()) {
      if (!item.startsWith(".") && item !== "node_modules") {
        results.push(...searchDocs(fullPath, query, relativePath));
      }
    } else if (item.endsWith(".md")) {
      try {
        const rawContent = fs.readFileSync(fullPath, "utf-8");
        const { data, content } = matter(rawContent);
        const { metadata } = parseMetadata(data, relativePath);

        // Calculate relevance score
        let score = 0;
        const titleLower = metadata.title.toLowerCase();
        const summaryLower = (metadata.summary || "").toLowerCase();
        const contentLower = content.toLowerCase();
        const tagsLower = (metadata.tags || []).map((t) => t.toLowerCase());

        // Title match (highest weight)
        if (titleLower.includes(queryLower)) {
          score += 100;
        }
        for (const word of queryWords) {
          if (titleLower.includes(word)) score += 20;
        }

        // Summary match (high weight)
        if (summaryLower.includes(queryLower)) {
          score += 50;
        }
        for (const word of queryWords) {
          if (summaryLower.includes(word)) score += 10;
        }

        // Tag match (medium weight)
        for (const tag of tagsLower) {
          if (tag.includes(queryLower)) score += 30;
          for (const word of queryWords) {
            if (tag.includes(word)) score += 15;
          }
        }

        // Content match (lower weight)
        if (contentLower.includes(queryLower)) {
          score += 20;
        }
        for (const word of queryWords) {
          if (contentLower.includes(word)) score += 3;
        }

        if (score > 0) {
          // Extract snippet around the first match
          let snippet: string | undefined;
          const matchIndex = contentLower.indexOf(queryLower);
          if (matchIndex >= 0) {
            const start = Math.max(0, matchIndex - 50);
            const end = Math.min(
              content.length,
              matchIndex + query.length + 100,
            );
            snippet =
              (start > 0 ? "..." : "") +
              content.slice(start, end).replace(/\n/g, " ").trim() +
              (end < content.length ? "..." : "");
          }

          results.push({
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
            score,
            snippet,
          });
        }
      } catch (error) {
        console.warn(`Could not search ${relativePath}:`, error);
      }
    }
  }

  return results;
}

export async function GET(request: NextRequest) {
  const { searchParams } = new URL(request.url);

  const query = searchParams.get("q");
  const limitParam = searchParams.get("limit");
  const limit = limitParam ? parseInt(limitParam, 10) : 20;

  if (!query || query.length < 2) {
    return NextResponse.json(
      {
        error:
          "Query parameter 'q' is required and must be at least 2 characters",
        example: "/agent/search?q=authentication",
      },
      { status: 400 },
    );
  }

  let results = searchDocs(DOCS_DIR, query);

  // Sort by score descending
  results.sort((a, b) => b.score - a.score);

  // Apply limit
  results = results.slice(0, limit);

  const response = {
    query,
    count: results.length,
    generated_at: new Date().toISOString(),
    results,
  };

  return NextResponse.json(response, {
    headers: {
      "Cache-Control": "public, s-maxage=60, stale-while-revalidate=300",
    },
  });
}
