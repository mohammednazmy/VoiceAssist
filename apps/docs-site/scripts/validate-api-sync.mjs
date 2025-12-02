#!/usr/bin/env node
/**
 * API Documentation Sync Validator
 *
 * Compares documented API endpoints against actual backend routes to detect:
 * - Undocumented endpoints (in code but not docs)
 * - Stale documentation (in docs but not code)
 * - Endpoint mismatches
 *
 * Usage:
 *   node scripts/validate-api-sync.mjs
 *   pnpm validate:api-sync
 */

import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const DOCS_DIR = path.join(__dirname, "..", "..", "..", "docs");
const BACKEND_DIR = path.join(__dirname, "..", "..", "..", "services", "api-gateway", "app", "api");

// Files to check for documented endpoints
const API_DOCS = [
  path.join(DOCS_DIR, "API_REFERENCE.md"),
  path.join(DOCS_DIR, "api-reference", "rest-api.md"),
  path.join(DOCS_DIR, "api-reference", "voice-pipeline-ws.md"),
  path.join(DOCS_DIR, "WEBSOCKET_PROTOCOL.md"),
];

// Patterns to extract endpoints from Python files
const ROUTE_PATTERNS = [
  // FastAPI decorators: @router.get("/path"), @router.post("/path"), etc.
  /@router\.(get|post|put|patch|delete|websocket)\s*\(\s*["']([^"']+)["']/gi,
  // Alternative: @app.get, @app.post, etc.
  /@app\.(get|post|put|patch|delete|websocket)\s*\(\s*["']([^"']+)["']/gi,
];

// Patterns to extract documented endpoints from markdown
const DOC_PATTERNS = [
  // Table rows: | GET | `/api/endpoint` |
  /\|\s*(GET|POST|PUT|PATCH|DELETE|WS|WebSocket)\s*\|\s*`([^`]+)`/gi,
  // Headers or inline: GET `/api/endpoint`
  /(GET|POST|PUT|PATCH|DELETE)\s+`([^`]+)`/gi,
  // Code blocks: GET /api/endpoint
  /```[\s\S]*?(GET|POST|PUT|PATCH|DELETE|WS)\s+([^\s\n]+)/gi,
  // WebSocket endpoints: ws://... or /ws/...
  /`(\/ws\/[^`\s]+)`/gi,
];

function extractBackendEndpoints() {
  const endpoints = new Map();

  if (!fs.existsSync(BACKEND_DIR)) {
    console.warn(`Backend API directory not found: ${BACKEND_DIR}`);
    return endpoints;
  }

  const files = fs.readdirSync(BACKEND_DIR).filter((f) => f.endsWith(".py"));

  for (const file of files) {
    const filePath = path.join(BACKEND_DIR, file);
    const content = fs.readFileSync(filePath, "utf-8");

    // Extract router prefix if present
    let prefix = "";
    const prefixMatch = content.match(/APIRouter\s*\(\s*prefix\s*=\s*["']([^"']+)["']/);
    if (prefixMatch) {
      prefix = prefixMatch[1];
    }

    for (const pattern of ROUTE_PATTERNS) {
      let match;
      pattern.lastIndex = 0;
      while ((match = pattern.exec(content)) !== null) {
        const method = match[1].toUpperCase();
        const routePath = match[2];
        const fullPath = prefix + routePath;

        const key = `${method} ${fullPath}`;
        endpoints.set(key, {
          method,
          path: fullPath,
          file,
          source: "backend",
        });
      }
    }
  }

  return endpoints;
}

function extractDocumentedEndpoints() {
  const endpoints = new Map();

  for (const docPath of API_DOCS) {
    if (!fs.existsSync(docPath)) {
      continue;
    }

    const content = fs.readFileSync(docPath, "utf-8");
    const relativePath = path.relative(DOCS_DIR, docPath);

    for (const pattern of DOC_PATTERNS) {
      let match;
      pattern.lastIndex = 0;
      while ((match = pattern.exec(content)) !== null) {
        let method, endpoint;

        if (match[1] && match[2]) {
          method = match[1].toUpperCase();
          endpoint = match[2];
        } else if (match[1]) {
          // WebSocket pattern
          method = "WS";
          endpoint = match[1];
        }

        if (!endpoint) continue;

        // Normalize method
        if (method === "WEBSOCKET") method = "WS";

        // Skip example/template endpoints
        if (endpoint.includes("{") && endpoint.includes("}")) {
          // Keep parameterized endpoints but normalize them
          endpoint = endpoint.replace(/\{[^}]+\}/g, "{id}");
        }

        // Skip non-API paths
        if (!endpoint.startsWith("/")) continue;
        if (endpoint.includes("localhost")) continue;
        if (endpoint.includes("example")) continue;

        const key = `${method} ${endpoint}`;
        if (!endpoints.has(key)) {
          endpoints.set(key, {
            method,
            path: endpoint,
            file: relativePath,
            source: "docs",
          });
        }
      }
    }
  }

  return endpoints;
}

function normalizeEndpoint(endpoint) {
  // Normalize path parameters
  return endpoint
    .replace(/\{[^}]+\}/g, "{id}")
    .replace(/\/+$/, ""); // Remove trailing slashes
}

function compareEndpoints(backend, docs) {
  const issues = {
    undocumented: [],
    stale: [],
    matched: [],
  };

  // Normalize all endpoints
  const normalizedBackend = new Map();
  for (const [key, value] of backend) {
    const normalizedKey = `${value.method} ${normalizeEndpoint(value.path)}`;
    normalizedBackend.set(normalizedKey, value);
  }

  const normalizedDocs = new Map();
  for (const [key, value] of docs) {
    const normalizedKey = `${value.method} ${normalizeEndpoint(value.path)}`;
    normalizedDocs.set(normalizedKey, value);
  }

  // Find undocumented endpoints (in backend but not docs)
  for (const [key, value] of normalizedBackend) {
    if (!normalizedDocs.has(key)) {
      issues.undocumented.push(value);
    } else {
      issues.matched.push(value);
    }
  }

  // Find stale documentation (in docs but not backend)
  for (const [key, value] of normalizedDocs) {
    if (!normalizedBackend.has(key)) {
      issues.stale.push(value);
    }
  }

  return issues;
}

function main() {
  console.log("Validating API documentation sync...\n");

  // Extract endpoints
  console.log("Scanning backend routes...");
  const backendEndpoints = extractBackendEndpoints();
  console.log(`  Found ${backendEndpoints.size} backend endpoints\n`);

  console.log("Scanning documentation...");
  const docEndpoints = extractDocumentedEndpoints();
  console.log(`  Found ${docEndpoints.size} documented endpoints\n`);

  // Compare
  const issues = compareEndpoints(backendEndpoints, docEndpoints);

  // Report undocumented
  if (issues.undocumented.length > 0) {
    console.log("🔴 UNDOCUMENTED ENDPOINTS (in code, not in docs):\n");
    for (const ep of issues.undocumented.sort((a, b) => a.path.localeCompare(b.path))) {
      console.log(`  ${ep.method} ${ep.path}`);
      console.log(`    Source: ${ep.file}`);
    }
    console.log("");
  }

  // Report stale docs
  if (issues.stale.length > 0) {
    console.log("🟡 POTENTIALLY STALE DOCS (in docs, not found in code):\n");
    for (const ep of issues.stale.sort((a, b) => a.path.localeCompare(b.path))) {
      console.log(`  ${ep.method} ${ep.path}`);
      console.log(`    Documented in: ${ep.file}`);
    }
    console.log("");
  }

  // Summary
  console.log("=".repeat(60));
  console.log("Summary:");
  console.log(`  ✅ Matched: ${issues.matched.length}`);
  console.log(`  🔴 Undocumented: ${issues.undocumented.length}`);
  console.log(`  🟡 Potentially stale: ${issues.stale.length}`);
  console.log("=".repeat(60));

  // Exit status
  if (issues.undocumented.length > 0) {
    console.log("\n⚠️  Some endpoints are not documented.");
    console.log("Consider adding documentation for new endpoints.");
    // Don't fail on undocumented - it's a warning
  }

  if (issues.stale.length > 0) {
    console.log("\n⚠️  Some documented endpoints may be stale.");
    console.log("Verify these endpoints still exist or remove from docs.");
  }

  if (issues.undocumented.length === 0 && issues.stale.length === 0) {
    console.log("\n✅ API documentation is in sync with backend code!");
  }

  process.exit(0);
}

main();
