#!/usr/bin/env node
/**
 * Generate Code Excerpts from Repository
 *
 * Scans the repository for important functions, classes, and configuration patterns.
 * Captures short code excerpts (5-20 lines) with context and classification.
 *
 * Outputs:
 *   - /agent/code-excerpts.json - All extracted code snippets
 *
 * Usage:
 *   node generate-code-excerpts.js [--output <path>]
 */

const fs = require("fs");
const path = require("path");

const REPO_ROOT =
  process.env.REPO_ROOT || path.join(__dirname, "..", "..", "..");
const OUTPUT_DIR = path.join(__dirname, "..", "public", "agent");
const GITHUB_BASE = "https://github.com/mohammednazmy/VoiceAssist/blob/main";

// Directories to scan
const SCAN_DIRS = [
  "services/api-gateway/app",
  "apps/admin-panel/src",
  "packages",
];

// Files/directories to skip
const SKIP_PATTERNS = [
  /node_modules/,
  /\.next/,
  /dist/,
  /build/,
  /coverage/,
  /__pycache__/,
  /\.pyc$/,
  /\.test\./,
  /\.spec\./,
  /test_/,
  /\.d\.ts$/,
];

// Pattern definitions for extraction
const PATTERNS = {
  // Python patterns
  python: {
    extensions: [".py"],
    patterns: [
      {
        name: "class",
        regex: /^class\s+(\w+)(?:\([^)]*\))?:/gm,
        category: "architecture",
        contextLines: { before: 2, after: 15 },
      },
      {
        name: "async_function",
        regex: /^async\s+def\s+(\w+)\s*\([^)]*\)(?:\s*->.*)?:/gm,
        category: "api",
        contextLines: { before: 2, after: 12 },
      },
      {
        name: "function",
        regex: /^def\s+(\w+)\s*\([^)]*\)(?:\s*->.*)?:/gm,
        category: "api",
        contextLines: { before: 2, after: 10 },
      },
      {
        name: "dataclass",
        regex: /@dataclass\s*\n\s*class\s+(\w+)/gm,
        category: "architecture",
        contextLines: { before: 1, after: 15 },
      },
      {
        name: "fastapi_route",
        regex:
          /@(?:app|router)\.(get|post|put|delete|patch)\s*\([^)]*\)\s*\n\s*(?:async\s+)?def\s+(\w+)/gm,
        category: "api",
        contextLines: { before: 1, after: 12 },
      },
    ],
  },
  // TypeScript patterns
  typescript: {
    extensions: [".ts", ".tsx"],
    patterns: [
      {
        name: "interface",
        regex: /^export\s+interface\s+(\w+)/gm,
        category: "architecture",
        contextLines: { before: 1, after: 15 },
      },
      {
        name: "type",
        regex: /^export\s+type\s+(\w+)/gm,
        category: "architecture",
        contextLines: { before: 1, after: 8 },
      },
      {
        name: "class",
        regex: /^export\s+(?:abstract\s+)?class\s+(\w+)/gm,
        category: "architecture",
        contextLines: { before: 1, after: 15 },
      },
      {
        name: "function",
        regex: /^export\s+(?:async\s+)?function\s+(\w+)/gm,
        category: "api",
        contextLines: { before: 1, after: 12 },
      },
      {
        name: "react_component",
        regex:
          /^export\s+(?:default\s+)?function\s+(\w+)\s*\([^)]*\)\s*(?::\s*\w+)?\s*\{/gm,
        category: "frontend",
        contextLines: { before: 1, after: 15 },
      },
      {
        name: "hook",
        regex: /^export\s+(?:const|function)\s+(use\w+)/gm,
        category: "frontend",
        contextLines: { before: 1, after: 12 },
      },
    ],
  },
  // JavaScript patterns
  javascript: {
    extensions: [".js", ".jsx", ".mjs"],
    patterns: [
      {
        name: "function",
        regex: /^(?:export\s+)?(?:async\s+)?function\s+(\w+)/gm,
        category: "api",
        contextLines: { before: 1, after: 10 },
      },
      {
        name: "class",
        regex: /^(?:export\s+)?class\s+(\w+)/gm,
        category: "architecture",
        contextLines: { before: 1, after: 15 },
      },
    ],
  },
};

