#!/usr/bin/env node
/**
 * Generate static JSON files for agent consumption
 *
 * Generates:
 * - /agent/index.json - Overview of available endpoints
 * - /agent/docs.json - Full document index with metadata
 *
 * These files are generated at build time to support static export.
 */

const fs = require("fs");
const path = require("path");
const matter = require("gray-matter");

const DOCS_DIR =
  process.env.DOCS_DIR || path.join(__dirname, "..", "..", "..", "docs");
const AGENT_DIR = path.join(__dirname, "..", "public", "agent");

// Valid enum values (matching docs.ts)
const VALID_STATUS = ["draft", "experimental", "stable", "deprecated"];
const VALID_STABILITY = ["production", "beta", "experimental", "legacy"];
const VALID_OWNER = [
  "backend",
  "frontend",
  "infra",
  "sre",
  "docs",
  "product",
  "security",
  "mixed",
];
const VALID_AUDIENCE = [
  "human",
  "agent",
  "backend",
  "frontend",
  "devops",
  "admin",
  "user",
];

/**
 * Parse and normalize frontmatter metadata
 */
function parseMetadata(rawData, filePath) {
  const lastUpdated = rawData.lastUpdated || rawData.last_updated || "";
  const summary = rawData.summary || rawData.description || "";

  // Normalize status
  let status = "draft";
  if (rawData.status && VALID_STATUS.includes(rawData.status)) {
    status = rawData.status;
  }

  // Normalize stability
  let stability = undefined;
  if (rawData.stability && VALID_STABILITY.includes(rawData.stability)) {
    stability = rawData.stability;
  }

  // Normalize owner
  let owner = undefined;
  if (rawData.owner && VALID_OWNER.includes(rawData.owner)) {
    owner = rawData.owner;
  }

  // Normalize audience (filter invalid values)
  let audience = undefined;
  if (Array.isArray(rawData.audience)) {
    audience = rawData.audience.filter((a) => VALID_AUDIENCE.includes(a));
    if (audience.length === 0) audience = undefined;
  }

  // Generate slug from filename if not provided
  const defaultSlug = path
    .basename(filePath, ".md")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/(^-|-$)/g, "");

  return {
    title: rawData.title || path.basename(filePath, ".md").replace(/_/g, " "),
    slug: rawData.slug || defaultSlug,
    status,
    lastUpdated: lastUpdated.toString(),
    summary: summary || undefined,
    stability,
    owner,
    audience,
    tags: Array.isArray(rawData.tags) ? rawData.tags : undefined,
    relatedServices: Array.isArray(rawData.relatedServices)
      ? rawData.relatedServices
      : undefined,
  };
}

/**
 * Recursively scan directory for markdown files
 */
function scanDocsDir(dir, basePath = "") {
  const entries = [];

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
        entries.push(...scanDocsDir(fullPath, relativePath));
      }
    } else if (item.endsWith(".md")) {
      try {
        const content = fs.readFileSync(fullPath, "utf-8");
        const { data } = matter(content);
        const metadata = parseMetadata(data, relativePath);

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
        console.warn(`Could not parse ${relativePath}:`, error.message);
      }
    }
  }

  return entries;
}

/**
 * Generate the agent index file
 */
function generateAgentIndex() {
  return {
    version: "1.0",
    generated_at: new Date().toISOString(),
    description:
      "VoiceAssist documentation index for AI agents and integrations",
    endpoints: {
      docs_list: {
        path: "/agent/docs.json",
        description: "Full list of all documentation with metadata",
        method: "GET",
        response_format: "JSON array of DocIndexEntry objects",
      },
      search_index: {
        path: "/search-index.json",
        description: "Full-text search index for client-side searching",
        method: "GET",
        response_format: "JSON with 'docs' array for Fuse.js",
      },
    },
    schema: {
      DocIndexEntry: {
        slug: "string - URL-friendly identifier",
        path: "string - Relative path to markdown file",
        title: "string - Document title",
        summary: "string? - Brief description",
        status: "draft|experimental|stable|deprecated",
        stability: "production|beta|experimental|legacy",
        owner: "backend|frontend|infra|sre|docs|product|security|mixed",
        audience: "string[] - Target readers",
        tags: "string[] - Categorization tags",
        relatedServices: "string[] - Related service names",
        lastUpdated: "string - ISO date",
      },
    },
    usage_notes: [
      "Use docs.json for browsing and filtering documentation",
      "Use search-index.json with Fuse.js for full-text search",
      "All paths are relative to the docs/ directory",
      "Filter client-side by status, audience, tags, etc.",
    ],
  };
}

/**
 * Generate the agent docs file
 */
function generateAgentDocs() {
  const docs = scanDocsDir(DOCS_DIR);

  // Sort by lastUpdated descending
  docs.sort((a, b) => {
    if (!a.lastUpdated) return 1;
    if (!b.lastUpdated) return -1;
    return b.lastUpdated.localeCompare(a.lastUpdated);
  });

  return {
    count: docs.length,
    generated_at: new Date().toISOString(),
    docs,
  };
}

function main() {
  console.log("Generating agent JSON files...");

  if (!fs.existsSync(DOCS_DIR)) {
    console.error(`Docs directory not found at ${DOCS_DIR}`);
    process.exit(1);
  }

  // Ensure agent directory exists
  fs.mkdirSync(AGENT_DIR, { recursive: true });

  // Generate index.json
  const indexPath = path.join(AGENT_DIR, "index.json");
  fs.writeFileSync(indexPath, JSON.stringify(generateAgentIndex(), null, 2));
  console.log(`Generated ${indexPath}`);

  // Generate docs.json
  const docsPath = path.join(AGENT_DIR, "docs.json");
  const docsData = generateAgentDocs();
  fs.writeFileSync(docsPath, JSON.stringify(docsData, null, 2));
  console.log(`Generated ${docsPath} with ${docsData.count} documents`);
}

if (require.main === module) {
  try {
    main();
  } catch (error) {
    console.error("Failed to generate agent JSON:", error);
    process.exit(1);
  }
}
