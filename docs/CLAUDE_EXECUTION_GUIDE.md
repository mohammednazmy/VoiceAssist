---
title: Claude Execution Guide
slug: ai/claude-execution-guide
summary: >-
  Comprehensive instructions for Claude Code working on VoiceAssist - session
  startup, branching, safety rules, quality checks.
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
  - execution
  - guide
  - ai-agent
category: ai
version: 1.0.0
component: "platform/ai-agents"
relatedPaths:
  - "docs/CLAUDE_PROMPTS.md"
  - "docs/ai/AGENT_ONBOARDING.md"
ai_summary: >-
  This guide provides comprehensive instructions for Claude Code (or other AI
  assistants) working on the VoiceAssist V2 project. It covers session startup,
  branching strategy, parallel session safety, quality checks, and phase
  completion criteria. For ready-to-use prompts, see CLAUDE_PROMPTS.md ---...
---

# Claude Code Execution Guide for VoiceAssist V2

This guide provides comprehensive instructions for Claude Code (or other AI assistants) working on the VoiceAssist V2 project. It covers session startup, branching strategy, parallel session safety, quality checks, and phase completion criteria.

**For ready-to-use prompts, see [CLAUDE_PROMPTS.md](CLAUDE_PROMPTS.md)**

---

## Table of Contents

