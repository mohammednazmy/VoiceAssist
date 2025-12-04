const fs = require("fs");
const path = require("path");
const matter = require("gray-matter");

const DOCS_DIR =
  process.env.DOCS_DIR || path.join(__dirname, "..", "..", "..", "docs");
const OUTPUT_PATH = path.join(__dirname, "..", "public", "search-index.json");

function slugify(text) {
  return text
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9\s-]/g, "")
    .replace(/\s+/g, "-")
    .replace(/-+/g, "-");
}

function walkMarkdownFiles(dir) {
  const entries = fs.readdirSync(dir, { withFileTypes: true });
  const files = [];

  for (const entry of entries) {
    const fullPath = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      files.push(...walkMarkdownFiles(fullPath));
    } else if (entry.isFile() && entry.name.endsWith(".md")) {
      files.push(fullPath);
    }
  }

  return files;
}

function extractSections(content, fallbackTitle) {
  const lines = content.split(/\r?\n/);
  const sections = [];
  let currentHeading = fallbackTitle;
  let buffer = [];

  for (const line of lines) {
    const headingMatch = line.match(/^#{1,6}\s+(.*)/);
    if (headingMatch) {
      if (buffer.length) {
        sections.push({
          heading: currentHeading,
          body: buffer.join(" ").trim(),
        });
      }
      currentHeading = headingMatch[1].trim();
      buffer = [];
    } else {
      buffer.push(line.trim());
    }
  }

  if (buffer.length) {
    sections.push({
      heading: currentHeading,
      body: buffer.join(" ").trim(),
    });
  }

  return sections.map((section) => ({
    heading: section.heading,
    anchor: slugify(section.heading || fallbackTitle),
    snippet: section.body.replace(/\s+/g, " ").slice(0, 320),
  }));
}

function buildRoutePath(relativePath) {
  const withoutExtension = relativePath.replace(/\.md$/, "");
  return `/docs/${withoutExtension
    .split(path.sep)
    .map((segment) => encodeURIComponent(segment))
    .join("/")}`;
}

function inferCategory(relativePath) {
  const parts = relativePath.split(path.sep);
  if (parts.length === 1) {
    if (parts[0].startsWith("VOICE_")) return "Voice";
    if (parts[0].startsWith("ADMIN_")) return "Admin";
    return "General";
  }

  switch (parts[0]) {
    case "client-implementation":
      return "Frontend";
    case "architecture":
      return "Architecture";
    case "operations":
      return "Operations";
    case "debugging":
      return "Debugging";
    case "testing":
      return "Testing";
    case "ai":
      return "AI & Agents";
    case "overview":
      return "Overview";
    case "phases":
      return "Phases";
    case "admin":
      return "Admin";
    case "archive":
      return "Archive";
    case "plans":
      return "Planning";
    case "deployment":
      return "Deployment";
    case "design-system":
      return "Design System";
    case "infra":
      return "Infrastructure";
    case "api-reference":
      return "Reference";
    default:
      return "General";
  }
}

function buildIndex() {
  const docFiles = walkMarkdownFiles(DOCS_DIR);
  const documents = [];

  for (const filePath of docFiles) {
    const relativePath = path.relative(DOCS_DIR, filePath);
    const raw = fs.readFileSync(filePath, "utf8");
    const { data, content } = matter(raw);
    const stat = fs.statSync(filePath);
    const docTitle =
      data.title ||
      relativePath
        .replace(/\.md$/, "")
        .split(path.sep)
        .pop()
        .replace(/_/g, " ") ||
      "Untitled";
    // Handle Date objects from gray-matter or string dates
    const rawDate = data.lastUpdated || data.last_updated || stat.mtime;
    const lastUpdated = rawDate instanceof Date
      ? rawDate.toISOString().split("T")[0]
      : String(rawDate).split("T")[0];
    const summary = data.summary || data.description || "";
    const status = data.status || "draft";
    const tags = Array.isArray(data.tags) ? data.tags : [];
    const audience = Array.isArray(data.audience) ? data.audience : [];
    const category = data.category || inferCategory(relativePath);

    const sections = extractSections(content, docTitle);
    const baseUrl = buildRoutePath(relativePath);

    if (sections.length === 0) {
      documents.push({
        id: `${relativePath}#${slugify(docTitle)}`,
        path: relativePath,
        docTitle,
        heading: docTitle,
        url: baseUrl,
        snippet: content.replace(/\s+/g, " ").slice(0, 320),
        summary,
        status,
        lastUpdated,
        tags,
        audience,
        category,
      });
      continue;
    }

    sections.forEach((section) => {
      documents.push({
        id: `${relativePath}#${section.anchor}`,
        path: relativePath,
        docTitle,
        heading: section.heading,
        url: `${baseUrl}#${section.anchor}`,
        snippet: section.snippet || content.replace(/\s+/g, " ").slice(0, 320),
        summary,
        status,
        lastUpdated,
        tags,
        audience,
        category,
      });
    });
  }

  return documents;
}

function main() {
  if (!fs.existsSync(DOCS_DIR)) {
    throw new Error(`Docs directory not found at ${DOCS_DIR}`);
  }

  const documents = buildIndex();
  const payload = {
    generatedAt: new Date().toISOString(),
    docs: documents,
  };

  fs.mkdirSync(path.dirname(OUTPUT_PATH), { recursive: true });
  fs.writeFileSync(OUTPUT_PATH, JSON.stringify(payload, null, 2));
  console.log(
    `Generated search index with ${documents.length} entries at ${OUTPUT_PATH}`,
  );
}

if (require.main === module) {
  try {
    main();
  } catch (error) {
    console.error("Failed to generate search index", error);
    process.exit(1);
  }
}
