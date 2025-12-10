#!/usr/bin/env node
/**
 * Generate Doc-Code Crosswalk Map for AI Agents
 *
 * Creates a bidirectional mapping between documentation and repository files.
 * Allows AI agents to:
 *   - Navigate from docs to related implementation files
 *   - Find relevant docs when examining code files
 *
 * Output: /public/agent/doc-code-map.json
 *
 * Prerequisites:
 *   - Run `pnpm generate-agent-json` first (creates docs.json)
 *   - Run `pnpm generate-repo-index` first (creates repo-index.json)
 */

import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Input files
const DOCS_JSON_PATH = path.join(__dirname, "..", "public", "agent", "docs.json");
const REPO_INDEX_PATH = path.join(__dirname, "..", "public", "agent", "repo-index.json");
const REPO_MANIFEST_PATH = path.join(__dirname, "..", "public", "agent", "repo", "manifest.json");

// Output file
const OUTPUT_PATH = path.join(__dirname, "..", "public", "agent", "doc-code-map.json");

/**
 * Load and validate input files
 */
function loadInputFiles() {
  // Check docs.json exists
  if (!fs.existsSync(DOCS_JSON_PATH)) {
    console.error(`ERROR: ${DOCS_JSON_PATH} not found.`);
    console.error("Run 'pnpm generate-agent-json' first.");
    process.exit(1);
  }

  // Check repo-index.json exists
  if (!fs.existsSync(REPO_INDEX_PATH)) {
    console.error(`ERROR: ${REPO_INDEX_PATH} not found.`);
    console.error("Run 'pnpm generate-repo-index' first.");
    process.exit(1);
  }

  const docsData = JSON.parse(fs.readFileSync(DOCS_JSON_PATH, "utf-8"));
  const repoIndex = JSON.parse(fs.readFileSync(REPO_INDEX_PATH, "utf-8"));

  // Load manifest if available (optional)
  let manifest = null;
  if (fs.existsSync(REPO_MANIFEST_PATH)) {
    manifest = JSON.parse(fs.readFileSync(REPO_MANIFEST_PATH, "utf-8"));
  }

  return { docsData, repoIndex, manifest };
}

/**
 * Build a set of all valid paths from repo-index and manifest
 */
function buildValidPathsSet(repoIndex, manifest) {
  const validPaths = new Set();

  // Add all file paths from repo-index
  if (repoIndex.entries) {
    for (const entry of repoIndex.entries) {
      if (entry.type === "file") {
        validPaths.add(entry.path);
      }
    }
  }

  // Add paths from manifest (should be subset, but ensure coverage)
  if (manifest && manifest.files) {
    for (const file of manifest.files) {
      validPaths.add(file.path);
    }
  }

  return validPaths;
}

/**
 * Generate the doc-code crosswalk map
 */
