#!/usr/bin/env node
/**
 * Generate Repository File Content for AI Agents
 *
 * Creates JSON files containing source code for key repository files.
 * Only exports a curated subset of important files to keep size manageable.
 *
 * Output: /public/agent/repo/files/<encoded-path>.json
 */

import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Root of the monorepo
const REPO_ROOT = path.join(__dirname, "..", "..", "..");
const OUTPUT_DIR = path.join(__dirname, "..", "public", "agent", "repo", "files");

// Maximum file size to include (100KB)
const MAX_FILE_SIZE = 100 * 1024;

// Key files to always include (relative to repo root)
const KEY_FILES = [
  // Root config files
  "package.json",
  "pnpm-workspace.yaml",
  "turbo.json",
  "tsconfig.json",
  "docker-compose.yml",
  "Makefile",
  "README.md",
  ".env.example",

  // API Gateway entry points
  "services/api-gateway/app/main.py",
  "services/api-gateway/app/config.py",
  "services/api-gateway/app/api/__init__.py",
  "services/api-gateway/requirements.txt",
  "services/api-gateway/pyproject.toml",

  // Web App entry points
  "apps/web-app/package.json",
  "apps/web-app/next.config.js",
  "apps/web-app/src/app/page.tsx",
  "apps/web-app/src/app/layout.tsx",
  "apps/web-app/tailwind.config.ts",

  // Admin Panel entry points
  "apps/admin-panel/package.json",
  "apps/admin-panel/next.config.js",
  "apps/admin-panel/src/app/page.tsx",
  "apps/admin-panel/src/app/layout.tsx",

  // Docs Site entry points
  "apps/docs-site/package.json",
  "apps/docs-site/next.config.mjs",
  "apps/docs-site/src/app/page.tsx",
  "apps/docs-site/src/app/layout.tsx",

  // Key documentation
  "docs/START_HERE.md",
  "docs/DOCUMENTATION_METADATA_STANDARD.md",
  "docs/overview/IMPLEMENTATION_STATUS.md",
  "docs/ai/AGENT_ONBOARDING.md",
  "docs/ai/AGENT_API_REFERENCE.md",
];

// Directories to scan for additional files (limited depth)
const SCAN_DIRS = [
  { path: "services/api-gateway/app/api", extensions: [".py"], maxDepth: 2 },
  { path: "services/api-gateway/app/services", extensions: [".py"], maxDepth: 1 },
  { path: "services/api-gateway/app/models", extensions: [".py"], maxDepth: 1 },
  { path: "apps/web-app/src/components", extensions: [".tsx", ".ts"], maxDepth: 2 },
  { path: "apps/admin-panel/src/components", extensions: [".tsx", ".ts"], maxDepth: 2 },
  { path: "packages", extensions: [".ts", ".tsx"], maxDepth: 2 },
];

// Files/patterns to never include
const EXCLUDE_PATTERNS = [
  /\.env/,
  /\.pem$/,
  /\.key$/,
  /\.crt$/,
  /credentials/i,
  /secret/i,
  /password/i,
  /\.lock$/,
  /node_modules/,
  /__pycache__/,
  /\.pyc$/,
  /\.test\./,
  /\.spec\./,
  /test_/,
];

// Language detection
const LANGUAGE_MAP = {
  ".ts": "typescript",
  ".tsx": "typescript",
  ".js": "javascript",
  ".jsx": "javascript",
  ".mjs": "javascript",
  ".py": "python",
  ".md": "markdown",
  ".json": "json",
  ".yaml": "yaml",
  ".yml": "yaml",
  ".toml": "toml",
  ".html": "html",
  ".css": "css",
  ".scss": "scss",
  ".sql": "sql",
  ".sh": "shell",
};

function shouldExclude(filePath) {
  for (const pattern of EXCLUDE_PATTERNS) {
    if (pattern.test(filePath)) return true;
  }
  return false;
}

function getLanguage(filePath) {
  const ext = path.extname(filePath).toLowerCase();
  return LANGUAGE_MAP[ext] || null;
}

