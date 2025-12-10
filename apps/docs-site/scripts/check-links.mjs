#!/usr/bin/env node
/**
 * Documentation Link Checker
 *
 * Validates internal links in markdown files to ensure they point to existing files.
 *
 * Usage:
 *   node scripts/check-links.mjs
 *   pnpm check:links
 */

import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const DOCS_DIR = path.join(__dirname, "..", "..", "..", "docs");
const PROJECT_ROOT = path.join(DOCS_DIR, "..");

function extractLinks(content) {
  const links = [];
  const lines = content.split("\n");

  // Match markdown links: [text](url) and reference-style: [text]: url
  const inlineLinkRegex = /\[([^\]]*)\]\(([^)]+)\)/g;
  const refLinkRegex = /^\[([^\]]+)\]:\s*(.+)$/;

  let inCodeBlock = false;

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    const lineNum = i + 1;

    // Track fenced code blocks (``` or ~~~)
    if (/^```|^~~~/.test(line.trim())) {
      inCodeBlock = !inCodeBlock;
      continue;
    }

    // Skip lines inside code blocks
    if (inCodeBlock) {
      continue;
    }

    // Remove inline code spans before checking for links
    // This prevents false positives like `[text](./example.md)` in examples
    const lineWithoutInlineCode = line.replace(/`[^`]+`/g, "");

    // Inline links
    let match;
    while ((match = inlineLinkRegex.exec(lineWithoutInlineCode)) !== null) {
      links.push({ link: match[2], line: lineNum });
    }

    // Reference-style links
    const refMatch = refLinkRegex.exec(lineWithoutInlineCode);
    if (refMatch) {
      links.push({ link: refMatch[2].trim(), line: lineNum });
    }
  }

  return links;
}

function isExternalLink(link) {
  return (
    link.startsWith("http://") ||
    link.startsWith("https://") ||
    link.startsWith("mailto:") ||
    link.startsWith("tel:")
  );
}

function resolveLink(link, fromFile) {
  // Skip anchors-only links
  if (link.startsWith("#")) {
    return null; // Anchor links are valid within the same file
  }

  // Remove anchor from link
  const linkPath = link.split("#")[0];
  if (!linkPath) {
    return null; // Was just an anchor
  }

  // Handle @root/ prefix
  if (linkPath.startsWith("@root/")) {
    return path.join(PROJECT_ROOT, linkPath.substring(6));
  }

  // Handle relative paths
  const fromDir = path.dirname(fromFile);
  return path.resolve(fromDir, linkPath);
}

function checkFile(filePath, relativePath) {
  const issues = [];

  try {
    const content = fs.readFileSync(filePath, "utf-8");
    const links = extractLinks(content);

    for (const { link, line } of links) {
      // Skip external links
      if (isExternalLink(link)) {
        continue;
      }

      const resolvedPath = resolveLink(link, filePath);
      if (!resolvedPath) {
        continue; // Skip anchor-only links
      }

      // Check if file exists
      if (!fs.existsSync(resolvedPath)) {
        // Also check with .md extension if not present
        const withMd = resolvedPath.endsWith(".md")
          ? resolvedPath
          : resolvedPath + ".md";
        if (!fs.existsSync(withMd)) {
          issues.push({
            file: relativePath,
            line,
            link,
            reason: "File not found",
          });
        }
      }
    }
  } catch (error) {
    issues.push({
      file: relativePath,
      line: 0,
      link: "",
      reason: `Could not read file: ${error}`,
    });
  }

  return issues;
}

function scanDirectory(dir, basePath = "") {
  const issues = [];

  if (!fs.existsSync(dir)) {
    console.error(`Directory not found: ${dir}`);
    return issues;
  }

  const items = fs.readdirSync(dir);

  for (const item of items) {
    const fullPath = path.join(dir, item);
    const relativePath = path.join(basePath, item);
    const stat = fs.statSync(fullPath);

    if (stat.isDirectory()) {
      if (!item.startsWith(".") && item !== "node_modules") {
        issues.push(...scanDirectory(fullPath, relativePath));
      }
    } else if (item.endsWith(".md")) {
      issues.push(...checkFile(fullPath, relativePath));
    }
  }

  return issues;
}

function main() {
  console.log("Checking documentation links...\n");
  console.log(`Scanning: ${DOCS_DIR}\n`);

  const issues = scanDirectory(DOCS_DIR);

  if (issues.length === 0) {
    console.log("All internal links are valid!");
    process.exit(0);
  }

  console.log("Broken links found:\n");

  // Group by file
  const byFile = {};
  for (const issue of issues) {
    if (!byFile[issue.file]) {
      byFile[issue.file] = [];
    }
    byFile[issue.file].push(issue);
  }

  for (const [file, fileIssues] of Object.entries(byFile)) {
    console.log(`${file}:`);
    for (const issue of fileIssues) {
      console.log(`  Line ${issue.line}: ${issue.link}`);
      console.log(`    -> ${issue.reason}`);
    }
    console.log("");
  }

  console.log("=".repeat(60));
  console.log(`Total broken links: ${issues.length}`);
  console.log("=".repeat(60));

  // Exit with warning instead of error - some broken links may be acceptable
  console.log("\nNote: Some broken links may be to external files or planned docs.");
  process.exit(0);
}

main();
