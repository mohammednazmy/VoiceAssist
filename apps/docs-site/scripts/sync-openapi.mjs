#!/usr/bin/env node
/**
 * OpenAPI Spec Sync Script
 *
 * Synchronizes the OpenAPI spec from the FastAPI backend with the local spec file.
 * Can fetch from a running server or export directly from Python.
 *
 * Usage:
 *   node scripts/sync-openapi.mjs              # Check mode (fail on drift)
 *   node scripts/sync-openapi.mjs --update     # Update local spec from server
 *   node scripts/sync-openapi.mjs --server URL # Custom server URL (default: http://localhost:5000)
 *
 * Environment Variables:
 *   OPENAPI_SERVER_URL - Override default server URL
 *   SKIP_OPENAPI_SYNC  - Set to 'true' to skip this check
 */

import fs from "fs";
import path from "path";
import { execSync } from "child_process";
import { fileURLToPath } from "url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const LOCAL_SPEC_PATH = path.join(__dirname, "..", "openapi", "openapi.json");
const BACKEND_DIR = path.join(__dirname, "..", "..", "..", "services", "api-gateway");

// Parse arguments
const args = process.argv.slice(2);
const updateMode = args.includes("--update");
const serverUrlArg = args.find((a) => a.startsWith("--server="));
const serverUrl = serverUrlArg
  ? serverUrlArg.split("=")[1]
  : process.env.OPENAPI_SERVER_URL || "http://localhost:5000";

// Check for skip flag
if (process.env.SKIP_OPENAPI_SYNC === "true") {
  console.log("⏭️  Skipping OpenAPI sync (SKIP_OPENAPI_SYNC=true)");
  process.exit(0);
}

/**
 * Try to fetch OpenAPI spec from a running server
 */
async function fetchFromServer(url) {
  const openapiUrl = `${url}/openapi.json`;
  console.log(`Fetching spec from ${openapiUrl}...`);

  try {
    const response = await fetch(openapiUrl, { timeout: 5000 });
    if (!response.ok) {
      throw new Error(`HTTP ${response.status}: ${response.statusText}`);
    }
    return await response.json();
  } catch (error) {
    console.log(`  Server not available: ${error.message}`);
    return null;
  }
}

/**
 * Export OpenAPI spec directly from Python
 */
function exportFromPython() {
  console.log("Exporting spec from Python...");

  const pythonScript = `
import sys
import json
sys.path.insert(0, '.')
try:
    from app.main import app
    spec = app.openapi()
    # Sort for consistent output
    spec_str = json.dumps(spec, indent=2, sort_keys=True)
    print(spec_str)
except Exception as e:
    print(f"ERROR: {e}", file=sys.stderr)
    sys.exit(1)
`;

  try {
    // Try .venv first, then venv
    let venvPython = path.join(BACKEND_DIR, ".venv", "bin", "python3");
    if (!fs.existsSync(venvPython)) {
      venvPython = path.join(BACKEND_DIR, "venv", "bin", "python3");
    }
    if (!fs.existsSync(venvPython)) {
      venvPython = "python3"; // Fallback to system Python
    }

    const output = execSync(`${venvPython} -c "${pythonScript}"`, {
      cwd: BACKEND_DIR,
      encoding: "utf-8",
      maxBuffer: 10 * 1024 * 1024, // 10MB
      env: {
        ...process.env,
        PYTHONDONTWRITEBYTECODE: "1",
      },
    });

    return JSON.parse(output);
  } catch (error) {
    console.log(`  Python export failed: ${error.message}`);
    return null;
  }
}

/**
 * Normalize spec for comparison (sort keys, remove volatile fields)
 */
function normalizeSpec(spec) {
  const normalized = JSON.parse(JSON.stringify(spec));

  // Remove fields that might differ between environments
  delete normalized.servers; // Server URLs vary

  // Sort paths and their operations for consistent comparison
  if (normalized.paths) {
    const sortedPaths = {};
    Object.keys(normalized.paths)
      .sort()
      .forEach((path) => {
        sortedPaths[path] = normalized.paths[path];
      });
    normalized.paths = sortedPaths;
  }

  return normalized;
}

/**
 * Compare two specs and return diff summary
 */
