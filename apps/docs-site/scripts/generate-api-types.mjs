#!/usr/bin/env node
/**
 * API Types Generator
 *
 * Generates TypeScript types from the OpenAPI specification.
 * Uses openapi-typescript to create type-safe API client types.
 *
 * Usage:
 *   node scripts/generate-api-types.mjs
 *   pnpm generate:api-types
 *
 * Output:
 *   /packages/api-client/src/generated/api-types.ts
 */

import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const SPEC_PATH = path.join(__dirname, "..", "openapi", "openapi.json");
const OUTPUT_DIR = path.join(__dirname, "..", "..", "..", "packages", "api-client", "src", "generated");
const OUTPUT_PATH = path.join(OUTPUT_DIR, "api-types.ts");

async function main() {
  console.log("Generating TypeScript types from OpenAPI spec...\n");

  // Check spec exists
  if (!fs.existsSync(SPEC_PATH)) {
    console.error(`❌ OpenAPI spec not found at ${SPEC_PATH}`);
    console.error("Run: pnpm sync:openapi:update first");
    process.exit(1);
  }

  // Load spec
  const spec = JSON.parse(fs.readFileSync(SPEC_PATH, "utf-8"));
  console.log(`Loaded spec: ${spec.info?.title || "Unknown"} v${spec.info?.version || "?"}`);
  console.log(`Paths: ${Object.keys(spec.paths || {}).length}`);
  console.log("");

  // Try to import openapi-typescript dynamically
  let openapiTS;
  try {
    openapiTS = await import("openapi-typescript");
  } catch (error) {
    console.error("❌ openapi-typescript not installed.");
    console.error("Run: pnpm add -D openapi-typescript");
    process.exit(1);
  }

  // Generate types
  console.log("Generating types...");
  try {
    const output = await openapiTS.default(spec, {
      exportType: true,
      alphabetize: true,
      additionalProperties: false,
    });

    // Ensure output directory exists
    if (!fs.existsSync(OUTPUT_DIR)) {
      fs.mkdirSync(OUTPUT_DIR, { recursive: true });
      console.log(`Created directory: ${OUTPUT_DIR}`);
    }

    // Write header and types
    const header = `// ============================================================
// AUTO-GENERATED FILE - DO NOT EDIT DIRECTLY
// ============================================================
// Generated from: apps/docs-site/openapi/openapi.json
// Generated at: ${new Date().toISOString()}
// Generator: scripts/generate-api-types.mjs
//
// To regenerate: pnpm --filter docs-site generate:api-types
// ============================================================

`;

    fs.writeFileSync(OUTPUT_PATH, header + output);
    console.log(`\n✅ Generated types at ${OUTPUT_PATH}`);

    // Stats
    const stats = fs.statSync(OUTPUT_PATH);
    console.log(`   Size: ${(stats.size / 1024).toFixed(1)} KB`);

    // Count types
    const typeMatches = output.match(/export (type|interface)/g);
    console.log(`   Types: ${typeMatches?.length || 0}`);
  } catch (error) {
    console.error("❌ Error generating types:", error.message);
    process.exit(1);
  }
}

main().catch((error) => {
  console.error("Error:", error);
  process.exit(1);
});
