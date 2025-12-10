#!/usr/bin/env node
/**
 * Component Documentation Extractor
 *
 * Extracts TSDoc/JSDoc documentation from UI components using react-docgen-typescript.
 * Generates a JSON file with component props, descriptions, and metadata.
 *
 * Usage:
 *   node scripts/extract-component-docs.mjs
 *   pnpm generate:component-docs
 *
 * Output:
 *   /apps/docs-site/src/generated/components.json
 */

import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";
import { glob } from "glob";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const UI_PACKAGE_DIR = path.join(__dirname, "..", "..", "..", "packages", "ui");
const COMPONENTS_DIR = path.join(UI_PACKAGE_DIR, "src", "components");
const OUTPUT_DIR = path.join(__dirname, "..", "src", "generated");
const OUTPUT_PATH = path.join(OUTPUT_DIR, "components.json");

async function main() {
  console.log("Extracting component documentation...\n");

  // Check components directory exists
  if (!fs.existsSync(COMPONENTS_DIR)) {
    console.error(`❌ Components directory not found at ${COMPONENTS_DIR}`);
    process.exit(1);
  }

  // Try to import react-docgen-typescript
  let docgen;
  try {
    docgen = await import("react-docgen-typescript");
  } catch (error) {
    console.error("❌ react-docgen-typescript not installed.");
    console.error("Run: pnpm add -D react-docgen-typescript");
    process.exit(1);
  }

  // Configure parser
  const tsConfigPath = path.join(UI_PACKAGE_DIR, "tsconfig.json");
  const parser = docgen.withCustomConfig(tsConfigPath, {
    propFilter: (prop) => {
      // Filter out props from node_modules or React
      if (prop.parent?.fileName.includes("node_modules")) {
        return false;
      }
      // Keep HTML element props that are commonly used
      const commonHtmlProps = ["className", "style", "id", "onClick", "disabled", "type", "children"];
      if (prop.parent?.fileName.includes("@types/react") && !commonHtmlProps.includes(prop.name)) {
        return false;
      }
      return true;
    },
    shouldExtractLiteralValuesFromEnum: true,
    shouldRemoveUndefinedFromOptional: true,
    savePropValueAsString: true,
  });

  // Find all component files (excluding tests and stories)
  const componentFiles = await glob("**/*.tsx", {
    cwd: COMPONENTS_DIR,
    ignore: ["**/__tests__/**", "**/*.test.tsx", "**/*.stories.tsx"],
    absolute: true,
  });

  console.log(`Found ${componentFiles.length} component files\n`);

  const docs = {};
  let successCount = 0;
  let errorCount = 0;

  for (const filePath of componentFiles) {
    const relativePath = path.relative(path.join(__dirname, "..", "..", ".."), filePath);
    const fileName = path.basename(filePath, ".tsx");

    try {
      const parsed = parser.parse(filePath);

      if (parsed.length === 0) {
        // No components found in file
        continue;
      }

      for (const component of parsed) {
        const componentName = component.displayName;

        // Skip internal components (lowercase or starts with _)
        if (/^[a-z_]/.test(componentName)) {
          continue;
        }

        docs[componentName] = {
          name: componentName,
          description: component.description || "",
          filePath: relativePath,
          props: Object.entries(component.props || {}).map(([name, prop]) => ({
            name,
            type: formatType(prop.type),
            required: prop.required,
            defaultValue: prop.defaultValue?.value || null,
            description: prop.description || "",
          })),
          tags: extractTags(component.tags || {}),
        };

        successCount++;
      }
    } catch (error) {
      console.warn(`  ⚠️  Could not parse ${fileName}: ${error.message}`);
      errorCount++;
    }
  }

  // Ensure output directory exists
  if (!fs.existsSync(OUTPUT_DIR)) {
    fs.mkdirSync(OUTPUT_DIR, { recursive: true });
    console.log(`Created directory: ${OUTPUT_DIR}`);
  }

  // Generate output
  const output = {
    generatedAt: new Date().toISOString(),
    generator: "scripts/extract-component-docs.mjs",
    source: "packages/ui/src/components",
    componentCount: Object.keys(docs).length,
    components: docs,
  };

  fs.writeFileSync(OUTPUT_PATH, JSON.stringify(output, null, 2) + "\n");

  console.log(`\n✅ Extracted ${successCount} components`);
  if (errorCount > 0) {
    console.log(`⚠️  ${errorCount} files had parsing errors`);
  }
  console.log(`📄 Output: ${OUTPUT_PATH}`);

  // List components
  console.log("\nComponents:");
  for (const name of Object.keys(docs).sort()) {
    const comp = docs[name];
    console.log(`  • ${name} (${comp.props.length} props)`);
  }
}

/**
 * Format type information for display
 */
function formatType(type) {
  if (!type) return "unknown";

  switch (type.name) {
    case "enum":
      // Show enum values
      if (type.value && Array.isArray(type.value)) {
        const values = type.value.map((v) => v.value || v).slice(0, 5);
        const suffix = type.value.length > 5 ? ` | ...` : "";
        return values.join(" | ") + suffix;
      }
      return type.raw || "enum";

    case "union":
      if (type.value && Array.isArray(type.value)) {
        return type.value.map((v) => v.name || v.value || v).join(" | ");
      }
      return type.raw || "union";

    case "signature":
      return type.raw || "function";

    default:
      return type.name || type.raw || "unknown";
  }
}

/**
 * Extract JSDoc tags
 */
function extractTags(tags) {
  const result = {};
  for (const [key, value] of Object.entries(tags)) {
    result[key] = value;
  }
  return Object.keys(result).length > 0 ? result : undefined;
}

main().catch((error) => {
  console.error("Error:", error);
  process.exit(1);
});
