import fs from "fs";
import path from "path";
import matter from "gray-matter";

// Path to the docs directory (relative to monorepo root)
// In production, DOCS_DIR can be set via environment variable
const DOCS_DIR =
  process.env.DOCS_DIR || path.join(process.cwd(), "..", "..", "docs");
const CLIENT_IMPL_DIR = path.join(DOCS_DIR, "client-implementation");
const WEB_APP_DIR = path.join(process.cwd(), "..", "web-app");

// GitHub repository for "Edit this page" links
const GITHUB_REPO = "mohammednazmy/VoiceAssist";
const GITHUB_BRANCH = "main";

export interface DocContent {
  content: string;
  frontmatter: {
    title?: string;
    description?: string;
    [key: string]: unknown;
  };
}

/**
 * Load a markdown document from the docs directory
 */
export function loadDoc(relativePath: string): DocContent | null {
  const fullPath = path.join(DOCS_DIR, relativePath);

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
