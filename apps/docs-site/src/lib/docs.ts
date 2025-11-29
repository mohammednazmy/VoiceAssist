import fs from "fs";
import path from "path";
import matter from "gray-matter";

// Path to the docs directory (relative to monorepo root)
// In production, DOCS_DIR can be set via environment variable
export const DOCS_DIR =
  process.env.DOCS_DIR || path.join(process.cwd(), "..", "..", "docs");
export const CLIENT_IMPL_DIR = path.join(DOCS_DIR, "client-implementation");
export const WEB_APP_DIR = path.join(process.cwd(), "..", "web-app");

// Project root directory (parent of docs/)
export const PROJECT_ROOT = path.join(DOCS_DIR, "..");

// GitHub repository for "Edit this page" links
const GITHUB_REPO = "mohammednazmy/VoiceAssist";
const GITHUB_BRANCH = "main";

/**
 * Path prefix configuration for loadDocWithPrefix()
 *
 * Supported prefixes:
 * - No prefix: Relative to docs/ directory (e.g., "START_HERE.md" → docs/START_HERE.md)
 * - @root/: Relative to project root (e.g., "@root/packages/ui/README.md" → packages/ui/README.md)
 *
 * Example usage in navigation.ts:
 *   docPaths: [
 *     "ARCHITECTURE.md",                      // → docs/ARCHITECTURE.md
 *     "@root/services/api-gateway/README.md"  // → services/api-gateway/README.md
 *   ]
 */
const PATH_PREFIXES: Record<string, string> = {
  "@root/": PROJECT_ROOT,
};

// ============================================================================
// METADATA SCHEMA (see docs/DOCUMENTATION_METADATA_STANDARD.md)
// ============================================================================

/** Document maturity status */
export type DocStatus = "draft" | "experimental" | "stable" | "deprecated";

/** Feature stability level */
export type DocStability = "production" | "beta" | "experimental" | "legacy";

/** Team/area ownership */
export type DocOwner =
  | "backend"
  | "frontend"
  | "infra"
  | "sre"
  | "docs"
  | "product"
  | "security"
  | "mixed";

/** Target audience */
export type DocAudience =
  | "human"
  | "agent"
  | "backend"
  | "frontend"
  | "devops"
  | "admin"
  | "user";

/**
 * Standardized document metadata schema.
 * See docs/DOCUMENTATION_METADATA_STANDARD.md for field definitions.
 */
export interface DocMetadata {
  // Required fields
  title: string;
  slug: string;
  status: DocStatus;
  lastUpdated: string;

  // Recommended fields
  summary?: string;
  stability?: DocStability;
  owner?: DocOwner;
  audience?: DocAudience[];
  tags?: string[];

  // Optional fields
  relatedServices?: string[];
  version?: string;
  deprecated?: boolean;
  replacedBy?: string;

  // Legacy field mapping (for backwards compatibility)
  description?: string; // Maps to summary
}

/**
 * Validation result for document metadata
 */
export interface MetadataValidation {
  valid: boolean;
  warnings: string[];
  errors: string[];
}

/**
 * Document content with typed metadata
 */
export interface DocContent {
  content: string;
  frontmatter: DocMetadata;
  path?: string;
  validation?: MetadataValidation;
}

/**
 * Lightweight doc entry for indexes
 */
export interface DocIndexEntry {
  slug: string;
  path: string;
  title: string;
  summary?: string;
  status: DocStatus;
  stability?: DocStability;
  owner?: DocOwner;
  audience?: DocAudience[];
  tags?: string[];
  relatedServices?: string[];
  lastUpdated: string;
}

// Valid enum values for validation
const VALID_STATUS: DocStatus[] = [
  "draft",
  "experimental",
  "stable",
  "deprecated",
];
const VALID_STABILITY: DocStability[] = [
  "production",
  "beta",
  "experimental",
  "legacy",
];
const VALID_OWNER: DocOwner[] = [
  "backend",
  "frontend",
  "infra",
  "sre",
  "docs",
  "product",
  "security",
  "mixed",
];
const VALID_AUDIENCE: DocAudience[] = [
  "human",
  "agent",
  "backend",
  "frontend",
  "devops",
  "admin",
  "user",
];