// Priority patterns (these are extracted first)
const PRIORITY_NAMES = [
  // Core services
  /Service$/,
  /Manager$/,
  /Handler$/,
  /Controller$/,
  /Repository$/,
  /Engine$/,
  // Configuration
  /Config$/,
  /Settings$/,
  /Options$/,
  // Important patterns
  /create/i,
  /init/i,
  /setup/i,
  /main/i,
  /app/i,
];

/**
 * Check if a file should be skipped
 */
function shouldSkip(filePath) {
  return SKIP_PATTERNS.some((pattern) => pattern.test(filePath));
}

/**
 * Get language config for a file
 */
function getLanguageConfig(filePath) {
  const ext = path.extname(filePath);
  for (const [lang, config] of Object.entries(PATTERNS)) {
    if (config.extensions.includes(ext)) {
      return { language: lang, ...config };
    }
  }
  return null;
}

/**
 * Extract code excerpt with context
 */
function extractExcerpt(content, matchIndex, contextLines) {
  const lines = content.split("\n");
  let lineNumber = 0;
  let charCount = 0;

  // Find line number of match
  for (let i = 0; i < lines.length; i++) {
    if (charCount + lines[i].length >= matchIndex) {
      lineNumber = i;
      break;
    }
    charCount += lines[i].length + 1; // +1 for newline
  }

  const startLine = Math.max(0, lineNumber - contextLines.before);
  const endLine = Math.min(lines.length - 1, lineNumber + contextLines.after);

  const excerptLines = lines.slice(startLine, endLine + 1);

  // Limit to 20 lines max
  const maxLines = 20;
  if (excerptLines.length > maxLines) {
    excerptLines.length = maxLines;
    excerptLines.push("  // ... (truncated)");
  }

  return {
    code: excerptLines.join("\n"),
    startLine: startLine + 1, // 1-indexed
    endLine: Math.min(endLine + 1, startLine + maxLines),
    lineCount: excerptLines.length,
  };
}

/**
 * Determine audience based on file path and category
 */
function inferAudience(filePath, category) {
  const audiences = [];

  if (filePath.includes("api-gateway")) audiences.push("backend");
  if (filePath.includes("admin-panel")) audiences.push("frontend", "admin");
  if (filePath.includes("frontend")) audiences.push("frontend");
  if (category === "api") audiences.push("developers");
  if (category === "architecture") audiences.push("architects");
  if (category === "testing") audiences.push("developers");

  return audiences.length > 0 ? audiences : ["developers"];
}

/**
 * Calculate priority score for an excerpt
 */
function calculatePriority(name, category, filePath) {
  let score = 50;

  // Boost for priority name patterns
  if (PRIORITY_NAMES.some((pattern) => pattern.test(name))) {
    score += 20;
  }

  // Boost for important categories
  if (category === "api") score += 10;
  if (category === "architecture") score += 15;

  // Boost for core directories
  if (filePath.includes("core/")) score += 10;
  if (filePath.includes("services/")) score += 5;

  return Math.min(100, score);
}

/**
 * Scan a directory for code excerpts
 */
function scanDirectory(dir, excerpts = []) {
  if (!fs.existsSync(dir)) return excerpts;

  const items = fs.readdirSync(dir);

  for (const item of items) {
    const fullPath = path.join(dir, item);

    if (shouldSkip(fullPath)) continue;

    const stat = fs.statSync(fullPath);

    if (stat.isDirectory()) {
      scanDirectory(fullPath, excerpts);
    } else if (stat.isFile()) {
      const langConfig = getLanguageConfig(fullPath);
      if (!langConfig) continue;

      try {
        const content = fs.readFileSync(fullPath, "utf-8");
        const relativePath = path.relative(REPO_ROOT, fullPath);

        for (const pattern of langConfig.patterns) {
          let match;
          const regex = new RegExp(pattern.regex.source, pattern.regex.flags);

          while ((match = regex.exec(content)) !== null) {
            const name = match[match.length - 1] || match[1]; // Get the last capture group

            // Skip private/internal items
            if (name.startsWith("_") && !name.startsWith("__")) continue;

            const excerpt = extractExcerpt(
              content,
              match.index,
              pattern.contextLines,
            );

            excerpts.push({
              id: `${relativePath}:${name}`,
              name,
              type: pattern.name,
              language: langConfig.language,
              category: pattern.category,
              file_path: relativePath.replace(/\\/g, "/"),
              start_line: excerpt.startLine,
              end_line: excerpt.endLine,
              github_url: `${GITHUB_BASE}/${relativePath.replace(/\\/g, "/")}#L${excerpt.startLine}-L${excerpt.endLine}`,
              code: excerpt.code,
              line_count: excerpt.lineCount,
              audience: inferAudience(relativePath, pattern.category),
              priority: calculatePriority(name, pattern.category, relativePath),
            });
          }
        }
      } catch (error) {
        console.warn(`Could not process ${fullPath}: ${error.message}`);
      }
    }
  }

  return excerpts;
}

