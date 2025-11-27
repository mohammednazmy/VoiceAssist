---
title: "Docs Site Path Resolution Plan"
slug: "plans/docs-site-path-resolution-plan"
summary: "**Issue**: The `navigation.ts` file references package and service READMEs (`packages/api-client/README.md`, `services/api-gateway/README.md`) that ex..."
status: stable
stability: beta
owner: mixed
lastUpdated: "2025-11-27"
audience: ["human"]
tags: ["docs", "site", "path", "resolution"]
category: planning
---

# Docs Site Path Resolution Plan

**Issue**: The `navigation.ts` file references package and service READMEs (`packages/api-client/README.md`, `services/api-gateway/README.md`) that exist at the project root, but `loadDoc()` only resolves paths relative to the `docs/` directory.

**Current Behavior**: Pages show "Content coming soon" for these navigation items.

---

## Problem Analysis

### Current Architecture

```
VoiceAssist/
├── docs/                          # DOCS_DIR - where loadDoc() looks
│   ├── archive/
│   ├── api-reference/
│   └── *.md files
├── packages/                      # Package READMEs live here
│   ├── api-client/README.md
│   ├── config/README.md
│   └── ...
├── services/                      # Service READMEs live here
│   └── api-gateway/README.md
└── apps/
    └── docs-site/                 # The Next.js documentation site
        └── src/lib/
            ├── docs.ts            # loadDoc() function
            └── navigation.ts      # References all paths
```

### Root Cause

1. `loadDoc(relativePath)` in `docs.ts` joins paths with `DOCS_DIR` (the `docs/` folder)
2. `navigation.ts` specifies `docPaths` like `packages/api-client/README.md`
3. This resolves to `docs/packages/api-client/README.md` which doesn't exist
4. Security checks in `loadDoc()` intentionally block `..` traversal

---

## Solution Options

### Option A: Path Prefix Convention (Recommended)

**Approach**: Use a prefix convention to indicate the base directory for each path.

```typescript
// navigation.ts - Updated docPaths format
docPaths: [
  "API_REFERENCE.md", // Resolves to docs/API_REFERENCE.md
  "@root/services/api-gateway/README.md", // Resolves to project root
  "@root/packages/api-client/README.md", // Resolves to project root
];
```

**Implementation**:

1. Define `PROJECT_ROOT` in `docs.ts` alongside `DOCS_DIR`
2. Create `loadDocWithPrefix()` that parses the prefix and routes appropriately
3. Update `DocPage.tsx` to use the new loader
4. Update `navigation.ts` paths with `@root/` prefix where needed

**Pros**:

- Explicit and self-documenting
- No magic behavior
- Maintains security (whitelist approach)
- Easy to extend for future base directories

**Cons**:

- Requires updating existing navigation entries
- Slightly more verbose paths

---

### Option B: Multi-Directory Auto-Resolution

**Approach**: Try multiple directories in order until a file is found.

```typescript
const SEARCH_PATHS = [
  DOCS_DIR, // Try docs/ first
  PROJECT_ROOT, // Then try project root
];

function loadDoc(relativePath: string): DocContent | null {
  for (const basePath of SEARCH_PATHS) {
    const fullPath = path.join(basePath, relativePath);
    if (fs.existsSync(fullPath)) {
      return loadFromPath(fullPath, basePath);
    }
  }
  return null;
}
```

**Pros**:

- No changes to navigation.ts needed
- "It just works" behavior

**Cons**:

- Implicit behavior can be confusing
- Potential for unexpected file resolution
- Harder to debug which file was loaded
- Security implications if not carefully implemented

---

### Option C: Build-Time Sync Script

**Approach**: Copy/symlink READMEs to `docs/` during build.

```bash
# prebuild script
cp packages/*/README.md docs/packages/
cp services/*/README.md docs/services/
```

**Pros**:

- No code changes to docs.ts
- Simple file system approach

**Cons**:

- Files can get out of sync
- Clutters docs/ directory
- Symlinks don't work well across all environments
- Need to update .gitignore

---

### Option D: Extended NavItem Interface

**Approach**: Add `baseDir` property to docPaths entries.

```typescript
interface DocPath {
  path: string;
  baseDir?: "docs" | "root"; // default: 'docs'
}

// navigation.ts
docPaths: [{ path: "API_REFERENCE.md" }, { path: "services/api-gateway/README.md", baseDir: "root" }];
```

**Pros**:

- Type-safe
- Flexible

**Cons**:

- Breaking change to navigation.ts structure
- More verbose than prefix convention
- Requires updating DocPage component

---

## Recommended Solution: Option A (Path Prefix Convention)

### Implementation Plan

#### Phase 1: Update docs.ts (30 min)

