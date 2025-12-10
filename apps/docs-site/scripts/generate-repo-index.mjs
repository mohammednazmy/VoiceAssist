#!/usr/bin/env node
/**
 * Generate Repository Index for AI Agents
 *
 * Creates a machine-readable index of the VoiceAssist repository structure
 * for AI agent consumption. Exposes file metadata without content.
 *
 * Output: /public/agent/repo-index.json
 */

import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Root of the monorepo (3 levels up from apps/docs-site/scripts/)
const REPO_ROOT = path.join(__dirname, "..", "..", "..");
const OUTPUT_DIR = path.join(__dirname, "..", "public", "agent");

// Directories to ignore
const IGNORE_DIRS = new Set([
  ".git",
  "node_modules",
  ".next",
  ".turbo",
  "dist",
  "out",
  ".venv",
  "__pycache__",
  ".pytest_cache",
  ".mypy_cache",
  "coverage",
  ".nyc_output",
  "test-results",
  "playwright-report",
  ".husky",
  ".cache",
]);

// Files to ignore
const IGNORE_FILES = new Set([
  ".env",
  ".env.local",
  ".env.production",
  ".env.development",
  ".env.test",
  ".DS_Store",
  "Thumbs.db",
  "pnpm-lock.yaml",
  "package-lock.json",
  "yarn.lock",
]);

// File patterns to ignore (secrets, credentials)
const IGNORE_PATTERNS = [
  /\.pem$/,
  /\.key$/,
  /\.crt$/,
  /\.p12$/,
  /credentials.*\.json$/i,
  /secrets.*\.yaml$/i,
  /\.env\..*/,
];

// Language detection by extension
const LANGUAGE_MAP = {
  ".ts": "typescript",
  ".tsx": "typescript",
  ".js": "javascript",
  ".jsx": "javascript",
  ".mjs": "javascript",
  ".cjs": "javascript",
  ".py": "python",
  ".rs": "rust",
  ".go": "go",
  ".java": "java",
  ".rb": "ruby",
  ".php": "php",
  ".cs": "csharp",
  ".cpp": "cpp",
  ".c": "c",
  ".h": "c",
  ".hpp": "cpp",
  ".swift": "swift",
  ".kt": "kotlin",
  ".scala": "scala",
  ".sh": "shell",
  ".bash": "shell",
  ".zsh": "shell",
  ".fish": "shell",
  ".ps1": "powershell",
  ".sql": "sql",
  ".md": "markdown",
  ".mdx": "mdx",
  ".json": "json",
  ".yaml": "yaml",
  ".yml": "yaml",
  ".toml": "toml",
  ".xml": "xml",
  ".html": "html",
  ".htm": "html",
  ".css": "css",
  ".scss": "scss",
  ".sass": "sass",
  ".less": "less",
  ".vue": "vue",
  ".svelte": "svelte",
  ".dockerfile": "dockerfile",
  ".tf": "terraform",
  ".hcl": "hcl",
  ".prisma": "prisma",
  ".graphql": "graphql",
  ".gql": "graphql",
};

// Component categorization based on path
function categorizeComponent(relativePath) {
  if (relativePath.startsWith("apps/web-app")) return "frontend/web-app";
  if (relativePath.startsWith("apps/admin-panel")) return "frontend/admin-panel";
  if (relativePath.startsWith("apps/docs-site")) return "frontend/docs-site";
  if (relativePath.startsWith("services/api-gateway")) return "backend/api-gateway";
  if (relativePath.startsWith("services/")) return "backend/services";
  if (relativePath.startsWith("packages/")) return "shared/packages";
  if (relativePath.startsWith("infrastructure/")) return "infra";
  if (relativePath.startsWith("docs/")) return "docs";
  if (relativePath.startsWith("tests/") || relativePath.startsWith("e2e/"))
    return "testing";
  if (relativePath.startsWith("scripts/")) return "tooling";
  if (relativePath.startsWith("k8s/") || relativePath.startsWith("ha-dr/"))
    return "infra/k8s";
  return "root";
}