/**
 * Generate the code excerpts JSON file
 */
function generateCodeExcerptsJson() {
  console.log("Scanning repository for code excerpts...");

  let allExcerpts = [];

  for (const scanDir of SCAN_DIRS) {
    const fullDir = path.join(REPO_ROOT, scanDir);
    console.log(`  Scanning: ${scanDir}`);
    scanDirectory(fullDir, allExcerpts);
  }

  // Sort by priority and deduplicate
  allExcerpts.sort((a, b) => b.priority - a.priority);

  // Deduplicate by id
  const seen = new Set();
  allExcerpts = allExcerpts.filter((e) => {
    if (seen.has(e.id)) return false;
    seen.add(e.id);
    return true;
  });

  // Group by category
  const byCategory = {};
  const byLanguage = {};

  for (const excerpt of allExcerpts) {
    if (!byCategory[excerpt.category]) {
      byCategory[excerpt.category] = [];
    }
    byCategory[excerpt.category].push({
      id: excerpt.id,
      name: excerpt.name,
      type: excerpt.type,
      file_path: excerpt.file_path,
      github_url: excerpt.github_url,
      priority: excerpt.priority,
    });

    if (!byLanguage[excerpt.language]) {
      byLanguage[excerpt.language] = 0;
    }
    byLanguage[excerpt.language]++;
  }

  const output = {
    version: "1.0.0",
    generated_at: new Date().toISOString(),
    description: "Code excerpts extracted from VoiceAssist repository",
    stats: {
      total_excerpts: allExcerpts.length,
      by_category: Object.fromEntries(
        Object.entries(byCategory).map(([k, v]) => [k, v.length]),
      ),
      by_language: byLanguage,
      high_priority: allExcerpts.filter((e) => e.priority >= 70).length,
    },
    by_category: byCategory,
    excerpts: allExcerpts.slice(0, 500), // Limit to top 500 by priority
  };

  return output;
}

/**
 * Main entry point
 */
function main() {
  const args = process.argv.slice(2);
  let outputPath = path.join(OUTPUT_DIR, "code-excerpts.json");

  const outputIdx = args.indexOf("--output");
  if (outputIdx !== -1 && args[outputIdx + 1]) {
    outputPath = args[outputIdx + 1];
  }

  console.log("Code Excerpts Generator");
  console.log("=======================");
  console.log(`Repository root: ${REPO_ROOT}`);
  console.log(`Output: ${outputPath}`);
  console.log("");

  const data = generateCodeExcerptsJson();

  // Ensure output directory exists
  fs.mkdirSync(path.dirname(outputPath), { recursive: true });

  // Write output
  fs.writeFileSync(outputPath, JSON.stringify(data, null, 2));

  console.log("\nResults:");
  console.log(`  Total excerpts: ${data.stats.total_excerpts}`);
  console.log(`  High priority (≥70): ${data.stats.high_priority}`);
  console.log("\nBy category:");
  for (const [cat, count] of Object.entries(data.stats.by_category)) {
    console.log(`  ${cat}: ${count}`);
  }
  console.log("\nBy language:");
  for (const [lang, count] of Object.entries(data.stats.by_language)) {
    console.log(`  ${lang}: ${count}`);
  }

  console.log(`\nWritten to: ${outputPath}`);
}

if (require.main === module) {
  main();
}

module.exports = { generateCodeExcerptsJson };