1. [Starting a Claude Code Session](#starting-a-claude-code-session)
2. [Branch and Commit Strategy](#branch-and-commit-strategy)
3. [Parallel Session Safety Rules](#parallel-session-safety-rules)
4. [Quality Checks Before Committing](#quality-checks-before-committing)
5. [Phase Completion Criteria](#phase-completion-criteria)
6. [Working with Documentation](#working-with-documentation)

---

## Starting a Claude Code Session

Every Claude Code session working on VoiceAssist V2 should begin with these steps to ensure proper context and avoid rework.

### 1.1 Sync and Setup

```bash
cd ~/VoiceAssist
git pull origin main
git status  # Check for any uncommitted changes
```

If working on an existing branch:

```bash
git checkout <branch-name>
git pull origin main  # Merge latest changes
git status
```

**Install/update dependencies if needed:**

Backend:

```bash
cd services/api-gateway
pip install -r requirements.txt
```

Frontend:

```bash
cd apps/web-app  # or apps/admin-panel
pnpm install
```

### 1.2 Read Core Documentation

Before starting ANY work, read these documents IN ORDER:

**Required Reading (Always):**

1. `docs/overview/IMPLEMENTATION_STATUS.md` - **Source of truth** for component status
2. `docs/START_HERE.md` - Project orientation and documentation map
3. `docs/UNIFIED_ARCHITECTURE.md` - System architecture and design

**Machine-Readable Endpoints (for AI agents):**

- `http://localhost:3001/agent/index.json` - Documentation metadata
- `http://localhost:3001/agent/docs.json` - Full document list with filtering
- `http://localhost:3001/search-index.json` - Full-text search index

**Phase-Specific Reading:**
If implementing a phase, read:

- `docs/phases/PHASE_XX_<NAME>.md` - Detailed phase instructions
- Any referenced specification documents (WEB_APP_SPECS.md, etc.)

**Service-Specific Reading:**
If working on a specific service:

- `services/api-gateway/README.md` - Canonical backend service guide
- `apps/web-app/README.md` - Web app implementation
- `apps/admin-panel/README.md` - Admin panel implementation

**Security/Compliance Work:**

- `docs/SECURITY_COMPLIANCE.md` - HIPAA requirements
- `docs/SEMANTIC_SEARCH_DESIGN.md` - PHI detection and routing

### 1.3 Identify Your Work Scope

Determine and document:

**What am I working on?**

- Which phase (0-15 project phases, or 0-8 web app phases)?
- Which service or component?
- Which files will I modify?

**Dependencies:**

- Do other services need to be running?
- Are there prerequisites from previous phases?
- Do I need test data or fixtures?

**Success Criteria:**

- What does "done" look like?
- What tests must pass?
- What documentation needs updating?

**Example Session Checklist:**

```markdown
Session: Phase 5 - Medical Knowledge Base & RAG System

- [x] Read DEVELOPMENT_PHASES_V2.md
- [x] Read PHASE_05_MEDICAL_AI.md
- [x] Read SEMANTIC_SEARCH_DESIGN.md
- [x] Verified Phase 4 is complete (documents indexed)
- [x] Confirmed Qdrant is running
- [ ] Implement RAG service
- [ ] Add PubMed integration
- [ ] Write tests
- [ ] Update documentation
```

---

## Branch and Commit Strategy

### Branch Naming Conventions

Follow these patterns for branch names:

**Phase Implementation:**

```
phase-N-short-name
```

Examples:

- `phase-1-infrastructure`
- `phase-4-voice-pipeline`
- `phase-11-web-app-ui`

**Feature Work:**

```
feature/area-description
```

Examples:

- `feature/web-chat-layout`
- `feature/admin-kb-upload`
- `feature/voice-vad-integration`

**Bug Fixes:**

```
fix/issue-description
```

Examples:

- `fix/kb-search-timeout`
- `fix/nextcloud-auth-loop`
- `fix/voice-echo-cancellation`

**Documentation Updates:**

```
docs/description
```

Examples:

- `docs/api-contracts`
- `docs/service-catalog`
- `docs/deployment-guide`

**Infrastructure/Deployment:**

```
infra/description
```

Examples:

- `infra/docker-compose-optimization`
- `infra/k8s-manifests`
- `infra/prometheus-dashboards`

### When to Branch vs Commit to Main

**Create a Branch:**

- Phase implementations (significant work, 4-8 hours)
- New features or significant refactoring
- Experimental work or architecture changes
- Work that requires multiple commits
- When multiple parallel sessions are active

**Commit Directly to Main:**

- Documentation-only updates (no code changes)
- Trivial fixes (typos, formatting)
- Emergency hotfixes (with thorough testing)
- When you're the only active session

**Branch Workflow:**

```bash
# Create and switch to new branch
git checkout -b phase-5-medical-ai

# Make changes, commit frequently
git add .
git commit -m "feat(medical-kb): implement RAG service"

# Push to remote
git push -u origin phase-5-medical-ai

# When complete, merge to main
git checkout main
git merge phase-5-medical-ai
git push origin main

# Delete branch (optional)
git branch -d phase-5-medical-ai
```

### Commit Message Format

Use conventional commits format:

```
<type>(<scope>): <description>

[optional body]

[optional footer]
```

**Types:**

- `feat` - New feature
- `fix` - Bug fix
- `docs` - Documentation only
- `test` - Adding or updating tests
- `refactor` - Code refactoring (no functional changes)
- `perf` - Performance improvements
- `chore` - Build process, dependencies, tooling
- `style` - Code style (formatting, semicolons, etc.)

**Scopes:**

- Service names: `voice-proxy`, `medical-kb`, `auth-service`, `admin-api`
- Component names: `web-app`, `admin-panel`, `docs-site`
- Phase numbers: `phase-1`, `phase-5`, `phase-11`
- Areas: `api`, `database`, `docker`, `k8s`

**Examples:**

```bash
# Phase implementation
git commit -m "feat(phase-4): implement voice pipeline with VAD and echo cancellation"

# Service feature
git commit -m "feat(medical-kb): add PubMed API integration"

# Bug fix
git commit -m "fix(voice-proxy): resolve WebSocket connection timeout"

# Documentation
git commit -m "docs(phase-2): update database schema documentation"

# Refactoring
git commit -m "refactor(medical-kb): extract RAG logic into separate module"

# Multiple changes (use body)
git commit -m "feat(auth-service): add MFA support

- Implement TOTP generation and validation
- Add MFA setup endpoints
- Update user model with mfa_secret field
- Add tests for MFA flow"
```

**Long Commit Messages (with heredoc):**

```bash
git commit -m "$(cat <<'EOF'
feat(phase-11): implement web app UI with clinical workflows

Implemented components:
- Quick Consult mode with voice input
- Case Workspace with patient context panel
- Citation display with AMA format
- Safety warnings and disclaimers

Tests:
- Unit tests for all components
- E2E test for quick consult flow

Documentation:
- Updated WEB_APP_SPECS.md
- Added component documentation
EOF
)"
```

---

## Parallel Session Safety Rules

When multiple Claude Code sessions (or developers) are working simultaneously, follow these rules to avoid conflicts and data loss.

### 3.1 Service/Phase Ownership

**Golden Rule:** Only ONE session should modify a given service or phase at a time.

**Before starting work:**

1. Check active branches: `git branch -a`
2. Look for branch names indicating work in your area
3. If conflict, coordinate or work on different area

**Communication:**

- Use branch names to signal your work area
- If uncertain, create a placeholder branch: `git checkout -b phase-5-in-progress`

**Example:**

```bash
# Check what's being worked on
git branch -a
# Output:
#   main
#   phase-4-voice-pipeline  <- Someone working on Phase 4
#   feature/admin-kb-upload <- Someone working on admin panel
# * phase-5-medical-ai     <- You are here (safe to work on Phase 5)
```

### 3.2 Avoiding Conflicts

**High-Risk Shared Files:**

- `docker-compose.yml` - Coordinate changes carefully
- `.env` files - Don't commit, document changes
- `alembic/versions/*.py` - Database migrations (coordinate)
- Root-level config files (`pyproject.toml`, `package.json`)

**Safe Practices:**

- Work in separate services when possible
- Each service has its own directory (low conflict)
- Frontend and backend can be worked on in parallel
- Tests and docs can be updated independently

**If you MUST modify shared files:**

1. Pull latest changes first: `git pull origin main`
2. Make minimal, focused changes
3. Commit and push quickly
4. Notify other sessions

**Conflict Resolution:**

```bash
# If you encounter merge conflicts
git pull origin main
# Fix conflicts in editor
git add <resolved-files>
git commit -m "merge: resolve conflicts from main"
```

### 3.3 Testing Boundaries

**Isolated Testing:**

- Test your service in isolation when possible
- Use mocks/stubs for dependencies being worked on
- Don't rely on services under active development

**Docker Compose Testing:**

```bash
# Test only your service
docker compose up your-service postgres redis qdrant

# Don't start services being modified by others
docker compose up --scale other-service=0
```

**Integration Testing:**

- Run full integration tests AFTER merging
- Not during parallel development
- Coordinate timing with other sessions

---

## Quality Checks Before Committing

Run ALL applicable checks before committing code. These checks prevent regressions and maintain code quality.

### Backend (Python/FastAPI)

**Run from `services/api-gateway/` directory:**

```bash
# Activate virtual environment
source .venv/bin/activate

# 1. Run all tests
pytest tests/ -v

# 2. Run tests with coverage
pytest tests/ --cov=app --cov-report=term-missing

# 3. Format code with black
black app/ tests/

# 4. Check formatting (don't auto-fix)
black app/ tests/ --check

# 5. Lint with flake8
flake8 app/ tests/

# 6. Type checking with mypy
mypy app/

# 7. Security check (optional)
bandit -r app/
```

**Fix Common Issues:**

- Import errors: `isort app/ tests/`
- Long lines: Refactor or add `# noqa` comment
- Type errors: Add type hints or `# type: ignore`

**All checks must pass:**

```bash
# Run all checks in sequence
pytest tests/ && black app/ tests/ --check && flake8 app/ && mypy app/
```

### Frontend (Vite/React)

**Run from `apps/web-app/` or `apps/admin-panel/` directory:**

```bash
# 1. Run all tests
pnpm test

# 2. Run tests in watch mode (during development)
pnpm test:watch

# 3. Type checking
pnpm type-check

# 4. Linting
pnpm lint

# 5. Lint and auto-fix
pnpm lint --fix

# 6. Build check (ensures no build errors)
pnpm build
```

**Fix Common Issues:**

- ESLint errors: `pnpm lint --fix`
- Type errors: Fix TypeScript types
- Build errors: Check imports and dependencies

**All checks must pass:**

```bash
# Run all checks in sequence
pnpm test && pnpm type-check && pnpm lint && pnpm build
```

### Docker Compose Validation

**Always validate Docker Compose files:**

```bash
# 1. Validate syntax
docker compose config

# 2. Validate and view merged config
docker compose config > /tmp/compose-merged.yml
cat /tmp/compose-merged.yml

# 3. Start services and verify
docker compose up -d

# 4. Check all services are healthy
docker compose ps

# 5. Check logs for errors
docker compose logs --tail=50
```

**Expected Output:**

```
NAME                  STATUS    PORTS
postgres              Up        5432/tcp
redis                 Up        6379/tcp
qdrant                Up        6333/tcp
voice-proxy           Up        8001/tcp
medical-kb            Up        8002/tcp
```

### Documentation Quality Checks

**Before committing documentation:**

1. **Check all links work:**

```bash
# Use markdown-link-check (install if needed)
npm install -g markdown-link-check
markdown-link-check docs/**/*.md
```

2. **Verify code examples are valid:**

- Python: Copy code to temp file, run `python -m py_compile`
- TypeScript: Copy code to temp file, run `tsc --noEmit`
- Bash: Copy to temp file, run `bash -n` (syntax check)

3. **Check formatting consistency:**

- Headers use ATX style (`#` not underlines)
- Code blocks specify language
- Lists use consistent markers (`-` not `*`)
- Proper spacing (blank line before/after headers, lists, code blocks)

4. **Spell check (manual or tool):**

```bash
# Use aspell or similar
aspell check docs/YOUR_FILE.md
```

---

## Phase Completion Criteria

**DO NOT** mark a phase as complete until ALL criteria are met. Incomplete phases cause cascading issues in later phases.

### Exit Checklist for Every Phase

- [ ] **All tasks completed:** Every task in phase document is done
- [ ] **Tests pass:** All unit, integration, and E2E tests pass
- [ ] **Services start without errors:** `docker compose up -d` succeeds
- [ ] **Health checks pass:** All services return 200 on `/health`
- [ ] **No errors in logs:** Check logs for exceptions, warnings
- [ ] **Documentation updated:** All relevant docs reflect changes
- [ ] **Code quality checks pass:** Linting, type checking, formatting
- [ ] **Manual verification:** Test the feature manually
- [ ] **Dependencies verified:** Next phase prerequisites are met
- [ ] **CURRENT_PHASE.md updated:** Status, notes, next steps documented

### Verification Commands

**Run this command block before marking phase complete:**

```bash
# 1. All tests pass
cd services/api-gateway && pytest tests/
cd ../../apps/web-app && pnpm test
cd ../admin-panel && pnpm test

# 2. Code quality
cd ../../services/api-gateway && black . --check && flake8 . && mypy app/
cd ../../apps/web-app && pnpm lint && pnpm type-check
cd ../admin-panel && pnpm lint && pnpm type-check

# 3. Docker Compose
cd ..
docker compose config
docker compose up -d
docker compose ps  # All should be "Up"
docker compose logs --tail=100 | grep -i error  # Should be empty or expected

# 4. Health checks
curl http://localhost:8000/health  # API Gateway
curl http://localhost:8001/health  # Voice Proxy
curl http://localhost:8002/health  # Medical KB
# ... (all services)

# 5. Documentation
markdown-link-check docs/**/*.md
```

**If ANY check fails, do NOT mark phase complete.**

### Phase-Specific Criteria

**Phase 0 (Initialization):**

- [ ] All spec documents read and understood
- [ ] Architecture diagram reviewed
- [ ] Questions documented

**Phase 1 (Infrastructure):**

- [ ] PostgreSQL accessible and accepting connections
- [ ] Redis accessible and responding to PING
- [ ] Qdrant accessible and collection created
- [ ] All databases persist data after restart

**Phase 5 (Medical KB & RAG):**

- [ ] Can embed and search documents
- [ ] RAG pipeline returns relevant results
- [ ] PubMed API integration works
- [ ] Citations are properly formatted

**Phase 11 (Web App UI):**

- [ ] All workflows (Quick Consult, Case Workspace) functional
- [ ] Voice input working
- [ ] Citations display correctly
- [ ] No console errors in browser

**Phase 14 (Production Deployment):**

- [ ] All services running on production server
- [ ] SSL certificates valid
- [ ] Monitoring and alerts configured
- [ ] Backups scheduled and tested
- [ ] Load testing completed

---

## Working with Documentation

### Documentation-First Approach

**Before implementing:**

1. Read existing docs to understand design
2. Note any gaps or ambiguities
3. Plan implementation based on specs

**During implementation:**

- Update docs as you discover clarifications
- Add inline code comments for complex logic
- Document any deviations from original spec

**After implementation:**

- Update all affected documentation
- Add examples and usage instructions
- Document configuration and environment variables

### Documentation Standards

**File Naming:**

- Use UPPERCASE for major docs: `ARCHITECTURE_V2.md`
- Use lowercase for code docs: `server/README.md`
- Use underscores for multi-word: `WEB_APP_SPECS.md`

**Structure:**

- Always include Table of Contents for docs >200 lines
- Use consistent heading levels (don't skip levels)
- Include "Last Updated" date at bottom

**Code Examples:**

- Always specify language for syntax highlighting
- Include imports/context needed to run example
- Test that examples actually work

**Links:**

- Use relative links within repo: `[link](../docs/FILE.md)`
- Use absolute URLs for external links
- Don't link to specific line numbers (they change)

---

## Troubleshooting Common Issues

### "Tests are failing"

1. Check if tests were failing before your changes: `git stash && pytest`
2. If yes, fix tests first, then implement
3. If no, debug your changes

### "Docker Compose won't start"

1. Check syntax: `docker compose config`
2. Check logs: `docker compose logs <service>`
3. Check ports: `lsof -i :<port>` (ensure not in use)
4. Reset: `docker compose down -v && docker compose up -d`

### "Service not accessible"

1. Verify service is running: `docker compose ps`
2. Check health endpoint: `curl http://localhost:<port>/health`
3. Check logs: `docker compose logs <service> --tail=100`
4. Verify networking: Services should be on same Docker network

### "Merge conflicts"

1. Pull latest: `git pull origin main`
2. Resolve conflicts in editor
3. Run tests to ensure resolution is correct
4. Commit: `git commit -m "merge: resolve conflicts"`

### "Phase seems complete but something's not working"

- Go through exit checklist systematically
- Don't skip manual verification
- Check logs for warnings (not just errors)
- Test with fresh data/state

---

## Best Practices Summary

1. **Always read docs first** - Don't skip `docs/START_HERE.md`
2. **Run tests frequently** - Not just at the end
3. **Commit often** - Small, focused commits are better
4. **Document as you go** - Don't leave it for later
5. **Test manually** - Automated tests don't catch everything
6. **Use meaningful commit messages** - Future you will thank you
7. **Coordinate on shared files** - Especially `docker-compose.yml`
8. **Don't mark phases complete prematurely** - Verify ALL criteria
9. **Keep branches short-lived** - Merge within 1-2 days
10. **When in doubt, ask** - Better to clarify than assume

---

## Related Documentation

- [CLAUDE_PROMPTS.md](CLAUDE_PROMPTS.md) - Ready-to-use prompts for common tasks
- [Implementation Status](overview/IMPLEMENTATION_STATUS.md) - **Source of truth** for component status
- [START_HERE.md](START_HERE.md) - Project orientation
- [UNIFIED_ARCHITECTURE.md](UNIFIED_ARCHITECTURE.md) - System architecture
- [Agent Onboarding](ai/AGENT_ONBOARDING.md) - AI assistant quick start
- [Agent API Reference](ai/AGENT_API_REFERENCE.md) - Machine-readable endpoints

**Note**: Always reconcile any conflicting statements in other docs against `docs/overview/IMPLEMENTATION_STATUS.md` and the actual code.

---

**Last Updated**: 2025-11-27
**Version**: V2.1
