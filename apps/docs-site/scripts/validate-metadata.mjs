#!/usr/bin/env node
/**
 * Documentation Metadata Validator
 *
 * Validates frontmatter metadata in all markdown files against the schema.
 * Reports errors and warnings for missing or invalid fields.
 *
 * Usage:
 *   node scripts/validate-metadata.mjs
 *   pnpm validate:metadata
 */

import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";
import matter from "gray-matter";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const DOCS_DIR = path.join(__dirname, "..", "..", "..", "docs");

// Valid enum values
const VALID_STATUS = ["draft", "experimental", "stable", "deprecated", "active", "production", "in-progress", "in-development"];
const VALID_STABILITY = ["production", "beta", "experimental", "legacy"];
const VALID_OWNER = [
  "backend",
  "frontend",
  "infra",
  "sre",
  "docs",
  "product",
  "security",
  "mixed",
];
const VALID_AUDIENCE = [
  "human",
  "agent",
  "backend",
  "frontend",
  "devops",
  "admin",
  "user",
  "docs",
  // Common variations
  "developers",
  "ai-agents",
  "ai-agent",
  "security-engineers",
  "architects",
  "compliance-officers",
  "stakeholders",
  "project-managers",
  "frontend-developers",
  "technical-writers",
];

function validateFile(filePath, relativePath) {
  const result = {
    file: relativePath,
    errors: [],
    warnings: [],
  };

  try {
    const content = fs.readFileSync(filePath, "utf-8");
    const { data } = matter(content);

    // Check for frontmatter existence
    if (Object.keys(data).length === 0) {
      result.warnings.push("Missing frontmatter");
      return result;
    }

    // Required fields
    if (!data.title) {
      result.warnings.push("Missing recommended field: title");
    }
    if (!data.slug && !data.description) {
      result.warnings.push("Missing recommended field: slug");
    }
    if (!data.status) {
      result.warnings.push("Missing recommended field: status");
    }
    if (!data.lastUpdated && !data.last_updated) {
      result.warnings.push("Missing recommended field: lastUpdated");
    }

    // Validate enum values
    if (data.status && !VALID_STATUS.includes(data.status)) {
      result.errors.push(
        `Invalid status: "${data.status}". Must be one of: ${VALID_STATUS.join(", ")}`
      );
    }

    if (data.stability && !VALID_STABILITY.includes(data.stability)) {
      result.errors.push(
        `Invalid stability: "${data.stability}". Must be one of: ${VALID_STABILITY.join(", ")}`
      );
    }

    if (data.owner && !VALID_OWNER.includes(data.owner)) {
      result.errors.push(
        `Invalid owner: "${data.owner}". Must be one of: ${VALID_OWNER.join(", ")}`
      );
    }

    // Validate audience array
    if (data.audience) {
      if (!Array.isArray(data.audience)) {
        result.errors.push("audience must be an array");
      } else {
        for (const a of data.audience) {
          if (!VALID_AUDIENCE.includes(a)) {
            result.errors.push(
              `Invalid audience value: "${a}". Must be one of: ${VALID_AUDIENCE.join(", ")}`
            );
          }
        }
      }
    }

    // Validate date format
    const dateField = data.lastUpdated || data.last_updated;
    if (dateField) {
      const dateStr = String(dateField).replace(/['"]/g, "");
      if (!/^\d{4}-\d{2}-\d{2}$/.test(dateStr)) {
        result.warnings.push(
          `Invalid date format: "${dateField}". Use ISO format: YYYY-MM-DD`
        );
      }
    }

    // Validate tags is array
    if (data.tags && !Array.isArray(data.tags)) {
      result.errors.push("tags must be an array");
    }

    // Validate relatedServices is array
    if (data.relatedServices && !Array.isArray(data.relatedServices)) {
      result.errors.push("relatedServices must be an array");
    }
  } catch (error) {
    result.errors.push(`Could not parse file: ${error}`);
  }

  return result;
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
      results.push(validateFile(fullPath, relativePath));
    }
  }

  return results;
}

function main() {
  console.log("Validating documentation metadata...\n");
  console.log(`Scanning: ${DOCS_DIR}\n`);

  const results = scanDirectory(DOCS_DIR);

  let totalErrors = 0;
  let totalWarnings = 0;
  let filesWithIssues = 0;

  for (const result of results) {
    if (result.errors.length > 0 || result.warnings.length > 0) {
      filesWithIssues++;
      console.log(`\n${result.file}:`);

      for (const error of result.errors) {
        console.log(`  ERROR: ${error}`);
        totalErrors++;
      }

      for (const warning of result.warnings) {
        console.log(`  WARNING: ${warning}`);
        totalWarnings++;
      }
    }
  }

  console.log("\n" + "=".repeat(60));
  console.log(`Files scanned: ${results.length}`);
  console.log(`Files with issues: ${filesWithIssues}`);
  console.log(`Total errors: ${totalErrors}`);
  console.log(`Total warnings: ${totalWarnings}`);
  console.log("=".repeat(60));

  if (totalErrors > 0) {
    console.log("\nValidation FAILED - please fix errors above.");
    process.exit(1);
  } else if (totalWarnings > 0) {
    console.log("\nValidation passed with warnings.");
    process.exit(0);
  } else {
    console.log("\nValidation PASSED - all metadata is valid.");
    process.exit(0);
  }
}

main();
