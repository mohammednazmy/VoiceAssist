#!/usr/bin/env node

/**
 * Documentation Health Check Script
 *
 * Validates VoiceAssist documentation for:
 * - Broken internal links
 * - Deprecated path references (server/)
 * - Stale dates (> 90 days old)
 * - Missing frontmatter
 *
 * Usage: node scripts/check-docs-health.js
 */

const fs = require("fs");
const path = require("path");
const glob = require("glob");

const DOCS_DIR = path.join(__dirname, "..", "docs");
const MAX_AGE_DAYS = 90;

// ANSI colors
const colors = {
  red: "\x1b[31m",
  yellow: "\x1b[33m",
  green: "\x1b[32m",
  blue: "\x1b[34m",
  reset: "\x1b[0m",
};

function log(color, symbol, message) {
  console.log(`${colors[color]}${symbol}${colors.reset} ${message}`);
}

// Get all markdown files
function getMarkdownFiles() {
  return glob.sync("**/*.md", {
    cwd: DOCS_DIR,
    ignore: ["**/node_modules/**"],
  });
}

// Parse frontmatter from markdown
function parseFrontmatter(content) {
  const match = content.match(/^---\n([\s\S]*?)\n---/);
  if (!match) return null;

  const frontmatter = {};
  const lines = match[1].split("\n");

  for (const line of lines) {
    const colonIndex = line.indexOf(":");
    if (colonIndex > 0) {
      const key = line.substring(0, colonIndex).trim();
      const value = line.substring(colonIndex + 1).trim().replace(/^["']|["']$/g, "");
      frontmatter[key] = value;
    }
  }

  return frontmatter;
}

// Check for broken internal links
function checkInternalLinks(content, filePath, allFiles) {
  const issues = [];
  const linkRegex = /\[([^\]]+)\]\(([^)]+)\)/g;
  let match;

  while ((match = linkRegex.exec(content)) !== null) {
    const linkText = match[1];
    const linkPath = match[2];

    // Skip external links and anchors
    if (linkPath.startsWith("http") || linkPath.startsWith("#") || linkPath.startsWith("mailto:")) {
      continue;
    }

    // Remove anchor from path
    const cleanPath = linkPath.split("#")[0];
    if (!cleanPath) continue;

    // Resolve relative path
    const fileDir = path.dirname(filePath);
    const absolutePath = path.resolve(DOCS_DIR, fileDir, cleanPath);
    const relativeToDocs = path.relative(DOCS_DIR, absolutePath);

    // Check if file exists
    const fullPath = path.join(DOCS_DIR, "..", relativeToDocs);
    if (!fs.existsSync(fullPath) && !fs.existsSync(path.join(DOCS_DIR, relativeToDocs))) {
      issues.push({
        type: "broken-link",
        message: `Broken link: "${linkText}" → ${linkPath}`,
        line: content.substring(0, match.index).split("\n").length,
      });
    }
  }

  return issues;
}