```typescript
// docs.ts additions

// Project root (monorepo root, parent of docs/)
export const PROJECT_ROOT = path.join(DOCS_DIR, "..");

// Allowed prefixes and their base directories
const PATH_PREFIXES: Record<string, string> = {
  "@root/": PROJECT_ROOT,
  "@docs/": DOCS_DIR, // explicit docs prefix (optional)
};

/**
 * Load a document with prefix support
 * - No prefix or @docs/ prefix: loads from docs/
 * - @root/ prefix: loads from project root
 */
export function loadDocWithPrefix(docPath: string): DocContent | null {
  let basePath = DOCS_DIR;
  let relativePath = docPath;

  // Check for prefixes
  for (const [prefix, baseDir] of Object.entries(PATH_PREFIXES)) {
    if (docPath.startsWith(prefix)) {
      basePath = baseDir;
      relativePath = docPath.slice(prefix.length);
      break;
    }
  }

  // Security: reject path traversal
  if (relativePath.includes("..") || path.isAbsolute(relativePath)) {
    console.warn(`Invalid path rejected: ${docPath}`);
    return null;
  }

  const fullPath = path.join(basePath, relativePath);

  // Security: ensure resolved path stays within base
  if (!isPathWithinBase(basePath, fullPath)) {
    console.warn(`Path traversal blocked: ${docPath}`);
    return null;
  }

  // Load the file
  try {
    if (!fs.existsSync(fullPath)) {
      return null; // Silent fail - DocPage handles missing docs gracefully
    }
    const fileContents = fs.readFileSync(fullPath, "utf8");
    const { data, content } = matter(fileContents);
    return { content, frontmatter: data };
  } catch (error) {
    console.error(`Error loading ${docPath}:`, error);
    return null;
  }
}

/**
 * Get GitHub URL for a document (handles prefixes)
 */
export function getGitHubEditUrlWithPrefix(docPath: string): string {
  let repoPath = `docs/${docPath}`;

  if (docPath.startsWith("@root/")) {
    repoPath = docPath.slice(6); // Remove @root/ prefix
  } else if (docPath.startsWith("@docs/")) {
    repoPath = `docs/${docPath.slice(6)}`;
  }

  return `https://github.com/${GITHUB_REPO}/edit/${GITHUB_BRANCH}/${repoPath}`;
}
```

#### Phase 2: Update DocPage.tsx (10 min)

```typescript
// DocPage.tsx - Update import and usage
import { loadDocWithPrefix } from "@/lib/docs";

// Change line 17 from:
.map((path) => ({ path, doc: loadDoc(path) }))
// To:
.map((path) => ({ path, doc: loadDocWithPrefix(path) }))
```

#### Phase 3: Update navigation.ts (15 min)

Update the package and service paths to use the `@root/` prefix:

```typescript
{
  title: "API Reference",
  href: "/reference/api",
  description: "REST endpoints, gateway routing, and OpenAPI details",
  docPaths: [
    "API_REFERENCE.md",
    "api-reference/rest-api.md",
    "@root/services/api-gateway/README.md",  // Updated
  ],
},
{
  title: "Packages",
  href: "/reference/all-docs",
  description: "Monorepo package READMEs and shared utilities",
  docPaths: [
    "@root/packages/api-client/README.md",      // Updated
    "@root/packages/config/README.md",          // Updated
    "@root/packages/design-tokens/README.md",   // Updated
    "@root/packages/telemetry/README.md",       // Updated
    "@root/packages/types/README.md",           // Updated
    "@root/packages/ui/README.md",              // Updated
    "@root/packages/utils/README.md",           // Updated
  ],
},
```

#### Phase 4: Update Tests (if any) (15 min)

Add unit tests for the new `loadDocWithPrefix()` function:

```typescript
describe("loadDocWithPrefix", () => {
  it("loads docs from docs/ by default", () => {
    const result = loadDocWithPrefix("START_HERE.md");
    expect(result).not.toBeNull();
  });

  it("loads docs from project root with @root/ prefix", () => {
    const result = loadDocWithPrefix("@root/packages/api-client/README.md");
    expect(result).not.toBeNull();
  });

  it("blocks path traversal attempts", () => {
    const result = loadDocWithPrefix("@root/../../../etc/passwd");
    expect(result).toBeNull();
  });
});
```

#### Phase 5: Documentation (10 min)

Add a comment block in navigation.ts explaining the convention:

```typescript
/**
 * Documentation paths can use these prefixes:
 * - No prefix: Relative to docs/ directory (e.g., "START_HERE.md")
 * - @root/: Relative to project root (e.g., "@root/packages/ui/README.md")
 *
 * Example:
 *   docPaths: [
 *     "ARCHITECTURE.md",                    // → docs/ARCHITECTURE.md
 *     "@root/services/api-gateway/README.md" // → services/api-gateway/README.md
 *   ]
 */
```

---

## Security Considerations

1. **Path Traversal Prevention**: The implementation maintains the existing `..` rejection and `isPathWithinBase()` check
2. **Whitelist Approach**: Only explicitly defined prefixes are allowed
3. **Base Directory Validation**: Each prefix maps to a specific, validated base directory
4. **No Arbitrary File Access**: Cannot escape the defined base directories

---

## Testing Checklist

- [ ] Existing doc pages still work (no regression)
- [ ] Package README pages now load content
- [ ] Service README pages now load content
- [ ] Path traversal attempts are blocked
- [ ] GitHub edit links work correctly
- [ ] Build succeeds without errors
- [ ] Dev server works correctly

---

## Estimated Effort

| Phase     | Task                 | Time           |
| --------- | -------------------- | -------------- |
| 1         | Update docs.ts       | 30 min         |
| 2         | Update DocPage.tsx   | 10 min         |
| 3         | Update navigation.ts | 15 min         |
| 4         | Add tests            | 15 min         |
| 5         | Documentation        | 10 min         |
| **Total** |                      | **~1.5 hours** |

---

## Future Enhancements

1. **Add more prefixes**: Could add `@apps/` for loading from apps directory
2. **Caching**: Add file content caching for production builds
3. **Hot reload**: Ensure dev server picks up changes to external docs
4. **Search index**: Update search index generation to include `@root/` docs

---

## Rollback Plan

If issues arise:

1. Revert the navigation.ts changes (remove `@root/` prefixes)
2. The system will gracefully fall back to "Content coming soon"
3. No data loss or breaking changes to other parts of the system
