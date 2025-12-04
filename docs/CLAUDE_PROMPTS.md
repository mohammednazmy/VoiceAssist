---
title: Claude Prompts Library
slug: ai/claude-prompts
summary: >-
  Ready-to-use prompts for Claude Code sessions on VoiceAssist - phase
  implementation, bugfix, documentation, testing.
status: stable
stability: production
owner: docs
lastUpdated: "2025-11-27"
audience:
  - agent
  - ai-agents
  - human
tags:
  - claude
  - prompts
  - ai-agent
  - templates
category: ai
version: 1.0.0
ai_summary: >-
  This document contains ready-to-use prompts for different types of work on
  VoiceAssist V2. Copy and paste these prompts into a Claude Code session, fill
  in the bracketed placeholders, and Claude will follow the appropriate
  workflow. For detailed execution guidelines, see CLAUDE_EXECUTION_GUIDE.md...
---

# Claude Code Prompt Library

This document contains ready-to-use prompts for different types of work on VoiceAssist V2. Copy and paste these prompts into a Claude Code session, fill in the bracketed placeholders, and Claude will follow the appropriate workflow.

**For detailed execution guidelines, see [CLAUDE_EXECUTION_GUIDE.md](CLAUDE_EXECUTION_GUIDE.md)**

---

## Table of Contents