function generateDocCodeMap(docsData, repoIndex, manifest) {
  const validPaths = buildValidPathsSet(repoIndex, manifest);

  const byDocSlug = {};
  const byPath = {};
  const missingPaths = [];

  // Stats
  let docsWithLinks = 0;
  let totalLinks = 0;

  // Process each doc
  const docs = docsData.docs || [];

  for (const doc of docs) {
    const slug = doc.slug || doc.path;
    const hasRelatedPaths =
      Array.isArray(doc.relatedPaths) && doc.relatedPaths.length > 0;
    const hasComponent = doc.component && typeof doc.component === "string";

    // Skip docs without any crosswalk data
    if (!hasRelatedPaths && !hasComponent) {
      continue;
    }

    // Build doc entry
    const docEntry = {
      slug,
      path: doc.path,
    };

    if (hasComponent) {
      docEntry.component = doc.component;
    }

    if (hasRelatedPaths) {
      docEntry.relatedPaths = doc.relatedPaths;
      docsWithLinks++;
      totalLinks += doc.relatedPaths.length;

      // Validate and index each related path
      for (const relPath of doc.relatedPaths) {
        // Check if path exists in repo
        if (!validPaths.has(relPath)) {
          missingPaths.push({
            docSlug: slug,
            path: relPath,
          });
        }

        // Add to reverse index
        if (!byPath[relPath]) {
          byPath[relPath] = {
            path: relPath,
            docs: [],
            components: new Set(),
          };
        }
        byPath[relPath].docs.push(slug);
        if (hasComponent) {
          byPath[relPath].components.add(doc.component);
        }
      }
    }

    // Add optional fields for convenience
    if (doc.title) {
      docEntry.title = doc.title;
    }
    if (doc.category) {
      docEntry.category = doc.category;
    }
    if (doc.ai_summary) {
      docEntry.ai_summary = doc.ai_summary;
    }

    byDocSlug[slug] = docEntry;
  }

  // Convert component sets to arrays/strings in byPath
  const byPathClean = {};
  for (const [pathKey, pathData] of Object.entries(byPath)) {
    const components = Array.from(pathData.components);
    byPathClean[pathKey] = {
      path: pathData.path,
      docs: pathData.docs,
    };
    if (components.length === 1) {
      byPathClean[pathKey].component = components[0];
    } else if (components.length > 1) {
      byPathClean[pathKey].components = components;
    }
  }

  return {
    generated_at: new Date().toISOString(),
    description:
      "Bidirectional mapping between documentation and repository files for AI agent navigation",
    usage: {
      from_doc:
        "Use by_doc_slug[slug].relatedPaths to find implementation files for a doc",
      from_code:
        "Use by_path[path].docs to find documentation for a code file",
      fetch_code:
        "Encode path (/ → __) and fetch /agent/repo/files/{encoded}.json",
      fetch_doc: "Use slug to look up full doc in /agent/docs.json",
    },
    by_doc_slug: byDocSlug,
    by_path: byPathClean,
    meta: {
      stats: {
        docs_with_links: docsWithLinks,
        total_links: totalLinks,
        unique_paths: Object.keys(byPathClean).length,
        missing_paths: missingPaths.length,
      },
      missing_paths:
        missingPaths.length > 0
          ? missingPaths
          : undefined,
    },
  };
}

/**
 * Main entry point
 */
function main() {
  console.log("Generating doc-code crosswalk map...\n");

  // Load input files
  const { docsData, repoIndex, manifest } = loadInputFiles();
  console.log(`Loaded ${docsData.docs?.length || 0} docs from docs.json`);
  console.log(
    `Loaded ${repoIndex.stats?.total_files || 0} files from repo-index.json`
  );
  if (manifest) {
    console.log(`Loaded ${manifest.files?.length || 0} files from manifest.json`);
  }

  // Generate the map
  const docCodeMap = generateDocCodeMap(docsData, repoIndex, manifest);

  // Write output
  fs.writeFileSync(OUTPUT_PATH, JSON.stringify(docCodeMap, null, 2));

  // Report
  console.log(`\nGenerated: ${OUTPUT_PATH}`);
  console.log(`\nStats:`);
  console.log(`  Docs with code links: ${docCodeMap.meta.stats.docs_with_links}`);
  console.log(`  Total code links: ${docCodeMap.meta.stats.total_links}`);
  console.log(`  Unique code paths: ${docCodeMap.meta.stats.unique_paths}`);
  console.log(`  Missing paths: ${docCodeMap.meta.stats.missing_paths}`);

  if (docCodeMap.meta.missing_paths && docCodeMap.meta.missing_paths.length > 0) {
    console.log(`\nWARNING: Some relatedPaths do not exist in repo-index:`);
    for (const mp of docCodeMap.meta.missing_paths.slice(0, 10)) {
      console.log(`  - ${mp.path} (from ${mp.docSlug})`);
    }
    if (docCodeMap.meta.missing_paths.length > 10) {
      console.log(
        `  ... and ${docCodeMap.meta.missing_paths.length - 10} more`
      );
    }
  }

  console.log("\nDone!");
}

main();
