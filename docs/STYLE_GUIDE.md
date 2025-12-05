---
title: VoiceAssist Documentation Style Guide
status: stable
lastUpdated: 2025-12-04T00:00:00.000Z
audience:
  - developers
  - technical-writers
  - ai-agents
category: reference
owner: docs
summary: Writing standards for VoiceAssist documentation
component: "docs/standards"
relatedPaths:
  - "docs/DOCUMENTATION_METADATA_STANDARD.md"
ai_summary: >-
  This guide establishes consistent writing standards for all VoiceAssist
  documentation, ensuring clarity for both human readers and AI agents. Every
  markdown document MUST include frontmatter: --- title: Document Title
  (required) status: draft|experimental|stable|deprecated (required)
  lastUpdated:...
---

# VoiceAssist Documentation Style Guide

This guide establishes consistent writing standards for all VoiceAssist documentation, ensuring clarity for both human readers and AI agents.

## Document Structure

### Required Frontmatter

Every markdown document MUST include frontmatter:

```yaml
---
title: Document Title (required)
status: draft|experimental|stable|deprecated (required)
lastUpdated: YYYY-MM-DD (required)
audience: [list of target readers] (required)
category: category-slug (required)
owner: team-name (required)
summary: Brief description (required for key docs)
---
```

### Valid Values

**Status:**

- `draft` - Work in progress, not reviewed
- `experimental` - New content, subject to change
- `stable` - Reviewed and maintained
- `deprecated` - Outdated, pending removal

**Audience:**

- `developers` - Software engineers
- `admin` - System administrators
- `ai-agents` - AI/LLM consumers
- `user` - End users
- `frontend` - Frontend developers
- `backend` - Backend developers
- `devops` - DevOps/SRE engineers

**Category:**

- `overview` - High-level documentation
- `reference` - API/technical reference
- `architecture` - System design
- `deployment` - Installation/deployment
- `security` - Security documentation
- `feature-flags` - Feature flag documentation
- `testing` - Testing guides

## Writing Standards

### Voice and Tone

- Use **active voice**: "The API returns a JSON response" not "A JSON response is returned by the API"
- Be **direct and concise**: Get to the point quickly
- Use **present tense**: "This function validates..." not "This function will validate..."
- Be **objective**: Focus on facts, not opinions

### Formatting

#### Headings

```markdown
# Page Title (H1 - only one per document)

## Major Section (H2)

### Subsection (H3)

#### Detail (H4 - use sparingly)
```

#### Code Blocks

Always specify language for syntax highlighting:

```typescript
// TypeScript example
function example(): void {
  console.log("Hello");
}
```

```bash
# Shell commands
npm run build
```

#### Lists

Use bullet points for unordered items:

- Item one
- Item two

Use numbered lists for sequential steps:

1. First step
2. Second step

#### Tables

Use tables for structured comparisons:

| Column A | Column B | Column C |
| -------- | -------- | -------- |
| Value 1  | Value 2  | Value 3  |

### URLs and Links

- Use canonical URLs as defined in the plan:
  - Web app: `https://dev.asimo.io`
  - API: `https://assist.asimo.io`
  - Admin: `https://admin.asimo.io`
  - Docs: `https://assistdocs.asimo.io`

- Use relative links for internal docs: `[Related Doc](./related-doc.md)`
- Use absolute URLs for external resources

### Code References

When referencing code:

- Use backticks for inline code: `functionName()`
- Include file paths: `services/api-gateway/src/routes.ts:42`
- Link to source when helpful

### API Documentation

Follow this structure for endpoints:

````markdown
### POST /api/resource

Create a new resource.

**Request:**

```json
{
  "name": "string",
  "value": "number"
}
```
````

**Response (200):**

```json
{
  "id": "string",
  "name": "string",
  "created_at": "ISO-8601"
}
```

**Errors:**

- `400` - Invalid request body
- `401` - Unauthorized
- `500` - Server error

````

## AI Agent Considerations

Documentation should be consumable by AI agents:

### Machine-Readable Summaries

Include `ai_summary` in frontmatter for key documents:

```yaml
ai_summary: "API Gateway handles auth, rate limiting, and routing. Main entry point at /api/*. Uses JWT tokens. See routes.ts for all endpoints."
````

### Structured Information

Use consistent patterns AI can parse:

- **Definition lists** for terminology
- **Tables** for comparisons
- **Code blocks** for examples
- **Frontmatter** for metadata

### Avoid

- Ambiguous pronouns ("it", "this") without clear referents
- Implicit knowledge assumptions
- Colloquialisms and idioms

## File Naming

- Use **lowercase** with **hyphens**: `feature-flags.md`
- Be **descriptive**: `api-authentication-guide.md` not `auth.md`
- Match the title: Title "API Guide" = file `api-guide.md`

## Images and Diagrams

- Store in `/docs/assets/images/`
- Use descriptive filenames: `architecture-overview.png`
- Include alt text: `![Architecture diagram showing service connections](./assets/images/architecture-overview.png)`
- Prefer SVG for diagrams when possible

## Versioning

For versioned documentation:

- Use URL paths: `/v1/api-reference.md`, `/v2/api-reference.md`
- Mark old versions as deprecated
- Link to latest version prominently

## Review Checklist

Before publishing:

- [ ] Frontmatter complete and valid
- [ ] No broken internal links
- [ ] Code examples are correct and tested
- [ ] URLs use canonical domains
- [ ] Spelling and grammar checked
- [ ] Technical accuracy verified
- [ ] AI-readable (clear summaries, structured data)

## Tools

### Validation

```bash
# Validate frontmatter
npm run validate:docs

# Check links
npm run check:links

# Lint markdown
npm run lint:docs
```

### Generation

```bash
# Generate agent JSON
npm run generate:agent

# Update search index
npm run build:search
```
