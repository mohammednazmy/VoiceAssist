#!/usr/bin/env node
/**
 * Script to add frontmatter to markdown files that are missing it.
 * Generates reasonable defaults based on file path and content.
 */

const fs = require("fs");
const path = require("path");

const DOCS_DIR = path.resolve(__dirname, "../../../docs");

// Map directory names to owners
const OWNER_MAP = {
  ai: "docs",
  "api-reference": "backend",
  archive: "docs",
  architecture: "mixed",
  "client-implementation": "frontend",
  debugging: "sre",
  deployment: "infra",
  "design-system": "frontend",
  infra: "infra",
  operations: "sre",
  overview: "mixed",
  "phase-15-final-review": "mixed",
  phases: "mixed",
  plans: "mixed",
  testing: "sre",
};

// Map keywords in filename to status
function getStatus(filename, dirPath) {
  const lower = filename.toLowerCase();
  const dir = path.basename(dirPath);

  if (dir === "archive" || lower.includes("archive")) return "deprecated";
  if (
    lower.includes("summary") ||
    lower.includes("complete") ||
    lower.includes("report")
  )
    return "stable";
  if (
    lower.includes("plan") ||
    lower.includes("design") ||
    lower.includes("spec")
  )
    return "stable";
  if (lower.includes("guide") || lower.includes("reference")) return "stable";
  if (lower.includes("fix") || lower.includes("progress"))
    return "experimental";
  return "stable";
}

function getStability(filename, dirPath) {
  const lower = filename.toLowerCase();
  const dir = path.basename(dirPath);

  if (dir === "archive") return "legacy";
  if (lower.includes("progress") || lower.includes("wip"))
    return "experimental";
  if (lower.includes("plan") || lower.includes("design")) return "beta";
  return "production";
}

function getOwner(dirPath) {
  const dir = path.basename(dirPath);
  return OWNER_MAP[dir] || "docs";
}

function getAudience(filename, dirPath) {
  const lower = filename.toLowerCase();
  const dir = path.basename(dirPath);

  if (dir === "ai" || lower.includes("agent") || lower.includes("claude")) {
    return '["agent", "human"]';
  }
  if (
    lower.includes("admin") ||
    lower.includes("deployment") ||
    lower.includes("infra")
  ) {
    return '["devops", "sre"]';
  }
  if (
    lower.includes("api") ||
    lower.includes("backend") ||
    lower.includes("schema")
  ) {
    return '["backend"]';
  }
  if (
    lower.includes("frontend") ||
    lower.includes("web") ||
    lower.includes("ui")
  ) {
    return '["frontend"]';
  }
  if (
    lower.includes("debug") ||
    lower.includes("troubleshoot") ||
    lower.includes("runbook")
  ) {
    return '["sre", "backend", "frontend"]';
  }
  return '["human"]';
}

function getTags(filename) {
  const lower = filename.toLowerCase().replace(".md", "").replace(/_/g, "-");
  const tags = [];

  // Extract meaningful words
  const words = lower.split("-").filter((w) => w.length > 2);

  // Add up to 4 relevant tags
  const relevantWords = words.slice(0, 4);
  return JSON.stringify(relevantWords);
}

function generateSlug(filename, dirPath) {
  const relativePath = path.relative(DOCS_DIR, dirPath);
  const name = filename.replace(".md", "").toLowerCase().replace(/_/g, "-");

  if (relativePath && relativePath !== ".") {
    return `${relativePath}/${name}`.replace(/\\/g, "/");
  }
  return name;
}

function generateTitle(filename) {
  return filename
    .replace(".md", "")
    .replace(/_/g, " ")
    .replace(/-/g, " ")
    .split(" ")
    .map((word) => word.charAt(0).toUpperCase() + word.slice(1).toLowerCase())
    .join(" ");
}

function generateSummary(content, title) {
  // Try to extract first meaningful paragraph
  const lines = content.split("\n");
  let summary = "";

  for (const line of lines) {
    const trimmed = line.trim();
    // Skip headers, empty lines, and code blocks
    if (
      trimmed.startsWith("#") ||
      trimmed === "" ||
      trimmed.startsWith("```") ||
      trimmed.startsWith("|")
    ) {
      continue;
    }
    // Skip very short lines
    if (trimmed.length < 20) continue;

    // Found a good line
    summary = trimmed.substring(0, 150);
    if (trimmed.length > 150) summary += "...";
    break;
  }

  return summary || `Documentation for ${title}`;
}

function hasFrontmatter(content) {
  return content.trimStart().startsWith("---");
}

function addFrontmatter(filePath) {
  const content = fs.readFileSync(filePath, "utf8");

  if (hasFrontmatter(content)) {
    return false; // Already has frontmatter
  }

  const filename = path.basename(filePath);
  const dirPath = path.dirname(filePath);

  const title = generateTitle(filename);
  const slug = generateSlug(filename, dirPath);
  const summary = generateSummary(content, title);
  const status = getStatus(filename, dirPath);
  const stability = getStability(filename, dirPath);
  const owner = getOwner(dirPath);
  const audience = getAudience(filename, dirPath);
  const tags = getTags(filename);

  const frontmatter = `---
title: "${title}"
slug: "${slug}"
summary: "${summary.replace(/"/g, '\\"')}"
status: ${status}
stability: ${stability}
owner: ${owner}
lastUpdated: "2025-11-27"
audience: ${audience}
tags: ${tags}
---

`;

  const newContent = frontmatter + content;
  fs.writeFileSync(filePath, newContent);
  return true;
}

function walkDir(dir, callback) {
  const files = fs.readdirSync(dir);

  for (const file of files) {
    const filePath = path.join(dir, file);
    const stat = fs.statSync(filePath);

    if (stat.isDirectory()) {
      walkDir(filePath, callback);
    } else if (file.endsWith(".md")) {
      callback(filePath);
    }
  }
}

// Main execution
let added = 0;
let skipped = 0;

console.log("Adding frontmatter to markdown files...\n");

walkDir(DOCS_DIR, (filePath) => {
  const relativePath = path.relative(DOCS_DIR, filePath);

  if (addFrontmatter(filePath)) {
    console.log(`✓ Added frontmatter: ${relativePath}`);
    added++;
  } else {
    skipped++;
  }
});

console.log(
  `\nDone! Added frontmatter to ${added} files. Skipped ${skipped} files (already had frontmatter).`,
);