/**
 * Normalize and validate frontmatter data into typed DocMetadata
 */
export function parseMetadata(
  rawData: Record<string, unknown>,
  filePath?: string,
): { metadata: DocMetadata; validation: MetadataValidation } {
  const warnings: string[] = [];
  const errors: string[] = [];
  const prefix = filePath ? `[${filePath}] ` : "";

  // Handle field name migrations
  // Convert Date objects to ISO strings (gray-matter parses dates)
  const rawDate = rawData.lastUpdated || rawData.last_updated;
  let lastUpdated = "";
  if (rawDate instanceof Date) {
    lastUpdated = rawDate.toISOString().split("T")[0];
  } else if (typeof rawDate === "string") {
    lastUpdated = rawDate;
  }
  const summary = (rawData.summary || rawData.description || "") as string;

  // Derive slug from path if not provided
  let slug = rawData.slug as string;
  if (!slug && filePath) {
    slug = filePath.replace(/\.md$/i, "").replace(/\\/g, "/");
  }

  // Validate required fields
  if (!rawData.title) {
    warnings.push(`${prefix}Missing required field: title`);
  }
  if (!slug) {
    warnings.push(`${prefix}Missing required field: slug`);
  }
  if (!rawData.status) {
    warnings.push(`${prefix}Missing required field: status`);
  }
  if (!lastUpdated) {
    warnings.push(`${prefix}Missing required field: lastUpdated`);
  }

  // Validate enum values
  const status = rawData.status as DocStatus;
  if (status && !VALID_STATUS.includes(status)) {
    warnings.push(
      `${prefix}Invalid status value: ${status}. Must be one of: ${VALID_STATUS.join(", ")}`,
    );
  }

  const stability = rawData.stability as DocStability;
  if (stability && !VALID_STABILITY.includes(stability)) {
    warnings.push(
      `${prefix}Invalid stability value: ${stability}. Must be one of: ${VALID_STABILITY.join(", ")}`,
    );
  }

  const owner = rawData.owner as DocOwner;
  if (owner && !VALID_OWNER.includes(owner)) {
    warnings.push(
      `${prefix}Invalid owner value: ${owner}. Must be one of: ${VALID_OWNER.join(", ")}`,
    );
  }

  // Validate audience array
  const audience = rawData.audience as DocAudience[] | undefined;
  if (audience && Array.isArray(audience)) {
    for (const a of audience) {
      if (!VALID_AUDIENCE.includes(a)) {
        warnings.push(
          `${prefix}Invalid audience value: ${a}. Must be one of: ${VALID_AUDIENCE.join(", ")}`,
        );
      }
    }
  }

  // Validate date format (YYYY-MM-DD)
  if (lastUpdated && !/^\d{4}-\d{2}-\d{2}$/.test(lastUpdated)) {
    warnings.push(
      `${prefix}Invalid date format for lastUpdated: ${lastUpdated}. Use ISO format: YYYY-MM-DD`,
    );
  }

  const metadata: DocMetadata = {
    title: (rawData.title as string) || "Untitled",
    slug: slug || "unknown",
    status: VALID_STATUS.includes(status) ? status : "draft",
    lastUpdated: lastUpdated || new Date().toISOString().split("T")[0],
    summary,
    stability: VALID_STABILITY.includes(stability) ? stability : undefined,
    owner: VALID_OWNER.includes(owner) ? owner : undefined,
    audience: audience?.filter((a) => VALID_AUDIENCE.includes(a)),
    tags: Array.isArray(rawData.tags) ? (rawData.tags as string[]) : undefined,
    relatedServices: Array.isArray(rawData.relatedServices)
      ? (rawData.relatedServices as string[])
      : undefined,
    version: rawData.version as string | undefined,
    deprecated: rawData.deprecated as boolean | undefined,
    replacedBy: rawData.replacedBy as string | undefined,
    description: summary, // Keep for backwards compatibility
  };

  return {
    metadata,
    validation: {
      valid: errors.length === 0,
      warnings,
      errors,
    },
  };
}