function compareSpecs(local, live) {
  const localNorm = normalizeSpec(local);
  const liveNorm = normalizeSpec(live);

  const localStr = JSON.stringify(localNorm, null, 2);
  const liveStr = JSON.stringify(liveNorm, null, 2);

  if (localStr === liveStr) {
    return { identical: true };
  }

  // Find differences in paths
  const localPaths = new Set(Object.keys(local.paths || {}));
  const livePaths = new Set(Object.keys(live.paths || {}));

  const newPaths = [...livePaths].filter((p) => !localPaths.has(p));
  const removedPaths = [...localPaths].filter((p) => !livePaths.has(p));

  return {
    identical: false,
    newPaths,
    removedPaths,
    localPathCount: localPaths.size,
    livePathCount: livePaths.size,
  };
}

async function main() {
  console.log("OpenAPI Spec Sync");
  console.log(`Mode: ${updateMode ? "UPDATE" : "CHECK"}`);
  console.log("");

  // Load local spec
  console.log(`Loading local spec from ${LOCAL_SPEC_PATH}...`);
  if (!fs.existsSync(LOCAL_SPEC_PATH)) {
    console.error("❌ Local spec file not found!");
    if (updateMode) {
      console.log("Will create new spec file.");
    } else {
      process.exit(1);
    }
  }

  const localSpec = fs.existsSync(LOCAL_SPEC_PATH)
    ? JSON.parse(fs.readFileSync(LOCAL_SPEC_PATH, "utf-8"))
    : null;

  if (localSpec) {
    console.log(`  Found spec with ${Object.keys(localSpec.paths || {}).length} paths`);
  }
  console.log("");

  // Try to get live spec (server first, then Python export)
  let liveSpec = await fetchFromServer(serverUrl);

  if (!liveSpec) {
    liveSpec = exportFromPython();
  }

  if (!liveSpec) {
    console.log("\n⚠️  Could not fetch live spec from server or Python export.");
    console.log("Ensure either:");
    console.log("  1. The backend server is running at " + serverUrl);
    console.log("  2. Python environment is set up in " + BACKEND_DIR);
    console.log("\nSkipping comparison.");
    process.exit(0);
  }

  console.log(`  Live spec has ${Object.keys(liveSpec.paths || {}).length} paths\n`);

  // Compare specs
  const diff = compareSpecs(localSpec || {}, liveSpec);

  if (diff.identical) {
    console.log("✅ OpenAPI spec is in sync!\n");
    process.exit(0);
  }

  // Report differences
  console.log("📋 Spec Differences Detected:\n");
  console.log(`  Local paths: ${diff.localPathCount}`);
  console.log(`  Live paths:  ${diff.livePathCount}`);

  if (diff.newPaths.length > 0) {
    console.log(`\n  🆕 New paths in live spec (${diff.newPaths.length}):`);
    for (const p of diff.newPaths.slice(0, 10)) {
      console.log(`     ${p}`);
    }
    if (diff.newPaths.length > 10) {
      console.log(`     ... and ${diff.newPaths.length - 10} more`);
    }
  }

  if (diff.removedPaths.length > 0) {
    console.log(`\n  🗑️  Paths removed in live spec (${diff.removedPaths.length}):`);
    for (const p of diff.removedPaths.slice(0, 10)) {
      console.log(`     ${p}`);
    }
    if (diff.removedPaths.length > 10) {
      console.log(`     ... and ${diff.removedPaths.length - 10} more`);
    }
  }

  console.log("");

  if (updateMode) {
    // Update local spec
    console.log("📝 Updating local spec...");
    const specContent = JSON.stringify(liveSpec, null, 2);
    fs.writeFileSync(LOCAL_SPEC_PATH, specContent + "\n");
    console.log(`✅ Updated ${LOCAL_SPEC_PATH}`);
    console.log(`   Size: ${(specContent.length / 1024).toFixed(1)} KB`);
    process.exit(0);
  } else {
    // Check mode - fail
    console.log("🔴 OpenAPI spec drift detected!");
    console.log("Run: pnpm --filter docs-site sync:openapi:update");
    console.log("Or:  node scripts/sync-openapi.mjs --update\n");
    process.exit(1);
  }
}

main().catch((error) => {
  console.error("Error:", error);
  process.exit(1);
});
