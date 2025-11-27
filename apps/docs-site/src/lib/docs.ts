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

export interface DocContent {
  content: string;
  frontmatter: {
    title?: string;
    description?: string;
    [key: string]: unknown;
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

    return {
      content,
      frontmatter: data,
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

    return {
      content,
      frontmatter: data,
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

    return {
      content,
      frontmatter: data,
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

    return {
      content,
      frontmatter: data,
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
 * Get all docs for the "all docs" page
 */
export function getAllDocs(): {
  name: string;
  path: string;
  category: string;
}[] {
  const docs: { name: string; path: string; category: string }[] = [];

  try {
    // Root level docs
    const rootDocs = listDocsInDirectory("");
    rootDocs.forEach((doc) => {
      if (doc !== "README.md" && doc !== "index.html") {
        docs.push({
          name: doc.replace(".md", "").replace(/_/g, " "),
          path: doc,
          category: "General",
        });
      }
    });

    // Client implementation docs
    const clientDocs = listDocsInDirectory("client-implementation");
    clientDocs.forEach((doc) => {
      docs.push({
        name: doc.replace(".md", "").replace(/_/g, " "),
        path: `client-implementation/${doc}`,
        category: "Client Implementation",
      });
    });

    // Architecture docs
    const archDocs = listDocsInDirectory("architecture");
    archDocs.forEach((doc) => {
      docs.push({
        name: doc.replace(".md", "").replace(/_/g, " "),
        path: `architecture/${doc}`,
        category: "Architecture",
      });
    });

    // Operations docs
    const opsDocs = listDocsInDirectory("operations");
    opsDocs.forEach((doc) => {
      docs.push({
        name: doc.replace(".md", "").replace(/_/g, " "),
        path: `operations/${doc}`,
        category: "Operations",
      });
    });

    // Testing docs
    const testDocs = listDocsInDirectory("testing");
    testDocs.forEach((doc) => {
      docs.push({
        name: doc.replace(".md", "").replace(/_/g, " "),
        path: `testing/${doc}`,
        category: "Testing",
      });
    });
  } catch (error) {
    console.error("Error getting all docs:", error);
  }

  return docs.sort((a, b) => a.name.localeCompare(b.name));
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
