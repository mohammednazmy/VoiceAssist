---
title: Repository Navigation for AI Agents
slug: ai/repo-navigation-for-agents
summary: >-
  Patterns and strategies for AI agents to navigate the VoiceAssist repository
  using machine-readable endpoints.
status: stable
stability: production
owner: docs
lastUpdated: "2025-12-04"
audience:
  - ai-agents
tags:
  - ai-agent
  - repository
  - navigation
  - codebase
category: ai
version: 1.0.0
component: "platform/ai-agents"
relatedPaths:
  - "apps/docs-site/scripts/generate-repo-index.mjs"
  - "apps/docs-site/scripts/generate-doc-code-map.mjs"
ai_summary: >-
  Guide for AI agents to navigate the VoiceAssist monorepo via JSON endpoints.
  Covers repo-index.json (25k+ entries with component/language metadata),
  manifest.json (400+ curated key files), and file content retrieval. Includes
  path encoding rules, component categories, navigation patterns, and example
  workflows for feature location and docs-vs-code auditing.
---

# Repository Navigation for AI Agents

This guide explains how AI agents can efficiently navigate the VoiceAssist repository using machine-readable JSON endpoints.

## Endpoints Overview

| Endpoint                                | Size   | Purpose                        |
| --------------------------------------- | ------ | ------------------------------ |
| `/agent/repo-index.json`                | ~3 MB  | Complete repository structure  |
| `/agent/repo/manifest.json`             | ~50 KB | Curated key files index        |
| `/agent/repo/files/{encoded-path}.json` | Varies | Individual source file content |

## Path Encoding

File paths are encoded for URL safety:

- Forward slashes (`/`) become double underscores (`__`)
- `.json` extension is appended

**Examples:**
| Original Path | Encoded Filename |
| ------------------------------------------ | ---------------------------------------------------- |
| `package.json` | `package.json.json` |
| `services/api-gateway/app/main.py` | `services__api-gateway__app__main.py.json` |
| `apps/web-app/src/app/page.tsx` | `apps__web-app__src__app__page.tsx.json` |
| `docs/ai/AGENT_API_REFERENCE.md` | `docs__ai__AGENT_API_REFERENCE.md.json` |

## Component Categories

Files are categorized by their location in the monorepo:

| Component              | Path Prefix            | Description                  |
| ---------------------- | ---------------------- | ---------------------------- |
| `frontend/web-app`     | `apps/web-app`         | Main user-facing Next.js app |
| `frontend/admin-panel` | `apps/admin-panel`     | Admin dashboard Next.js app  |
| `frontend/docs-site`   | `apps/docs-site`       | Documentation site           |
| `backend/api-gateway`  | `services/api-gateway` | FastAPI backend server       |
| `backend/services`     | `services/*`           | Other backend services       |
| `shared/packages`      | `packages/*`           | Shared TypeScript packages   |
| `infra`                | `infrastructure/*`     | Infrastructure configs       |
| `infra/k8s`            | `k8s/*`, `ha-dr/*`     | Kubernetes configs           |
| `docs`                 | `docs/*`               | Documentation markdown       |
| `testing`              | `tests/*`, `e2e/*`     | Test files                   |
| `tooling`              | `scripts/*`            | Build and utility scripts    |
| `root`                 | (no prefix)            | Root-level config files      |

## Navigation Patterns

### Pattern 1: Top-Down Discovery

Start with the manifest to understand project structure:

```bash
# 1. Get overview stats
curl https://assistdocs.asimo.io/agent/repo-index.json | jq '{
  files: .stats.total_files,
  dirs: .stats.total_dirs,
  size_mb: (.stats.total_size_bytes / 1048576 | floor),
  languages: .stats.by_language,
  components: .stats.by_component
}'

# 2. List key entry points from manifest
curl https://assistdocs.asimo.io/agent/repo/manifest.json | jq '[.files[] | select(.path | endswith("main.py") or endswith("page.tsx"))]'
```

### Pattern 2: Component-Focused Search

When working on a specific component:

```bash
# Find all files in web-app
curl https://assistdocs.asimo.io/agent/repo-index.json | jq '[.entries[] | select(.component == "frontend/web-app" and .type == "file")]'

# Find React components
curl https://assistdocs.asimo.io/agent/repo-index.json | jq '[.entries[] | select(.component == "frontend/web-app" and (.path | test("components/")))]'
```