function shouldIgnore(name, fullPath) {
  // Check directory ignores
  if (IGNORE_DIRS.has(name)) return true;

  // Check file ignores
  if (IGNORE_FILES.has(name)) return true;

  // Check patterns
  for (const pattern of IGNORE_PATTERNS) {
    if (pattern.test(name)) return true;
  }

  return false;
}

function getLanguage(filename) {
  const ext = path.extname(filename).toLowerCase();
  if (LANGUAGE_MAP[ext]) return LANGUAGE_MAP[ext];

  // Special cases
  if (filename === "Dockerfile" || filename.endsWith(".Dockerfile"))
    return "dockerfile";
  if (filename === "Makefile") return "makefile";
  if (filename === ".gitignore" || filename === ".dockerignore") return "ignore";

  return null;
}

function scanDirectory(dir, basePath = "") {
  const entries = [];

  if (!fs.existsSync(dir)) {
    return entries;
  }

  const items = fs.readdirSync(dir);

  for (const item of items) {
    if (shouldIgnore(item, path.join(dir, item))) continue;

    const fullPath = path.join(dir, item);
    const relativePath = basePath ? path.join(basePath, item) : item;

    try {
      const stat = fs.statSync(fullPath);

      if (stat.isDirectory()) {
        // Add directory entry
        entries.push({
          path: relativePath.replace(/\\/g, "/"),
          type: "dir",
          component: categorizeComponent(relativePath),
        });

        // Recursively scan
        entries.push(...scanDirectory(fullPath, relativePath));
      } else {
        // Add file entry
        const language = getLanguage(item);
        const entry = {
          path: relativePath.replace(/\\/g, "/"),
          type: "file",
          size: stat.size,
          last_modified: stat.mtime.toISOString(),
          component: categorizeComponent(relativePath),
        };

        if (language) {
          entry.language = language;
        }

        entries.push(entry);
      }
    } catch (error) {
      console.warn(`Could not stat ${fullPath}:`, error.message);
    }
  }

  return entries;
}

function generateStats(entries) {
  const stats = {
    total_files: 0,
    total_dirs: 0,
    total_size_bytes: 0,
    by_language: {},
    by_component: {},
  };

  for (const entry of entries) {
    if (entry.type === "file") {
      stats.total_files++;
      stats.total_size_bytes += entry.size || 0;

      if (entry.language) {
        stats.by_language[entry.language] =
          (stats.by_language[entry.language] || 0) + 1;
      }
    } else {
      stats.total_dirs++;
    }

    if (entry.component) {
      stats.by_component[entry.component] =
        (stats.by_component[entry.component] || 0) + 1;
    }
  }

  return stats;
}

function main() {
  console.log("Generating repository index for AI agents...");
  console.log(`Scanning: ${REPO_ROOT}`);

  const entries = scanDirectory(REPO_ROOT);
  const stats = generateStats(entries);

  const index = {
    version: "1.0",
    generated_at: new Date().toISOString(),
    description: "VoiceAssist repository structure index for AI agents",
    repo_root: ".",
    stats,
    schema: {
      entry: {
        path: "string - Relative path from repo root (POSIX-style)",
        type: "file|dir",
        size: "number? - File size in bytes (files only)",
        last_modified: "string? - ISO timestamp (files only)",
        language: "string? - Programming language (files only)",
        component: "string - Component category",
      },
    },
    usage_notes: [
      "Use this index to discover repository structure",
      "Filter by 'component' to find specific areas (frontend, backend, etc.)",
      "Filter by 'language' to find files by programming language",
      "File content is available via /agent/repo/files/<encoded-path>.json",
      "Path encoding: / becomes __ (double underscore)",
    ],
    entries,
  };

  // Ensure output directory exists
  fs.mkdirSync(OUTPUT_DIR, { recursive: true });

  // Write the index
  const outputPath = path.join(OUTPUT_DIR, "repo-index.json");
  fs.writeFileSync(outputPath, JSON.stringify(index, null, 2));

  console.log(`Generated ${outputPath}`);
  console.log(`  Total entries: ${entries.length}`);
  console.log(`  Files: ${stats.total_files}`);
  console.log(`  Directories: ${stats.total_dirs}`);
  console.log(
    `  Total size: ${(stats.total_size_bytes / 1024 / 1024).toFixed(2)} MB`
  );
}

main();