/**
 * Convert DocContent to DocIndexEntry for lightweight indexes
 */
export function toIndexEntry(doc: DocContent, filePath: string): DocIndexEntry {
  return {
    slug: doc.frontmatter.slug,
    path: filePath,
    title: doc.frontmatter.title,
    summary: doc.frontmatter.summary,
    status: doc.frontmatter.status,
    stability: doc.frontmatter.stability,
    owner: doc.frontmatter.owner,
    audience: doc.frontmatter.audience,
    tags: doc.frontmatter.tags,
    relatedServices: doc.frontmatter.relatedServices,
    lastUpdated: doc.frontmatter.lastUpdated,
  };
}

/**
 * Validate that a resolved path stays within the allowed base directory
 * Prevents path traversal attacks (e.g., ../../../etc/passwd)
 */
function isPathWithinBase(basePath: string, targetPath: string): boolean {
  const resolvedBase = path.resolve(basePath);
  const resolvedTarget = path.resolve(targetPath);
  return (
    resolvedTarget.startsWith(resolvedBase + path.sep) ||
    resolvedTarget === resolvedBase
  );
}

/**
 * Load a markdown document from the docs directory
 */
export function loadDoc(relativePath: string): DocContent | null {
  // Sanitize: reject paths with path traversal sequences
  if (relativePath.includes("..") || path.isAbsolute(relativePath)) {
    console.warn(
      `Invalid path rejected (path traversal attempt): ${relativePath}`,
    );
    return null;
  }

  const fullPath = path.join(DOCS_DIR, relativePath);

  // Double-check the resolved path stays within DOCS_DIR
  if (!isPathWithinBase(DOCS_DIR, fullPath)) {
    console.warn(
      `Path traversal blocked: ${relativePath} resolves outside docs directory`,
    );
    return null;
  }

  try {
    if (!fs.existsSync(fullPath)) {
      console.warn(`Document not found: ${fullPath}`);
      return null;
    }

    const fileContents = fs.readFileSync(fullPath, "utf8");
    const { data, content } = matter(fileContents);

    // Parse and validate metadata
    const { metadata, validation } = parseMetadata(
      data as Record<string, unknown>,
      relativePath,
    );

    // Log validation warnings in development
    if (
      process.env.NODE_ENV === "development" &&
      validation.warnings.length > 0
    ) {
      validation.warnings.forEach((w) => console.warn(w));
    }

    return {
      content,
      frontmatter: metadata,
      path: relativePath,
      validation,
    };
  } catch (error) {
    console.error(`Error loading document ${relativePath}:`, error);
    return null;
  }
}

/**
 * Load a markdown document with prefix support for multiple base directories.
 *
 * Supported path formats:
 * - "filename.md" or "subdir/filename.md" → loads from docs/ directory
 * - "@root/path/to/file.md" → loads from project root
 *
 * @param docPath - Path with optional prefix (e.g., "@root/packages/ui/README.md")
 * @returns Document content or null if not found/invalid
 */
