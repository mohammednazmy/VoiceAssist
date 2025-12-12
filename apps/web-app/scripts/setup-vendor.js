#!/usr/bin/env node
/**
 * Setup Vendor Assets for Local Development
 *
 * Copies Silero VAD and ONNX Runtime files from node_modules to public/vendor/
 * so they can be served during local development.
 *
 * This mirrors what the Dockerfile does during production builds.
 */

const fs = require("fs");
const path = require("path");

const PROJECT_ROOT = path.resolve(__dirname, "..");
const PUBLIC_DIR = path.join(PROJECT_ROOT, "public");
const NODE_MODULES = path.join(PROJECT_ROOT, "node_modules");

// Source -> Destination mappings
// NOTE: Only copy static assets (.wasm, .onnx) - NOT .mjs files!
// Vite doesn't allow ES module imports from /public directory.
// JS modules should be imported from node_modules normally.
const VENDOR_COPIES = [
  {
    name: "onnxruntime-web",
    src: path.join(NODE_MODULES, "onnxruntime-web", "dist"),
    dest: path.join(PUBLIC_DIR, "vendor", "onnxruntime-web", "dist"),
    // Only copy .wasm files - NOT .mjs (those are imported from node_modules)
    filter: (file) => file.endsWith(".wasm"),
  },
  {
    name: "@ricky0123/vad-web",
    src: path.join(NODE_MODULES, "@ricky0123", "vad-web", "dist"),
    dest: path.join(PUBLIC_DIR, "vendor", "silero-vad"),
    // Only copy .onnx model files and .wasm - NOT .mjs/.js
    filter: (file) => file.endsWith(".onnx") || file.endsWith(".wasm"),
  },
];

function copyDirSync(src, dest, filter = () => true) {
  if (!fs.existsSync(src)) {
    console.warn(`  Source not found: ${src}`);
    return 0;
  }

  fs.mkdirSync(dest, { recursive: true });

  let copied = 0;
  const entries = fs.readdirSync(src, { withFileTypes: true });

  for (const entry of entries) {
    const srcPath = path.join(src, entry.name);
    const destPath = path.join(dest, entry.name);

    if (entry.isDirectory()) {
      copied += copyDirSync(srcPath, destPath, filter);
    } else if (filter(entry.name)) {
      fs.copyFileSync(srcPath, destPath);
      copied++;
    }
  }

  return copied;
}

function main() {
  console.log("Setting up vendor assets for local development...\n");

  let totalCopied = 0;

  for (const vendor of VENDOR_COPIES) {
    console.log(`Copying ${vendor.name}...`);

    // Skip if already exists and has files
    if (fs.existsSync(vendor.dest)) {
      const files = fs.readdirSync(vendor.dest);
      if (files.length > 0) {
        console.log(`  Already exists with ${files.length} files, skipping.\n`);
        continue;
      }
    }

    const count = copyDirSync(vendor.src, vendor.dest, vendor.filter);
    totalCopied += count;
    console.log(`  Copied ${count} files to ${path.relative(PROJECT_ROOT, vendor.dest)}\n`);
  }

  if (totalCopied > 0) {
    console.log(`Done! Copied ${totalCopied} vendor files total.`);
  } else {
    console.log("All vendor assets already in place.");
  }

  // Verify critical files exist (at least one ONNX model is needed)
  const criticalFiles = [
    path.join(PUBLIC_DIR, "vendor", "silero-vad", "silero_vad_legacy.onnx"),
    path.join(PUBLIC_DIR, "vendor", "silero-vad", "silero_vad_v5.onnx"),
  ];

  let missingCritical = false;
  for (const file of criticalFiles) {
    if (!fs.existsSync(file)) {
      // Try alternative location
      const altSrc = path.join(
        NODE_MODULES,
        "@ricky0123",
        "vad-web",
        "dist",
        path.basename(file)
      );
      if (fs.existsSync(altSrc)) {
        fs.copyFileSync(altSrc, file);
        console.log(`Copied missing critical file: ${path.basename(file)}`);
      } else {
        console.warn(`WARNING: Critical file not found: ${path.basename(file)}`);
        missingCritical = true;
      }
    }
  }

  if (missingCritical) {
    console.warn(
      "\nSome critical VAD files are missing. Silero VAD may not work properly."
    );
    console.warn("Try running: npm install @ricky0123/vad-web onnxruntime-web");
  }
}

main();
