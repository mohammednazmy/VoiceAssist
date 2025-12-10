#!/usr/bin/env node
/**
 * Generate AI Summaries for Documentation
 *
 * This script scans documentation files and generates ai_summary frontmatter
 * for documents that are missing it. Summaries are extracted from the document
 * content using heuristics (first paragraphs, headings, key sections).
 *
 * Usage:
 *   node generate-ai-summaries.js [--dry-run] [--category <cat>] [--limit <n>]
 *
 * Options:
 *   --dry-run    Show what would be changed without modifying files
 *   --category   Only process docs in a specific category
 *   --limit      Process at most N documents
 *   --force      Regenerate summaries even if they exist
 */

const fs = require("fs");
const path = require("path");
const matter = require("gray-matter");

const DOCS_DIR =
  process.env.DOCS_DIR || path.join(__dirname, "..", "..", "..", "docs");

// Maximum summary length (characters)
const MAX_SUMMARY_LENGTH = 500;

// Sections to prioritize when extracting content
const PRIORITY_SECTIONS = [
  "overview",
  "introduction",
  "summary",
  "purpose",
  "description",
  "what is",
  "about",
];

/**
 * Extract a meaningful summary from document content
 */
function extractSummary(content, title) {
  // Remove frontmatter
  const bodyStart = content.indexOf("---", 3);
  const body = bodyStart > 0 ? content.slice(bodyStart + 3).trim() : content;

  // Remove markdown formatting artifacts
  let text = body
    .replace(/^#+ .+$/gm, "") // Remove headings
    .replace(/\[([^\]]+)\]\([^)]+\)/g, "$1") // [text](url) -> text
    .replace(/`{1,3}[^`]*`{1,3}/g, "") // Remove inline/block code
    .replace(/\*\*([^*]+)\*\*/g, "$1") // Bold -> plain
    .replace(/\*([^*]+)\*/g, "$1") // Italic -> plain
    .replace(/^[-*+]\s+/gm, "- ") // Normalize list markers
    .replace(/^\d+\.\s+/gm, "- ") // Numbered lists -> bullets
    .replace(/\n{3,}/g, "\n\n") // Multiple newlines -> double
    .trim();

  // Try to find a priority section
  for (const section of PRIORITY_SECTIONS) {
    const regex = new RegExp(`^##?\\s*${section}[:\\s]*$`, "im");
    const match = body.match(regex);
    if (match) {
      const sectionStart = match.index + match[0].length;
      const nextHeading = body.slice(sectionStart).search(/^##?\s/m);
      const sectionEnd =
        nextHeading > 0 ? sectionStart + nextHeading : sectionStart + 1000;
      const sectionContent = body.slice(sectionStart, sectionEnd).trim();
      if (sectionContent.length > 50) {
        text = sectionContent;
        break;
      }
    }
  }

  // Split into sentences and build summary
  const sentences = text
    .split(/(?<=[.!?])\s+/)
    .filter((s) => s.length > 10 && s.length < 300);

  let summary = "";
  for (const sentence of sentences) {
    if (summary.length + sentence.length > MAX_SUMMARY_LENGTH) {
      break;
    }
    summary += (summary ? " " : "") + sentence.trim();
  }

  // If no good sentences, use first N characters
  if (summary.length < 50) {
    summary = text.slice(0, MAX_SUMMARY_LENGTH).replace(/\s+/g, " ").trim();
    if (summary.length === MAX_SUMMARY_LENGTH) {
      summary = summary.replace(/\s+\S*$/, "...");
    }
  }

  // Clean up and add ellipsis if truncated
  summary = summary.replace(/\s+/g, " ").trim();
  if (summary.length > MAX_SUMMARY_LENGTH) {
    summary = summary.slice(0, MAX_SUMMARY_LENGTH - 3) + "...";
  }

  return summary || `Documentation for ${title}`;
}

/**
 * Determine document category from path or content
 */
function inferCategory(filePath, frontmatter) {
  if (frontmatter.category) return frontmatter.category;

  const pathLower = filePath.toLowerCase();
  if (pathLower.includes("archive")) return "reference";
  if (pathLower.includes("api")) return "api";
  if (pathLower.includes("architecture")) return "architecture";
  if (pathLower.includes("deploy")) return "deployment";
  if (pathLower.includes("operation")) return "operations";
  if (pathLower.includes("security")) return "security";
  if (pathLower.includes("test")) return "testing";
  if (pathLower.includes("debug")) return "debugging";
  if (pathLower.includes("plan")) return "planning";
  if (pathLower.includes("ai")) return "ai";
  if (pathLower.includes("overview")) return "overview";

  return "reference";
}

/**
 * Scan and process documentation files
 */