export function loadDocWithPrefix(docPath: string): DocContent | null {
  let basePath = DOCS_DIR;
  let relativePath = docPath;

  // Check for known prefixes and resolve base path
  for (const [prefix, baseDir] of Object.entries(PATH_PREFIXES)) {
    if (docPath.startsWith(prefix)) {
      basePath = baseDir;
      relativePath = docPath.slice(prefix.length);
      break;
    }
  }

  // Security: reject path traversal sequences
  if (relativePath.includes("..") || path.isAbsolute(relativePath)) {
    console.warn(`Invalid path rejected (path traversal attempt): ${docPath}`);
    return null;
  }

  const fullPath = path.join(basePath, relativePath);

  // Security: ensure resolved path stays within the base directory
  if (!isPathWithinBase(basePath, fullPath)) {
    console.warn(
      `Path traversal blocked: ${docPath} resolves outside allowed directory`,
    );
    return null;
  }

  try {
    if (!fs.existsSync(fullPath)) {
      // Silent return - DocPage handles missing docs gracefully with "Content coming soon"
      return null;
    }

    const fileContents = fs.readFileSync(fullPath, "utf8");
    const { data, content } = matter(fileContents);

    // Parse and validate metadata
    const { metadata, validation } = parseMetadata(
      data as Record<string, unknown>,
      docPath,
    );

    // Log validation warnings in development
    if (
      process.env.NODE_ENV === "development" &&
      validation.warnings.length > 0
    ) {
      validation.warnings.forEach((w) => console.warn(w));
    }

    return {
      content,
      frontmatter: metadata,
      path: docPath,
      validation,
    };
  } catch (error) {
    console.error(`Error loading document ${docPath}:`, error);
    return null;
  }
}

/**
 * Load a markdown document from the client-implementation directory
 */
export function loadClientImplDoc(filename: string): DocContent | null {
  const fullPath = path.join(CLIENT_IMPL_DIR, filename);

  try {
    if (!fs.existsSync(fullPath)) {
      console.warn(`Document not found: ${fullPath}`);
      return null;
    }

    const fileContents = fs.readFileSync(fullPath, "utf8");
    const { data, content } = matter(fileContents);

    // Parse and validate metadata
    const { metadata, validation } = parseMetadata(
      data as Record<string, unknown>,
      filename,
    );

    return {
      content,
      frontmatter: metadata,
      path: filename,
      validation,
    };
  } catch (error) {
    console.error(`Error loading document ${filename}:`, error);
    return null;
  }
}

/**
 * Load a document from the web-app directory
 */
export function loadWebAppDoc(relativePath: string): DocContent | null {
  const fullPath = path.join(WEB_APP_DIR, relativePath);

  try {
    if (!fs.existsSync(fullPath)) {
      console.warn(`Document not found: ${fullPath}`);
      return null;
    }

    const fileContents = fs.readFileSync(fullPath, "utf8");
    const { data, content } = matter(fileContents);

    // Parse and validate metadata
    const { metadata, validation } = parseMetadata(
      data as Record<string, unknown>,
      relativePath,
    );

    return {
      content,
      frontmatter: metadata,
      path: relativePath,
      validation,
    };
  } catch (error) {
    console.error(`Error loading document ${relativePath}:`, error);
    return null;
  }
}

/**
 * List all markdown files in a directory
 */
export function listDocsInDirectory(relativePath: string = ""): string[] {
  const fullPath = path.join(DOCS_DIR, relativePath);

  try {
    if (!fs.existsSync(fullPath)) {
      return [];
    }

    const files = fs.readdirSync(fullPath);
    return files.filter((file) => file.endsWith(".md"));
  } catch (error) {
    console.error(`Error listing docs in ${relativePath}:`, error);
    return [];
  }
}

/**
 * Recursively list all markdown files in the docs directory
 * Returns paths relative to the docs directory (without .md extension)
 */
export function listAllDocPaths(relativePath: string = ""): string[] {
  const fullPath = path.join(DOCS_DIR, relativePath);
  const paths: string[] = [];

  try {
    if (!fs.existsSync(fullPath)) {
      return [];
    }

    const items = fs.readdirSync(fullPath, { withFileTypes: true });

    for (const item of items) {
      const itemRelativePath = relativePath
        ? `${relativePath}/${item.name}`
        : item.name;

      if (item.isDirectory() && !item.name.startsWith(".")) {
        // Recursively process subdirectories
        paths.push(...listAllDocPaths(itemRelativePath));
      } else if (item.isFile() && item.name.endsWith(".md")) {
        // Add markdown files (without .md extension)
        paths.push(itemRelativePath.replace(/\.md$/, ""));
      }
    }
  } catch (error) {
    console.error(`Error listing docs recursively in ${relativePath}:`, error);
  }

  return paths;
}