// Check for deprecated server/ references
function checkDeprecatedPaths(content, filePath) {
  const issues = [];

  // Skip archive files
  if (filePath.includes("archive/")) {
    return issues;
  }

  // Check for server/ references (but not in context of deprecation warnings)
  const lines = content.split("\n");
  lines.forEach((line, index) => {
    // Skip lines that are describing the deprecation
    if (line.includes("deprecated") || line.includes("DEPRECATED") || line.includes("DO NOT USE")) {
      return;
    }

    // Check for server/ as if it's the current location
    if (line.match(/`server\/app\/|server\/README\.md|"server\//)) {
      // Additional check - skip if line also mentions services/api-gateway or deprecation
      if (!line.includes("services/api-gateway") && !line.includes("deprecated")) {
        issues.push({
          type: "deprecated-path",
          message: `Reference to deprecated 'server/' path`,
          line: index + 1,
        });
      }
    }
  });

  return issues;
}

// Check for stale dates
function checkStaleDates(frontmatter, filePath) {
  const issues = [];

  if (frontmatter && frontmatter.lastUpdated) {
    const lastUpdated = new Date(frontmatter.lastUpdated);
    const now = new Date();
    const diffDays = Math.floor((now - lastUpdated) / (1000 * 60 * 60 * 24));

    if (diffDays > MAX_AGE_DAYS) {
      issues.push({
        type: "stale-date",
        message: `Document is ${diffDays} days old (last updated: ${frontmatter.lastUpdated})`,
        line: 1,
      });
    }
  }

  return issues;
}

// Check for missing frontmatter
function checkFrontmatter(content, filePath) {
  const issues = [];
  const frontmatter = parseFrontmatter(content);

  // Skip READMEs in subdirectories which may not need frontmatter
  if (path.basename(filePath) === "README.md" && path.dirname(filePath) !== ".") {
    return issues;
  }

  if (!frontmatter) {
    issues.push({
      type: "missing-frontmatter",
      message: "Missing YAML frontmatter",
      line: 1,
    });
  } else {
    // Check required fields
    const requiredFields = ["title", "status"];
    for (const field of requiredFields) {
      if (!frontmatter[field]) {
        issues.push({
          type: "incomplete-frontmatter",
          message: `Missing required frontmatter field: ${field}`,
          line: 1,
        });
      }
    }
  }

  return issues;
}

// Main execution
function main() {
  console.log("\n📋 VoiceAssist Documentation Health Check\n");
  console.log("=".repeat(50));

  const files = getMarkdownFiles();
  let totalIssues = 0;
  const issuesByType = {
    "broken-link": [],
    "deprecated-path": [],
    "stale-date": [],
    "missing-frontmatter": [],
    "incomplete-frontmatter": [],
  };

  for (const file of files) {
    const filePath = path.join(DOCS_DIR, file);
    const content = fs.readFileSync(filePath, "utf8");
    const frontmatter = parseFrontmatter(content);

    const issues = [
      ...checkInternalLinks(content, file, files),
      ...checkDeprecatedPaths(content, file),
      ...checkStaleDates(frontmatter, file),
      ...checkFrontmatter(content, file),
    ];

    for (const issue of issues) {
      issuesByType[issue.type].push({
        file,
        ...issue,
      });
      totalIssues++;
    }
  }

  // Print summary by type
  console.log("\n📊 Summary\n");

  if (issuesByType["broken-link"].length > 0) {
    log("red", "❌", `Broken Links: ${issuesByType["broken-link"].length}`);
    for (const issue of issuesByType["broken-link"].slice(0, 10)) {
      console.log(`   ${issue.file}:${issue.line} - ${issue.message}`);
    }
    if (issuesByType["broken-link"].length > 10) {
      console.log(`   ... and ${issuesByType["broken-link"].length - 10} more`);
    }
  }

  if (issuesByType["deprecated-path"].length > 0) {
    log("yellow", "⚠️ ", `Deprecated Paths: ${issuesByType["deprecated-path"].length}`);
    for (const issue of issuesByType["deprecated-path"].slice(0, 10)) {
      console.log(`   ${issue.file}:${issue.line} - ${issue.message}`);
    }
    if (issuesByType["deprecated-path"].length > 10) {
      console.log(`   ... and ${issuesByType["deprecated-path"].length - 10} more`);
    }
  }

  if (issuesByType["stale-date"].length > 0) {
    log("yellow", "📅", `Stale Documents: ${issuesByType["stale-date"].length}`);
    for (const issue of issuesByType["stale-date"].slice(0, 10)) {
      console.log(`   ${issue.file} - ${issue.message}`);
    }
    if (issuesByType["stale-date"].length > 10) {
      console.log(`   ... and ${issuesByType["stale-date"].length - 10} more`);
    }
  }

  if (issuesByType["missing-frontmatter"].length + issuesByType["incomplete-frontmatter"].length > 0) {
    const fmIssues = issuesByType["missing-frontmatter"].length + issuesByType["incomplete-frontmatter"].length;
    log("blue", "📝", `Frontmatter Issues: ${fmIssues}`);
  }

  console.log("\n" + "=".repeat(50));

  if (totalIssues === 0) {
    log("green", "✅", "All documentation checks passed!");
    process.exit(0);
  } else {
    log("red", "❌", `Total issues found: ${totalIssues}`);
    console.log("\nRun with --fix to attempt automatic fixes (not yet implemented)");
    process.exit(1);
  }
}

main();
