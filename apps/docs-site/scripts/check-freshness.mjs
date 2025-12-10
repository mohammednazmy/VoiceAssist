#!/usr/bin/env node
/**
 * Documentation Freshness Checker
 *
 * Checks documentation files for staleness based on:
 * - lastUpdated frontmatter field
 * - Git last modified date
 * - Age thresholds (warning: 90 days, stale: 180 days)
 *
 * Usage:
 *   node scripts/check-freshness.mjs
 *   pnpm check:freshness
 */

import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";
import { execSync } from "child_process";
import matter from "gray-matter";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const DOCS_DIR = path.join(__dirname, "..", "..", "..", "docs");

// Thresholds in days
const WARNING_THRESHOLD = 90;
const STALE_THRESHOLD = 180;

// Docs that are expected to be stable (don't flag these)
const STABLE_DOCS = [
  "archive/",
  "PHASE_",
  "_COMPLETION_REPORT",
  "_SUMMARY",
];

function isStableDoc(relativePath) {
  return STABLE_DOCS.some((pattern) => relativePath.includes(pattern));
}

function getGitLastModified(filePath) {
  try {
    const result = execSync(
      `git log -1 --format=%at -- "${filePath}"`,
      { cwd: DOCS_DIR, encoding: "utf-8", stdio: ["pipe", "pipe", "pipe"] }
    );
    const timestamp = parseInt(result.trim(), 10);
    return timestamp ? new Date(timestamp * 1000) : null;
  } catch {
    return null;
  }
}

function parseLastUpdated(frontmatter) {
  if (!frontmatter.lastUpdated) {
    return null;
  }

  // Handle Date objects (gray-matter parses ISO dates automatically)
  if (frontmatter.lastUpdated instanceof Date) {
    return isNaN(frontmatter.lastUpdated.getTime())
      ? null
      : frontmatter.lastUpdated;
  }

  // Handle string dates
  if (typeof frontmatter.lastUpdated === "string") {
    const dateStr = frontmatter.lastUpdated.replace(/["']/g, "");
    const parsed = new Date(dateStr);
    return isNaN(parsed.getTime()) ? null : parsed;
  }

  // Unknown type
  console.warn(
    `Warning: lastUpdated is neither string nor Date (got ${typeof frontmatter.lastUpdated})`
  );
  return null;
}

function getDaysSince(date) {
  const now = new Date();
  const diffMs = now.getTime() - date.getTime();
  return Math.floor(diffMs / (1000 * 60 * 60 * 24));
}

function checkFile(filePath, relativePath) {
  const content = fs.readFileSync(filePath, "utf-8");
  const { data: frontmatter } = matter(content);

  // Get dates
  const frontmatterDate = parseLastUpdated(frontmatter);
  const gitDate = getGitLastModified(filePath);

  // Use the most recent date
  let lastModified = null;
  let source = "unknown";

  if (frontmatterDate && gitDate) {
    if (frontmatterDate > gitDate) {
      lastModified = frontmatterDate;
      source = "frontmatter";
    } else {
      lastModified = gitDate;
      source = "git";
    }
  } else if (frontmatterDate) {
    lastModified = frontmatterDate;
    source = "frontmatter";
  } else if (gitDate) {
    lastModified = gitDate;
    source = "git";
  }

  if (!lastModified) {
    return {
      file: relativePath,
      status: "unknown",
      message: "Could not determine last modified date",
      lastModified: null,
      daysSince: null,
    };
  }

  const daysSince = getDaysSince(lastModified);

  let status = "fresh";
  let message = "";

  if (daysSince >= STALE_THRESHOLD) {
    status = "stale";
    message = `Last updated ${daysSince} days ago (> ${STALE_THRESHOLD} day threshold)`;
  } else if (daysSince >= WARNING_THRESHOLD) {
    status = "warning";
    message = `Last updated ${daysSince} days ago (> ${WARNING_THRESHOLD} day threshold)`;
  }

  return {
    file: relativePath,
    status,
    message,
    lastModified: lastModified.toISOString().split("T")[0],
    daysSince,
    source,
    title: frontmatter.title || path.basename(relativePath),
  };
}

function scanDirectory(dir, basePath = "") {
  const results = [];

  if (!fs.existsSync(dir)) {
    console.error(`Directory not found: ${dir}`);
    return results;
  }

  const items = fs.readdirSync(dir);

  for (const item of items) {
    const fullPath = path.join(dir, item);
    const relativePath = path.join(basePath, item);
    const stat = fs.statSync(fullPath);

    if (stat.isDirectory()) {
      if (!item.startsWith(".") && item !== "node_modules") {
        results.push(...scanDirectory(fullPath, relativePath));
      }
    } else if (item.endsWith(".md")) {
      // Skip stable docs unless they're truly ancient
      if (!isStableDoc(relativePath)) {
        results.push(checkFile(fullPath, relativePath));
      }
    }
  }

  return results;
}

function main() {
  console.log("Checking documentation freshness...\n");
  console.log(`Scanning: ${DOCS_DIR}`);
  console.log(`Warning threshold: ${WARNING_THRESHOLD} days`);
  console.log(`Stale threshold: ${STALE_THRESHOLD} days\n`);

  const results = scanDirectory(DOCS_DIR);

  const stale = results.filter((r) => r.status === "stale");
  const warning = results.filter((r) => r.status === "warning");
  const unknown = results.filter((r) => r.status === "unknown");
  const fresh = results.filter((r) => r.status === "fresh");

  // Report stale docs
  if (stale.length > 0) {
    console.log("🔴 STALE DOCUMENTS (needs update):\n");
    for (const doc of stale.sort((a, b) => b.daysSince - a.daysSince)) {
      console.log(`  ${doc.file}`);
      console.log(`    Last updated: ${doc.lastModified} (${doc.daysSince} days ago)`);
      console.log("");
    }
  }

  // Report warning docs
  if (warning.length > 0) {
    console.log("🟡 WARNING (consider updating):\n");
    for (const doc of warning.sort((a, b) => b.daysSince - a.daysSince)) {
      console.log(`  ${doc.file}`);
      console.log(`    Last updated: ${doc.lastModified} (${doc.daysSince} days ago)`);
      console.log("");
    }
  }

  // Report unknown docs
  if (unknown.length > 0) {
    console.log("⚪ UNKNOWN (no date metadata):\n");
    for (const doc of unknown) {
      console.log(`  ${doc.file}`);
    }
    console.log("");
  }

  // Summary
  console.log("=".repeat(60));
  console.log("Summary:");
  console.log(`  🟢 Fresh: ${fresh.length}`);
  console.log(`  🟡 Warning: ${warning.length}`);
  console.log(`  🔴 Stale: ${stale.length}`);
  console.log(`  ⚪ Unknown: ${unknown.length}`);
  console.log("=".repeat(60));

  // Exit with error if stale docs exist
  if (stale.length > 0) {
    console.log("\n⚠️  Stale documentation detected. Please review and update.");
    process.exit(1);
  }

  console.log("\n✅ All active documentation is reasonably fresh.");
  process.exit(0);
}

main();