### Pattern 3: Keyword Search

Find files by name pattern:

```bash
# Find files with "voice" in path
curl https://assistdocs.asimo.io/agent/repo-index.json | jq '[.entries[] | select(.path | test("voice"; "i"))]'

# Find hook files
curl https://assistdocs.asimo.io/agent/repo-index.json | jq '[.entries[] | select(.path | test("use[A-Z].*\\.ts"))]'
```

### Pattern 4: Language-Based Exploration

When understanding technology stack:

```bash
# All TypeScript files
curl https://assistdocs.asimo.io/agent/repo-index.json | jq '[.entries[] | select(.language == "typescript")] | length'

# All Python files in backend
curl https://assistdocs.asimo.io/agent/repo-index.json | jq '[.entries[] | select(.language == "python" and (.component | startswith("backend")))]'
```

### Pattern 5: File Content Retrieval

Fetch and analyze source code:

```bash
# Get file content
curl https://assistdocs.asimo.io/agent/repo/files/services__api-gateway__app__main.py.json | jq '{
  path: .path,
  language: .language,
  lines: .lines,
  content: .content
}'

# Check for specific imports (using content)
curl https://assistdocs.asimo.io/agent/repo/files/services__api-gateway__app__main.py.json | jq '.content' | grep -i "from fastapi"
```

## Workflow: Locate a Feature

**Goal**: Find implementation of "voice mode" feature

```bash
# Step 1: Find voice-related docs
curl https://assistdocs.asimo.io/agent/docs.json | jq '[.docs[] | select(.path | test("voice"; "i"))] | map({title, path, ai_summary})'

# Step 2: Find voice-related code files
curl https://assistdocs.asimo.io/agent/repo-index.json | jq '[.entries[] | select(.type == "file" and (.path | test("voice"; "i")))] | map({path, component, language})'

# Step 3: Categorize by component
curl https://assistdocs.asimo.io/agent/repo-index.json | jq '[.entries[] | select(.type == "file" and (.path | test("voice"; "i")))] | group_by(.component) | map({component: .[0].component, count: length})'

# Step 4: Get key implementation file
curl https://assistdocs.asimo.io/agent/repo/files/services__api-gateway__app__api__voice.py.json
```

## Workflow: Audit Docs vs Code

**Goal**: Verify documented API endpoints exist in code

```bash
# Step 1: Get documented API endpoints
curl https://assistdocs.asimo.io/agent/docs.json | jq '[.docs[] | select(.path | test("API_REFERENCE"))]'

# Step 2: Find API route handlers
curl https://assistdocs.asimo.io/agent/repo-index.json | jq '[.entries[] | select(.path | test("services/api-gateway/app/api/.*\\.py$"))]'

# Step 3: Compare documented vs implemented routes
# (Fetch each file and extract route decorators)
```

## Workflow: Understand Package Dependencies

```bash
# Step 1: Get all package.json files
curl https://assistdocs.asimo.io/agent/repo-index.json | jq '[.entries[] | select(.path | endswith("package.json"))]'

# Step 2: Fetch root package.json
curl https://assistdocs.asimo.io/agent/repo/files/package.json.json | jq '.content | fromjson | {dependencies, devDependencies}'

# Step 3: Check pnpm workspace config
curl https://assistdocs.asimo.io/agent/repo/files/pnpm-workspace.yaml.json
```

## Best Practices

### Efficiency

1. **Start with manifest** for common files (faster, smaller payload)
2. **Use repo-index** only when searching across entire codebase
3. **Cache responses** - repo structure doesn't change frequently
4. **Filter server-side** using jq before processing

### Accuracy

1. **Verify paths exist** before fetching file content
2. **Check `last_modified`** to ensure you have current data
3. **Cross-reference docs** when interpreting code

### Limitations

- **File size limit**: Files over 100KB are not exported (error returned)
- **Excluded patterns**: `.env`, secrets, test files, lock files
- **Binary files**: Only text files are included
- **Update frequency**: Regenerated on docs-site build

## Related Documentation

- [Agent API Reference](./AGENT_API_REFERENCE.md) - Complete endpoint documentation
- [Agent Task Index](./AGENT_TASK_INDEX.md) - Common agent tasks
- [Agent Onboarding](./AGENT_ONBOARDING.md) - Getting started guide
