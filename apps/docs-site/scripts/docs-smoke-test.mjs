#!/usr/bin/env node
/**
 * Documentation Site Smoke Test
 *
 * Validates that all critical docs endpoints are accessible and return valid responses.
 * This script can be run against any base URL (local dev, staging, production).
 *
 * Usage:
 *   node scripts/docs-smoke-test.mjs                    # Default: https://assistdocs.asimo.io
 *   node scripts/docs-smoke-test.mjs http://localhost:3000
 *   pnpm validate:endpoints
 *
 * Exit codes:
 *   0 - All tests passed
 *   1 - One or more tests failed
 */

const BASE_URL = process.argv[2] || "https://assistdocs.asimo.io";

// Endpoints to test
const ENDPOINTS = [
  // HTML pages
  { path: "/", type: "html", name: "Homepage" },
  { path: "/ai/onboarding", type: "html", name: "AI Onboarding" },
  { path: "/ai/api", type: "html", name: "AI API Reference" },
  { path: "/ai/status", type: "html", name: "Implementation Status" },
  { path: "/dev/architecture", type: "html", name: "Architecture" },
  { path: "/dev/docs-system", type: "html", name: "Documentation System" },
  { path: "/operations/debugging", type: "html", name: "Debugging Index" },

  // JSON endpoints
  { path: "/agent/index.json", type: "json", name: "Agent Index" },
  { path: "/agent/docs.json", type: "json", name: "Agent Docs" },
  { path: "/agent/schema.json", type: "json", name: "Agent Schema" },
  { path: "/search-index.json", type: "json", name: "Search Index" },

  // XML endpoints
  { path: "/sitemap.xml", type: "xml", name: "Sitemap" },

  // Text endpoints
  { path: "/robots.txt", type: "text", name: "Robots.txt" },
];

// ANSI color codes for terminal output
const colors = {
  green: "\x1b[32m",
  red: "\x1b[31m",
  yellow: "\x1b[33m",
  cyan: "\x1b[36m",
  reset: "\x1b[0m",
  bold: "\x1b[1m",
};

function log(color, message) {
  console.log(`${colors[color]}${message}${colors.reset}`);
}

/**
 * Test a single endpoint
 */
async function testEndpoint(endpoint) {
  const url = `${BASE_URL}${endpoint.path}`;
  const result = {
    name: endpoint.name,
    path: endpoint.path,
    type: endpoint.type,
    success: false,
    status: null,
    error: null,
  };

  try {
    const response = await fetch(url, {
      headers: {
        "User-Agent": "VoiceAssist-DocsTest/1.0",
      },
    });

    result.status = response.status;

    // Check status code
    if (response.status !== 200) {
      result.error = `HTTP ${response.status}`;
      return result;
    }

    // Validate content type and parse response
    const contentType = response.headers.get("content-type") || "";
    const text = await response.text();

    if (endpoint.type === "json") {
      if (!contentType.includes("application/json") && !text.startsWith("{") && !text.startsWith("[")) {
        // Some servers serve JSON without proper content-type
        // So also check if content looks like JSON
      }
      try {
        const json = JSON.parse(text);
        // Basic validation for known JSON endpoints
        if (endpoint.path === "/agent/docs.json") {
          if (!json.docs || !Array.isArray(json.docs)) {
            result.error = "Missing 'docs' array";
            return result;
          }
          if (json.docs.length === 0) {
            result.error = "Empty docs array";
            return result;
          }
        }
        if (endpoint.path === "/agent/index.json") {
          if (!json.endpoints) {
            result.error = "Missing 'endpoints' object";
            return result;
          }
        }
        if (endpoint.path === "/search-index.json") {
          if (!json.docs || !Array.isArray(json.docs)) {
            result.error = "Missing 'docs' array";
            return result;
          }
        }
      } catch (e) {
        result.error = `Invalid JSON: ${e.message}`;
        return result;
      }
    } else if (endpoint.type === "xml") {
      if (!text.includes("<?xml") && !text.includes("<urlset")) {
        result.error = "Invalid XML - missing XML declaration or urlset";
        return result;
      }
    } else if (endpoint.type === "html") {
      if (!text.includes("<!DOCTYPE") && !text.includes("<html")) {
        result.error = "Invalid HTML - missing doctype or html tag";
        return result;
      }
    }

    result.success = true;
    return result;
  } catch (error) {
    result.error = error.message;
    return result;
  }
}

/**
 * Run all tests
 */
async function runTests() {
  console.log("");
  log("bold", "=".repeat(60));
  log("cyan", `Documentation Site Smoke Test`);
  log("bold", `Base URL: ${BASE_URL}`);
  log("bold", "=".repeat(60));
  console.log("");

  const results = [];

  for (const endpoint of ENDPOINTS) {
    process.stdout.write(`Testing ${endpoint.name.padEnd(25)} `);
    const result = await testEndpoint(endpoint);
    results.push(result);

    if (result.success) {
      log("green", `✓ OK (${result.status})`);
    } else {
      log("red", `✗ FAIL: ${result.error}`);
    }
  }

  console.log("");
  log("bold", "=".repeat(60));

  const passed = results.filter((r) => r.success).length;
  const failed = results.filter((r) => !r.success).length;

  console.log(`Total: ${results.length} | Passed: ${passed} | Failed: ${failed}`);

  if (failed > 0) {
    console.log("");
    log("red", "Failed endpoints:");
    for (const result of results.filter((r) => !r.success)) {
      log("red", `  - ${result.path}: ${result.error}`);
    }
  }

  log("bold", "=".repeat(60));
  console.log("");

  if (failed > 0) {
    log("red", "Smoke test FAILED");
    process.exit(1);
  } else {
    log("green", "Smoke test PASSED");
    process.exit(0);
  }
}

// Run tests
runTests().catch((error) => {
  log("red", `Fatal error: ${error.message}`);
  process.exit(1);
});