function processDocumentation(options = {}) {
  const {
    dryRun = false,
    category = null,
    limit = null,
    force = false,
  } = options;

  const results = {
    processed: 0,
    updated: 0,
    skipped: 0,
    errors: [],
    updates: [],
  };

  function scanDir(dir, basePath = "") {
    if (!fs.existsSync(dir)) return;

    const items = fs.readdirSync(dir);
    for (const item of items) {
      if (limit && results.processed >= limit) break;

      const fullPath = path.join(dir, item);
      const relativePath = path.join(basePath, item);
      const stat = fs.statSync(fullPath);

      if (stat.isDirectory()) {
        if (!item.startsWith(".") && item !== "node_modules") {
          scanDir(fullPath, relativePath);
        }
      } else if (item.endsWith(".md")) {
        try {
          processFile(fullPath, relativePath, results, {
            dryRun,
            category,
            force,
          });
        } catch (error) {
          results.errors.push({ path: relativePath, error: error.message });
        }
      }
    }
  }

  scanDir(DOCS_DIR);
  return results;
}

/**
 * Process a single documentation file
 */
function processFile(fullPath, relativePath, results, options) {
  const { dryRun, category, force } = options;

  const content = fs.readFileSync(fullPath, "utf-8");
  const { data: frontmatter, content: body } = matter(content);

  // Check if we should process this file
  const docCategory = inferCategory(relativePath, frontmatter);
  if (category && docCategory !== category) {
    return;
  }

  results.processed++;

  // Skip if already has ai_summary (unless force)
  if (frontmatter.ai_summary && !force) {
    results.skipped++;
    return;
  }

  // Generate summary
  const title = frontmatter.title || path.basename(relativePath, ".md");
  const aiSummary = extractSummary(content, title);

  // Update frontmatter
  const updatedFrontmatter = {
    ...frontmatter,
    ai_summary: aiSummary,
  };

  // Ensure ai-agents is in audience
  if (!updatedFrontmatter.audience) {
    updatedFrontmatter.audience = ["human", "ai-agents"];
  } else if (
    Array.isArray(updatedFrontmatter.audience) &&
    !updatedFrontmatter.audience.includes("ai-agents")
  ) {
    updatedFrontmatter.audience.push("ai-agents");
  }

  results.updates.push({
    path: relativePath,
    title,
    summary_preview: aiSummary.slice(0, 100) + "...",
  });

  if (!dryRun) {
    const newContent = matter.stringify(body, updatedFrontmatter);
    fs.writeFileSync(fullPath, newContent);
  }

  results.updated++;
}

/**
 * Main entry point
 */
function main() {
  const args = process.argv.slice(2);
  const options = {
    dryRun: args.includes("--dry-run"),
    force: args.includes("--force"),
    category: null,
    limit: null,
  };

  const categoryIdx = args.indexOf("--category");
  if (categoryIdx !== -1 && args[categoryIdx + 1]) {
    options.category = args[categoryIdx + 1];
  }

  const limitIdx = args.indexOf("--limit");
  if (limitIdx !== -1 && args[limitIdx + 1]) {
    options.limit = parseInt(args[limitIdx + 1], 10);
  }

  console.log("AI Summary Generator");
  console.log("====================");
  console.log(`Docs directory: ${DOCS_DIR}`);
  console.log(`Dry run: ${options.dryRun}`);
  console.log(`Force regenerate: ${options.force}`);
  if (options.category) console.log(`Category filter: ${options.category}`);
  if (options.limit) console.log(`Limit: ${options.limit}`);
  console.log("");

  const results = processDocumentation(options);

  console.log("\nResults:");
  console.log(`  Processed: ${results.processed}`);
  console.log(`  Updated: ${results.updated}`);
  console.log(`  Skipped (already had summary): ${results.skipped}`);
  console.log(`  Errors: ${results.errors.length}`);

  if (results.updates.length > 0) {
    console.log("\nUpdates:");
    for (const update of results.updates.slice(0, 20)) {
      console.log(`  - ${update.path}`);
      console.log(`    Title: ${update.title}`);
      console.log(`    Preview: ${update.summary_preview}`);
    }
    if (results.updates.length > 20) {
      console.log(`  ... and ${results.updates.length - 20} more`);
    }
  }

  if (results.errors.length > 0) {
    console.log("\nErrors:");
    for (const err of results.errors) {
      console.log(`  - ${err.path}: ${err.error}`);
    }
  }

  if (options.dryRun && results.updated > 0) {
    console.log(
      "\n[DRY RUN] No files were modified. Remove --dry-run to apply changes.",
    );
  }

  // Exit with error if there were failures
  if (results.errors.length > 0) {
    process.exit(1);
  }
}

if (require.main === module) {
  main();
}

module.exports = { extractSummary, processDocumentation };