1. [Phase Implementation Prompt](#1-phase-implementation-prompt)
2. [Bugfix / Refactor Prompt](#2-bugfix--refactor-prompt)
3. [Documentation Update Prompt](#3-documentation-update-prompt)
4. [Infrastructure / Deployment Prompt](#4-infrastructure--deployment-prompt)

---

## 1. Phase Implementation Prompt

Use this prompt when you want Claude to implement a complete development phase from the VoiceAssist V2 roadmap.

### When to Use

- Implementing project phases 0-15 or web app phases 0-8
- Starting a new major component or feature
- Following the documented phase plan

### Prompt Template

```
I want you to implement Phase [N]: [Phase Name] for the VoiceAssist V2 project.

**Before starting:**
1. Read ~/VoiceAssist/docs/overview/IMPLEMENTATION_STATUS.md (source of truth)
2. Read ~/VoiceAssist/docs/phases/PHASE_[N]_[NAME].md
3. Read ~/VoiceAssist/docs/UNIFIED_ARCHITECTURE.md
4. Read relevant spec documents for this phase

**Your task:**
1. Create a branch: `phase-[N]-[short-name]`
2. Complete all tasks in the phase document sequentially
3. Run tests after each major component
4. Update documentation as you go
5. Verify all exit criteria are met
6. Run full test suite (backend + frontend)
7. Commit with message: `feat(phase-[N]): implement [phase name]`
8. Update IMPLEMENTATION_STATUS.md if component status changed

**Quality standards:**
- All tests must pass
- No linting errors
- Docker Compose services start successfully
- Documentation is updated
- Code follows project conventions

Please confirm you've read the required docs, then proceed with implementation.
```

### Example (Filled In)

```
I want you to implement Phase 5: Medical Knowledge Base & RAG System for the VoiceAssist V2 project.

**Before starting:**
1. Read ~/VoiceAssist/CURRENT_PHASE.md
2. Read ~/VoiceAssist/docs/phases/PHASE_05_MEDICAL_AI.md
3. Read ~/VoiceAssist/docs/ARCHITECTURE_V2.md
4. Read ~/VoiceAssist/docs/SEMANTIC_SEARCH_DESIGN.md

**Your task:**
1. Create a branch: `phase-5-medical-ai`
2. Complete all tasks in the phase document sequentially
3. Run tests after each major component
4. Update documentation as you go
5. Verify all exit criteria are met
6. Run full test suite (backend + frontend)
7. Commit with message: `feat(phase-5): implement medical knowledge base and RAG system`
8. Update CURRENT_PHASE.md to mark phase complete

**Quality standards:**
- All tests must pass
- No linting errors
- Docker Compose services start successfully
- Documentation is updated
- Code follows project conventions

Please confirm you've read the required docs, then proceed with implementation.
```

---

## 2. Bugfix / Refactor Prompt

Use this prompt when you need to fix a bug or refactor existing code without adding new features.

### When to Use

- Fixing a reported bug or issue
- Refactoring code for better maintainability
- Improving performance of existing features
- Addressing technical debt

### Prompt Template

```
I need you to fix a bug / refactor code in the VoiceAssist V2 project.

**Issue description:**
[Describe the bug or refactoring goal in detail. Include:
- What is broken or needs improvement?
- How to reproduce the issue (if bug)?
- Expected vs actual behavior?
- Any error messages or logs?]

**Affected service/component:**
[Specify: voice-proxy, medical-kb, web-app, admin-panel, auth-service, etc.]

**Before starting:**
1. Read ~/VoiceAssist/docs/overview/IMPLEMENTATION_STATUS.md (source of truth)
2. Read ~/VoiceAssist/docs/UNIFIED_ARCHITECTURE.md
3. Read the relevant service README (e.g., services/api-gateway/README.md)
4. Review existing code in the affected area

**Your task:**
1. Create a branch: `fix/[issue-description]` or `refactor/[description]`
2. Reproduce the issue (if applicable)
3. Implement the fix/refactor
4. Add/update tests to cover the change
5. Run test suite to ensure no regressions
6. Update documentation if behavior changed
7. Commit with descriptive message

**Quality standards:**
- Fix must be minimal and focused
- All tests pass
- No breaking changes to public APIs
- Add regression test if fixing a bug

Please confirm understanding and proceed.
```

### Example (Filled In)

```
I need you to fix a bug in the VoiceAssist V2 project.

**Issue description:**
The Medical KB search is timing out for queries longer than 100 characters. When a user submits a long clinical question (e.g., "What is the management approach for a 65-year-old male with decompensated heart failure, CKD stage 3b, and diabetes mellitus type 2?"), the Qdrant vector search takes >30 seconds and times out.

Error message:
```

TimeoutError: Qdrant search exceeded 30s timeout
File: app/services/medical/rag.py, line 145

```

Expected: Search should complete within 5 seconds
Actual: Search times out after 30 seconds

**Affected service/component:**
medical-kb service (app/services/medical/rag.py)

**Before starting:**
1. Read ~/VoiceAssist/docs/overview/IMPLEMENTATION_STATUS.md (source of truth)
2. Read ~/VoiceAssist/docs/UNIFIED_ARCHITECTURE.md
3. Read services/api-gateway/README.md
4. Review existing code in services/api-gateway/app/services/

**Your task:**
1. Create a branch: `fix/kb-search-timeout`
2. Reproduce the issue with a long query
3. Implement the fix (likely need to optimize vector search or add query truncation)
4. Add/update tests to cover long queries
5. Run test suite to ensure no regressions
6. Update documentation if behavior changed
7. Commit with descriptive message

**Quality standards:**
- Fix must be minimal and focused
- All tests pass
- No breaking changes to public APIs
- Add regression test for long queries

Please confirm understanding and proceed.
```

---

## 3. Documentation Update Prompt

Use this prompt when you need to update, create, or improve documentation without changing code.

### When to Use

- Adding missing documentation
- Updating docs after code changes
- Creating new guides or references
- Fixing broken links or outdated information

### Prompt Template

```
I need you to update documentation for the VoiceAssist V2 project.

**Documentation to update:**
[Specify files or sections. Examples:
- Add API examples to server/README.md
- Update ARCHITECTURE_V2.md with new service
- Create troubleshooting guide
- Fix broken links in all docs]

**Changes needed:**
[Describe what needs to be added, updated, or removed:
- New sections to add
- Outdated information to correct
- Missing examples or diagrams
- Formatting improvements]

**Before starting:**
1. Read ~/VoiceAssist/docs/START_HERE.md
2. Review the existing documentation structure
3. Check for cross-references that may need updating

**Your task:**
1. Update the specified documentation
2. Ensure all internal links work
3. Maintain consistent formatting (Markdown, code blocks, headers)
4. Update cross-references in related docs
5. Verify code examples are syntactically correct
6. Commit with message: `docs: [description]`

**Quality standards:**
- No broken links
- Consistent with existing doc style
- Code examples are tested/verified
- Clear and concise language

Please proceed with the documentation updates.
```

### Example (Filled In)

```
I need you to update documentation for the VoiceAssist V2 project.

**Documentation to update:**
- docs/ARCHITECTURE_V2.md (add mTLS section)
- docs/SECURITY_COMPLIANCE.md (add service mesh security)
- docs/SERVICE_CATALOG.md (update all services with mTLS info)

**Changes needed:**
After implementing service mesh with Linkerd, we need to document how mTLS works:
1. Add "Service Mesh Security" section to ARCHITECTURE_V2.md explaining mTLS
2. Update SECURITY_COMPLIANCE.md to note mTLS for all inter-service communication
3. Update each service in SERVICE_CATALOG.md to mention mTLS in "Dependencies" section
4. Add diagram showing mTLS flow between services
5. Document how to verify mTLS is working (linkerd check, certificates)

**Before starting:**
1. Read ~/VoiceAssist/docs/START_HERE.md
2. Review the existing documentation structure
3. Check for cross-references that may need updating

**Your task:**
1. Update the specified documentation
2. Ensure all internal links work
3. Maintain consistent formatting (Markdown, code blocks, headers)
4. Update cross-references in related docs
5. Verify code examples are syntactically correct
6. Commit with message: `docs: add service mesh mTLS documentation`

**Quality standards:**
- No broken links
- Consistent with existing doc style
- Code examples are tested/verified
- Clear and concise language

Please proceed with the documentation updates.
```

---

## 4. Infrastructure / Deployment Prompt

Use this prompt for infrastructure changes, deployment configuration, Docker Compose updates, or Kubernetes manifest work.

### When to Use

- Modifying docker-compose.yml
- Creating or updating Kubernetes manifests
- Configuring monitoring/observability
- Setting up CI/CD pipelines
- Deployment automation

### Prompt Template

```
I need you to work on infrastructure or deployment for VoiceAssist V2.

**Infrastructure task:**
[Describe the infrastructure work. Examples:
- Add new service to docker-compose.yml
- Create Kubernetes deployment manifests
- Set up Prometheus monitoring
- Configure CI/CD pipeline
- Optimize Docker image sizes]

**Before starting:**
1. Read ~/VoiceAssist/docs/overview/IMPLEMENTATION_STATUS.md (source of truth)
2. Read ~/VoiceAssist/docs/UNIFIED_ARCHITECTURE.md
3. Read ~/VoiceAssist/docs/INFRASTRUCTURE_SETUP.md
4. If K8s-related: Read ~/VoiceAssist/docs/COMPOSE_TO_K8S_MIGRATION.md

**Your task:**
1. Create a branch: `infra/[description]`
2. Implement the infrastructure changes
3. Test locally with Docker Compose (if applicable)
4. Validate configuration syntax
5. Update documentation (LOCAL_DEVELOPMENT.md or INFRASTRUCTURE_SETUP.md)
6. Document any new environment variables or ports
7. Commit with message: `infra: [description]`

**Quality standards:**
- Services start successfully
- No port conflicts
- Environment variables documented
- Deployment process documented
- Rollback procedure documented

Please confirm understanding and proceed.
```

### Example (Filled In)

```
I need you to work on infrastructure for VoiceAssist V2.

**Infrastructure task:**
Add Prometheus and Grafana to docker-compose.yml for monitoring all microservices:
1. Add Prometheus service with scrape configs for all services
2. Add Grafana service with pre-configured dashboards
3. Configure all microservices to expose /metrics endpoint
4. Set up persistent volumes for Prometheus data and Grafana dashboards
5. Create Grafana dashboards for:
   - System overview (CPU, memory, network)
   - Service health (request rate, latency, error rate)
   - Medical KB metrics (queries, vector search latency)
   - Voice Proxy metrics (active connections, WebSocket stats)

**Before starting:**
1. Read ~/VoiceAssist/docs/ARCHITECTURE_V2.md
2. Read ~/VoiceAssist/docs/LOCAL_DEVELOPMENT.md
3. Read ~/VoiceAssist/docs/INFRASTRUCTURE_SETUP.md

**Your task:**
1. Create a branch: `infra/prometheus-grafana`
2. Add Prometheus and Grafana to docker-compose.yml
3. Configure Prometheus scraping for all services
4. Create Grafana datasource and dashboard configs
5. Test locally - verify all metrics are collected
6. Update LOCAL_DEVELOPMENT.md with:
   - How to access Prometheus (http://localhost:9090)
   - How to access Grafana (http://localhost:3000)
   - Default credentials
   - How to add custom dashboards
7. Commit with message: `infra: add Prometheus and Grafana monitoring stack`

**Quality standards:**
- Services start successfully
- No port conflicts (9090, 3000)
- All microservices expose /metrics
- Dashboards display real metrics
- Documentation is complete

Please confirm understanding and proceed.
```

---

## Using These Prompts

### Step 1: Choose the Right Prompt

- **Phase Implementation**: For sequential development phases
- **Bugfix/Refactor**: For fixing issues or improving code
- **Documentation**: For doc-only changes
- **Infrastructure**: For Docker, K8s, monitoring, deployment

### Step 2: Fill in the Placeholders

Replace all `[bracketed text]` with specific information:

- `[N]` → Phase number (0-15 for project phases, 0-8 for web app phases)
- `[Phase Name]` → Phase name from docs/phases/
- `[issue-description]` → Brief description of the issue
- `[description]` → Brief description of the work
- `[service/component]` → Specific service or component name

### Step 3: Paste into Claude Code

1. Open a new Claude Code conversation
2. Paste the filled-in prompt
3. Wait for Claude to confirm it has read the required docs
4. Claude will proceed with the work

### Step 4: Monitor Progress

- Claude will provide updates as it works
- Review code changes before committing
- Run quality checks manually if desired
- Verify all exit criteria are met

---

## Prompt Customization

### Adding Constraints

You can add additional constraints to any prompt:

```
**Additional constraints:**
- Do not modify files in legacy/ directory
- Use Python 3.11 features (no 3.12+)
- Maintain backward compatibility with existing APIs
- Complete within 2 hours
```

### Specifying Context

Provide additional context if needed:

```
**Additional context:**
- Previous attempt failed due to [reason]
- This is blocking work on [other task]
- This is a high priority issue affecting production
- Coordinate with other session working on [component]
```

### Requesting Specific Approach

Guide Claude's approach:

```
**Preferred approach:**
- Use existing library X instead of library Y
- Follow pattern from service Z
- Optimize for readability over performance
- Add extensive logging for debugging
```

---

## Common Scenarios

### Scenario 1: Starting Fresh on a Phase

```
I want you to implement Phase 3: Authentication & Security for the VoiceAssist V2 project.
[Use Phase Implementation Prompt]
```

### Scenario 2: Fixing a Production Bug

```
I need you to fix a critical bug in the voice-proxy service causing WebSocket disconnections.
[Use Bugfix Prompt with high priority noted]
```

### Scenario 3: Adding API Documentation

```
I need you to update server/README.md with complete API contract examples for all endpoints.
[Use Documentation Update Prompt]
```

### Scenario 4: Setting Up CI/CD

```
I need you to create a GitHub Actions workflow for automated testing and deployment.
[Use Infrastructure Prompt]
```

---

## Tips for Effective Prompts

### Be Specific

- **Bad**: "Fix the search bug"
- **Good**: "Fix the Qdrant timeout issue in medical-kb when queries exceed 100 characters"

### Provide Context

- Include error messages
- Note what you've already tried
- Mention any constraints or requirements

### Set Clear Expectations

- Define "done" criteria
- Specify quality standards
- Note any blockers or dependencies

### Reference Docs

- Point to relevant specs
- Link to related issues
- Mention similar implementations

---

## Troubleshooting

### "Claude isn't following the prompt"

- Ensure all placeholders `[like this]` are filled in
- Check that referenced files exist
- Verify paths are correct for the project

### "Claude skipped quality checks"

- Explicitly remind Claude to run checks
- Add checks to the task list
- Request verification before marking complete

### "Claude made changes I didn't want"

- Be more specific in the issue description
- Add constraints section
- Review changes before committing

### "Multiple prompts are needed"

- Break complex work into smaller prompts
- Use Phase prompt for new features
- Use Bugfix prompt for corrections
- Chain prompts sequentially

---

## Related Documentation

- [CLAUDE_EXECUTION_GUIDE.md](CLAUDE_EXECUTION_GUIDE.md) - Detailed execution guidelines
- [Implementation Status](overview/IMPLEMENTATION_STATUS.md) - **Source of truth** for component status
- [START_HERE.md](START_HERE.md) - Project orientation
- [UNIFIED_ARCHITECTURE.md](UNIFIED_ARCHITECTURE.md) - System architecture
- [Agent Onboarding](ai/AGENT_ONBOARDING.md) - AI assistant quick start
- [Agent API Reference](ai/AGENT_API_REFERENCE.md) - Machine-readable endpoints

---

**Last Updated**: 2025-11-27
**Version**: V2.1

**Note**: These prompts are designed for Claude Code but can be adapted for other AI assistants or human developers by adjusting the phrasing and removing AI-specific instructions.
