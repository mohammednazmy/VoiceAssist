#!/usr/bin/env npx ts-node
/**
 * Documentation Link Checker
 *
 * Validates internal links in markdown files to ensure they point to existing files.
 *
 * Usage:
 *   npx ts-node scripts/check-links.ts
 *   pnpm check:links
 */

import fs from "fs";
import path from "path";

const DOCS_DIR = path.join(__dirname, "..", "..", "..", "docs");
const PROJECT_ROOT = path.join(DOCS_DIR, "..");

interface LinkIssue {
  file: string;
  line: number;
  link: string;
  reason: string;
}

function extractLinks(content: string): Array<{ link: string; line: number }> {
  const links: Array<{ link: string; line: number }> = [];
  const lines = content.split("\n");

  // Match markdown links: [text](url) and reference-style: [text]: url
  const inlineLinkRegex = /\[([^\]]*)\]\(([^)]+)\)/g;
  const refLinkRegex = /^\[([^\]]+)\]:\s*(.+)$/;

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    const lineNum = i + 1;

    // Inline links
    let match;
    while ((match = inlineLinkRegex.exec(line)) !== null) {
      links.push({ link: match[2], line: lineNum });
    }

    // Reference-style links
    const refMatch = refLinkRegex.exec(line);
    if (refMatch) {
      links.push({ link: refMatch[2].trim(), line: lineNum });
    }
  }

  return links;
}

function isExternalLink(link: string): boolean {
  return (
    link.startsWith("http://") ||
    link.startsWith("https://") ||
    link.startsWith("mailto:") ||
    link.startsWith("tel:")
  );
}

function resolveLink(link: string, fromFile: string): string | null {
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

function checkFile(filePath: string, relativePath: string): LinkIssue[] {
  const issues: LinkIssue[] = [];

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

function scanDirectory(dir: string, basePath: string = ""): LinkIssue[] {
  const issues: LinkIssue[] = [];

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
  const byFile: Record<string, LinkIssue[]> = {};
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

  process.exit(1);
}

main();
