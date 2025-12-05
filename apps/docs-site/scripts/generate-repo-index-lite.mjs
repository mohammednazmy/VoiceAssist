#!/usr/bin/env node
/**
 * Generate Lite Repository Index for AI Agents
 *
 * Creates a smaller summary version for tools with size limits.
 * Includes only key source files, not test files or generated content.
 */

import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const FULL_INDEX_PATH = path.join(__dirname, "..", "public", "agent", "repo-index.json");
const OUTPUT_PATH = path.join(__dirname, "..", "public", "agent", "repo-index-lite.json");

// Only include these patterns
const INCLUDE_PATTERNS = [
  /^apps\/.*\/(src|app)\/.*\.(tsx?|jsx?)$/,  // Frontend source
  /^services\/api-gateway\/app\/.*\.py$/,     // Backend source
  /^packages\/.*\/src\/.*\.(tsx?|jsx?)$/,     // Shared packages
  /^docs\/.*\.md$/,                            // Documentation
  /^[^/]+\.(json|yaml|yml|toml|md)$/,         // Root configs
];

// Exclude these patterns
const EXCLUDE_PATTERNS = [
  /\.test\./,
  /\.spec\./,
  /test_/,
  /__tests__/,
  /\.d\.ts$/,
  /node_modules/,
  /__pycache__/,
];

function shouldInclude(filePath) {
  // Must match at least one include pattern
  const included = INCLUDE_PATTERNS.some(p => p.test(filePath));
  if (!included) return false;

  // Must not match any exclude pattern
  const excluded = EXCLUDE_PATTERNS.some(p => p.test(filePath));
  return !excluded;
}

function main() {
  console.log("Generating lite repository index...");

  const fullIndex = JSON.parse(fs.readFileSync(FULL_INDEX_PATH, "utf-8"));

  // Filter to important files only
  const files = fullIndex.entries
    .filter(e => e.type === "file")
    .filter(e => shouldInclude(e.path))
    .map(e => ({
      p: e.path,
      c: e.component,
      l: e.language || null
    }));

  const liteIndex = {
    version: "1.0-lite",
    generated_at: new Date().toISOString(),
    description: "Lite version with key source files only (excludes tests, generated files)",
    full_version: "/agent/repo-index.json",
    stats: {
      ...fullIndex.stats,
      lite_files: files.length,
      note: "Stats are from full index; this lite version has fewer files"
    },
    key_mapping: {
      p: "path",
      c: "component",
      l: "language"
    },
    files
  };

  fs.writeFileSync(OUTPUT_PATH, JSON.stringify(liteIndex));

  const size = fs.statSync(OUTPUT_PATH).size;
  console.log(`Generated ${OUTPUT_PATH}`);
  console.log(`  Files: ${files.length} (from ${fullIndex.stats.total_files} total)`);
  console.log(`  Size: ${(size / 1024).toFixed(1)} KB`);
}

main();