function encodePath(relativePath) {
  // Replace / with __ for filesystem-safe encoding
  return relativePath.replace(/\//g, "__") + ".json";
}

function scanDirectory(dir, extensions, maxDepth, currentDepth = 0) {
  const files = [];

  if (currentDepth > maxDepth) return files;
  if (!fs.existsSync(dir)) return files;

  try {
    const items = fs.readdirSync(dir);

    for (const item of items) {
      const fullPath = path.join(dir, item);
      const stat = fs.statSync(fullPath);

      if (stat.isDirectory()) {
        if (!item.startsWith(".") && item !== "node_modules" && item !== "__pycache__") {
          files.push(...scanDirectory(fullPath, extensions, maxDepth, currentDepth + 1));
        }
      } else if (stat.isFile()) {
        const ext = path.extname(item);
        if (extensions.includes(ext)) {
          const relativePath = path.relative(REPO_ROOT, fullPath).replace(/\\/g, "/");
          if (!shouldExclude(relativePath)) {
            files.push(relativePath);
          }
        }
      }
    }
  } catch (error) {
    console.warn(`Could not scan ${dir}:`, error.message);
  }

  return files;
}

function collectAllFiles() {
  const allFiles = new Set();

  // Add key files
  for (const file of KEY_FILES) {
    const fullPath = path.join(REPO_ROOT, file);
    if (fs.existsSync(fullPath) && !shouldExclude(file)) {
      allFiles.add(file);
    }
  }

  // Scan directories
  for (const { path: dirPath, extensions, maxDepth } of SCAN_DIRS) {
    const fullDir = path.join(REPO_ROOT, dirPath);
    const files = scanDirectory(fullDir, extensions, maxDepth);
    for (const file of files) {
      allFiles.add(file);
    }
  }

  return Array.from(allFiles).sort();
}

function generateFileJson(relativePath) {
  const fullPath = path.join(REPO_ROOT, relativePath);

  try {
    const stat = fs.statSync(fullPath);

    // Skip files that are too large
    if (stat.size > MAX_FILE_SIZE) {
      return {
        path: relativePath,
        error: "File too large",
        size: stat.size,
        max_allowed: MAX_FILE_SIZE,
      };
    }

    const content = fs.readFileSync(fullPath, "utf-8");
    const language = getLanguage(relativePath);

    return {
      path: relativePath,
      language,
      size: stat.size,
      last_modified: stat.mtime.toISOString(),
      lines: content.split("\n").length,
      content,
    };
  } catch (error) {
    return {
      path: relativePath,
      error: error.message,
    };
  }
}

function main() {
  console.log("Generating repository file content for AI agents...");

  // Collect files
  const files = collectAllFiles();
  console.log(`Found ${files.length} files to export`);

  // Ensure output directory exists
  fs.mkdirSync(OUTPUT_DIR, { recursive: true });

  // Generate individual file JSONs
  let exported = 0;
  let skipped = 0;

  for (const relativePath of files) {
    const fileData = generateFileJson(relativePath);
    const outputFile = path.join(OUTPUT_DIR, encodePath(relativePath));

    if (fileData.error) {
      console.log(`  Skipped: ${relativePath} (${fileData.error})`);
      skipped++;
    } else {
      fs.writeFileSync(outputFile, JSON.stringify(fileData, null, 2));
      exported++;
    }
  }

  // Generate manifest
  const manifest = {
    version: "1.0",
    generated_at: new Date().toISOString(),
    description: "Manifest of exported repository files for AI agents",
    total_files: files.length,
    exported: exported,
    skipped: skipped,
    path_encoding: "/ replaced with __ (double underscore), .json appended",
    base_url: "/agent/repo/files/",
    files: files.map((f) => ({
      path: f,
      encoded: encodePath(f),
      url: `/agent/repo/files/${encodePath(f)}`,
    })),
  };

  const manifestPath = path.join(OUTPUT_DIR, "..", "manifest.json");
  fs.writeFileSync(manifestPath, JSON.stringify(manifest, null, 2));

  console.log(`\nGenerated ${exported} file JSONs`);
  console.log(`Skipped ${skipped} files`);
  console.log(`Manifest: ${manifestPath}`);
}

main();