/**
 * Get all docs for the "all docs" page
 */
export function getAllDocs(): {
  name: string;
  path: string;
  category: string;
}[] {
  const docs: { name: string; path: string; category: string }[] = [];

  try {
    const paths = listAllDocPaths();

    paths.forEach((docPath) => {
      const parts = docPath.split("/");
      const topLevel = parts.length > 1 ? parts[0] : null;
      const filename = parts[parts.length - 1];

      let category = "General";
      if (topLevel) {
        switch (topLevel) {
          case "client-implementation":
            category = "Frontend";
            break;
          case "architecture":
            category = "Architecture";
            break;
          case "operations":
            category = "Operations";
            break;
          case "debugging":
            category = "Debugging";
            break;
          case "testing":
            category = "Testing";
            break;
          case "ai":
            category = "AI & Agents";
            break;
          case "overview":
            category = "Overview";
            break;
          case "phases":
            category = "Phases";
            break;
          case "admin":
            category = "Admin";
            break;
          case "archive":
            category = "Archive";
            break;
          case "plans":
            category = "Planning";
            break;
          case "deployment":
            category = "Deployment";
            break;
          case "design-system":
            category = "Design System";
            break;
          case "infra":
            category = "Infrastructure";
            break;
          case "api-reference":
            category = "Reference";
            break;
          default:
            category = topLevel
              .replace(/-/g, " ")
              .replace(/\b\w/g, (c) => c.toUpperCase());
        }
      } else if (filename.startsWith("VOICE_")) {
        category = "Voice";
      } else if (filename.startsWith("ADMIN_")) {
        category = "Admin";
      }

      docs.push({
        name: filename.replace(/_/g, " "),
        path: docPath,
        category,
      });
    });
  } catch (error) {
    console.error("Error getting all docs:", error);
  }

  return docs.sort((a, b) => {
    if (a.category === b.category) {
      return a.name.localeCompare(b.name);
    }
    return a.category.localeCompare(b.category);
  });
}

/**
 * Generate GitHub edit URL for a document
 * @param relativePath - Path relative to docs/ directory
 */
export function getGitHubEditUrl(relativePath: string): string {
  return `https://github.com/${GITHUB_REPO}/edit/${GITHUB_BRANCH}/docs/${relativePath}`;
}

/**
 * Generate GitHub view URL for a document
 * @param relativePath - Path relative to docs/ directory
 */
export function getGitHubViewUrl(relativePath: string): string {
  return `https://github.com/${GITHUB_REPO}/blob/${GITHUB_BRANCH}/docs/${relativePath}`;
}

/**
 * Generate GitHub edit URL for a document with prefix support
 * @param docPath - Path with optional prefix (e.g., "@root/packages/ui/README.md")
 */
export function getGitHubEditUrlWithPrefix(docPath: string): string {
  let repoPath: string;

  if (docPath.startsWith("@root/")) {
    // Remove @root/ prefix - path is relative to repo root
    repoPath = docPath.slice(6);
  } else {
    // Default: path is relative to docs/
    repoPath = `docs/${docPath}`;
  }

  return `https://github.com/${GITHUB_REPO}/edit/${GITHUB_BRANCH}/${repoPath}`;
}

/**
 * Generate GitHub view URL for a document with prefix support
 * @param docPath - Path with optional prefix (e.g., "@root/packages/ui/README.md")
 */
export function getGitHubViewUrlWithPrefix(docPath: string): string {
  let repoPath: string;

  if (docPath.startsWith("@root/")) {
    // Remove @root/ prefix - path is relative to repo root
    repoPath = docPath.slice(6);
  } else {
    // Default: path is relative to docs/
    repoPath = `docs/${docPath}`;
  }

  return `https://github.com/${GITHUB_REPO}/blob/${GITHUB_BRANCH}/${repoPath}`;
}
