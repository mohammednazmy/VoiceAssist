import fs from "fs";
import path from "path";
import { pathToFileURL } from "url";
import matter from "gray-matter";

const docsRoot = process.env.DOCS_DIR || path.join(process.cwd(), "..", "..", "docs");

function getMarkdownFiles(dir) {
  const entries = fs.readdirSync(dir, { withFileTypes: true });
  return entries.flatMap((entry) => {
    const fullPath = path.join(dir, entry.name);

    if (entry.isDirectory()) {
      return getMarkdownFiles(fullPath);
    }

    if (entry.isFile() && (entry.name.endsWith(".md") || entry.name.endsWith(".mdx"))) {
      return [fullPath];
    }

    return [];
  });
}

function validateFrontmatter(filePath, data) {
  const issues = [];
  const hasFrontmatter = Object.keys(data).length > 0;

  if (!hasFrontmatter) {
    return issues;
  }

  if (typeof data.title !== "string" || !data.title.trim()) {
    issues.push({ file: filePath, message: "Missing or invalid frontmatter field: title" });
  }

  if (Object.prototype.hasOwnProperty.call(data, "description") && (typeof data.description !== "string" || !data.description)) {
    issues.push({ file: filePath, message: "Description frontmatter must be a non-empty string when provided" });
  }

  return issues;
}

function validateLinks(filePath, content) {
  const issues = [];
  const linkPattern = /(?<!\!)\[[^\]]+\]\(([^)]+)\)/g;
  let match;

  while ((match = linkPattern.exec(content)) !== null) {
    const rawTarget = match[1];
    const withoutAnchor = rawTarget.split("#")[0];

    if (!withoutAnchor || withoutAnchor.startsWith("http") || withoutAnchor.startsWith("mailto:")) {
      continue;
    }

    if (withoutAnchor.startsWith("#")) {
      continue;
    }

    if (withoutAnchor.startsWith("/")) {
      continue;
    }

    if (/[?|]/.test(withoutAnchor)) {
      continue;
    }

    const ext = path.extname(withoutAnchor).toLowerCase();
    if (ext && ext !== ".md" && ext !== ".mdx") {
      continue;
    }

    const resolvedPath = withoutAnchor.startsWith("/")
      ? path.join(docsRoot, withoutAnchor)
      : path.resolve(path.dirname(filePath), withoutAnchor);

    const relativeTarget = path.relative(docsRoot, resolvedPath);
    if (relativeTarget.startsWith("..")) {
      continue;
    }

    const candidatePaths = [resolvedPath, `${resolvedPath}.md`, `${resolvedPath}.mdx`];
    const targetExists = candidatePaths.some((candidate) => fs.existsSync(candidate));

    if (!targetExists) {
      issues.push({ file: filePath, message: `Broken relative link: ${rawTarget}` });
    }
  }

  return issues;
}

function validateContent(filePath, content) {
  const issues = [];

  if (!/^#\s+/m.test(content)) {
    issues.push({ file: filePath, message: "Document is missing a top-level heading" });
  }

  return issues;
}

function main() {
  if (!fs.existsSync(docsRoot)) {
    console.error(`Docs directory not found at ${docsRoot}`);
    process.exit(1);
  }

  const markdownFiles = getMarkdownFiles(docsRoot);
  const issues = [];

  markdownFiles.forEach((filePath) => {
    const raw = fs.readFileSync(filePath, "utf8");
    const { data, content } = matter(raw);

    issues.push(...validateFrontmatter(filePath, data));
    issues.push(...validateContent(filePath, content));
    issues.push(...validateLinks(filePath, content));
  });

  if (issues.length > 0) {
    console.error("\nDoc validation failed:\n");
    issues.forEach((issue) => {
      console.error(`- ${path.relative(process.cwd(), issue.file)}: ${issue.message}`);
    });
    console.error(`\nFound ${issues.length} issue(s).`);
    process.exit(1);
  }

  console.log(`Validated ${markdownFiles.length} markdown files. No issues found.`);
}

if (import.meta.url === pathToFileURL(process.argv[1])?.href) {
  main();
}
