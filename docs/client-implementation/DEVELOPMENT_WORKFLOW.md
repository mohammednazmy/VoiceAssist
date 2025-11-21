# VoiceAssist Development Workflow Guide

**Version:** 1.0.0
**Date:** 2025-11-21
**Status:** Production Ready
**Project:** VoiceAssist Enterprise Medical AI Assistant

---

## Table of Contents

1. [Git Workflow & Branching Strategy](#1-git-workflow--branching-strategy)
2. [Code Review Process](#2-code-review-process)
3. [Testing Requirements](#3-testing-requirements)
4. [CI/CD Pipelines](#4-cicd-pipelines)
5. [Deployment Procedures](#5-deployment-procedures)
6. [Documentation Standards](#6-documentation-standards)
7. [Code Style Guide](#7-code-style-guide)
8. [Performance Guidelines](#8-performance-guidelines)
9. [Security Guidelines](#9-security-guidelines)
10. [Troubleshooting](#10-troubleshooting)

---

## 1. Git Workflow & Branching Strategy

### 1.1 Branch Naming Conventions

All branches must follow a strict naming convention to ensure clarity and automated tooling compatibility.

#### Format

```
<type>/<ticket-id>-<short-description>
```

#### Branch Types

| Type | Purpose | Example |
|------|---------|---------|
| `feature/` | New features or enhancements | `feature/VA-123-voice-mode-ui` |
| `bugfix/` | Bug fixes | `bugfix/VA-456-auth-token-refresh` |
| `hotfix/` | Critical production fixes | `hotfix/VA-789-security-patch` |
| `refactor/` | Code refactoring (no behavior change) | `refactor/VA-234-chat-state-management` |
| `docs/` | Documentation only | `docs/VA-567-api-guide-update` |
| `test/` | Test additions or fixes | `test/VA-890-e2e-voice-tests` |
| `chore/` | Build, dependencies, tooling | `chore/VA-345-update-dependencies` |
| `release/` | Release preparation | `release/v1.2.0` |

#### Examples

```bash
# Good
feature/VA-123-add-dark-mode-toggle
bugfix/VA-456-fix-websocket-reconnection
hotfix/VA-789-patch-xss-vulnerability
refactor/VA-234-extract-chat-hooks

# Bad (avoid)
john-new-feature
fix-bug
update
feature-123
```

#### Protected Branches

| Branch | Purpose | Merge Requirements |
|--------|---------|-------------------|
| `main` | Production-ready code | • 2+ approvals<br>• All CI checks pass<br>• No merge commits<br>• Squash merge only |
| `develop` | Integration branch | • 1+ approval<br>• All CI checks pass<br>• Merge commit allowed |
| `staging` | Pre-production testing | • 1+ approval<br>• All CI checks pass |

### 1.2 Commit Message Format

We follow **Conventional Commits** specification for automated changelog generation and semantic versioning.

#### Format

```
<type>(<scope>): <subject>

[optional body]

[optional footer(s)]
```

#### Types

| Type | Purpose | Changelog Section | Semver Impact |
|------|---------|-------------------|---------------|
| `feat` | New feature | Features | MINOR |
| `fix` | Bug fix | Bug Fixes | PATCH |
| `docs` | Documentation only | Documentation | - |
| `style` | Code style (formatting, missing semicolons) | - | - |
| `refactor` | Code change (no feature/fix) | - | - |
| `perf` | Performance improvement | Performance | PATCH |
| `test` | Adding/updating tests | - | - |
| `build` | Build system changes | - | - |
| `ci` | CI configuration changes | - | - |
| `chore` | Other changes | - | - |
| `revert` | Revert previous commit | - | - |

#### Scope Examples

**Web App:**
- `auth` - Authentication/authorization
- `chat` - Chat interface
- `voice` - Voice mode
- `ui` - UI components
- `api` - API integration
- `state` - State management

**Admin Panel:**
- `dashboard` - Dashboard features
- `kb` - Knowledge base management
- `users` - User management
- `analytics` - Analytics features

**Shared:**
- `deps` - Dependencies
- `config` - Configuration
- `types` - TypeScript types

#### Commit Message Examples

```bash
# Feature addition (MINOR version bump)
feat(chat): add message reaction functionality

Implement emoji reactions to chat messages with real-time
updates via WebSocket. Users can add multiple reactions per
message.

Closes VA-123

# Bug fix (PATCH version bump)
fix(auth): resolve token refresh race condition

Fixed issue where multiple simultaneous requests could trigger
concurrent token refresh attempts, causing authentication errors.

Added mutex lock to ensure single refresh process.

Fixes VA-456

# Breaking change (MAJOR version bump)
feat(api)!: migrate to v2 authentication endpoints

BREAKING CHANGE: Auth endpoints moved from /auth/* to /api/v2/auth/*
Clients must update API base URLs.

Migration guide: docs/MIGRATION_V2.md

Refs VA-789

# Performance improvement (PATCH version bump)
perf(voice): optimize audio buffer processing

Reduced audio processing latency by 40% through worker thread
implementation and buffer pooling.

Closes VA-234

# Documentation update (no version bump)
docs(readme): update installation instructions

Added troubleshooting section for common npm/pnpm issues.

# Revert commit
revert: feat(chat): add message reaction functionality

This reverts commit abc123def456.

Reason: Performance regression in real-time updates.
```

#### Commit Message Rules

1. **Subject line:**
   - Use imperative mood ("add" not "added" or "adds")
   - No period at the end
   - Maximum 72 characters
   - Lowercase after type

2. **Body:**
   - Wrap at 72 characters
   - Explain *what* and *why*, not *how*
   - Separate from subject with blank line

3. **Footer:**
   - Reference issues: `Closes VA-123`, `Fixes VA-456`, `Refs VA-789`
   - Breaking changes: Start with `BREAKING CHANGE:`
   - Co-authors: `Co-authored-by: Name <email@example.com>`

#### Commit Message Template

Create `.gitmessage` in repository root:

```bash
# <type>(<scope>): <subject>
# |<----  Using a Maximum Of 72 Characters  ---->|

# [optional body]
# |<----   Try To Limit Each Line to a Maximum Of 72 Characters   ---->|

# [optional footer(s)]
# --- COMMIT END ---
# Type can be:
#   feat     (new feature)
#   fix      (bug fix)
#   docs     (documentation)
#   style    (formatting)
#   refactor (refactoring)
#   perf     (performance)
#   test     (testing)
#   build    (build system)
#   ci       (CI config)
#   chore    (other)
#   revert   (revert commit)
# --------------------
# Remember:
#   • Use imperative mood ("add" not "added")
#   • No period at end of subject
#   • Reference issues (Closes VA-123)
#   • Breaking changes: BREAKING CHANGE: description
# --------------------
```

Configure git to use template:

```bash
git config commit.template .gitmessage
```

### 1.3 Pull Request (PR) Template

#### GitHub PR Template

Create `.github/PULL_REQUEST_TEMPLATE.md`:

```markdown
## Description

<!-- Provide a brief description of the changes -->

## Type of Change

<!-- Mark relevant items with [x] -->

- [ ] 🚀 Feature (new functionality)
- [ ] 🐛 Bug fix (fixes an issue)
- [ ] 🔒 Security fix
- [ ] ⚡ Performance improvement
- [ ] ♻️ Refactor (no functional changes)
- [ ] 📝 Documentation update
- [ ] 🧪 Test addition/update
- [ ] 🔧 Configuration/infrastructure change
- [ ] 💥 Breaking change

## Related Issues

<!-- Link related issues -->

Closes #
Fixes #
Refs #

## Changes Made

<!-- List key changes -->

-
-
-

## Screenshots/Videos

<!-- If applicable, add screenshots or videos -->

## Testing

<!-- Describe testing performed -->

### Manual Testing

- [ ] Tested in local development environment
- [ ] Tested in staging environment
- [ ] Tested on Chrome
- [ ] Tested on Firefox
- [ ] Tested on Safari
- [ ] Tested on mobile devices
- [ ] Tested with screen reader (accessibility)

### Automated Testing

- [ ] Unit tests added/updated
- [ ] Integration tests added/updated
- [ ] E2E tests added/updated
- [ ] All tests passing locally
- [ ] Test coverage maintained/improved

## Performance Impact

<!-- Check all that apply -->

- [ ] No performance impact
- [ ] Performance improved (describe below)
- [ ] Performance degraded (describe below and justify)

<!-- If performance changed, provide metrics -->

## Security Considerations

<!-- Check all that apply -->

- [ ] No security impact
- [ ] Reviewed for XSS vulnerabilities
- [ ] Reviewed for CSRF vulnerabilities
- [ ] Reviewed for SQL injection
- [ ] Input validation added/reviewed
- [ ] Authentication/authorization checked
- [ ] Sensitive data handling reviewed
- [ ] HIPAA compliance maintained

## Breaking Changes

<!-- If breaking change, describe migration path -->

## Deployment Notes

<!-- Special deployment instructions, if any -->

## Checklist

- [ ] Code follows project style guidelines
- [ ] Self-review completed
- [ ] Comments added for complex logic
- [ ] Documentation updated
- [ ] No new warnings generated
- [ ] Tests added and passing
- [ ] Dependent changes merged
- [ ] Accessibility tested
- [ ] i18n keys added if needed

## Reviewer Notes

<!-- Anything specific for reviewers to focus on -->

## Post-Merge Actions

<!-- Actions required after merge -->

- [ ] Update related documentation
- [ ] Notify stakeholders
- [ ] Monitor error rates
- [ ] Update changelog
```

### 1.4 Merge Strategies

#### Squash Merge (Recommended for most PRs)

Use for feature branches to keep main branch history clean.

```bash
# Via GitHub UI
# Select "Squash and merge"

# Or via command line
git checkout main
git merge --squash feature/VA-123-new-feature
git commit -m "feat(feature): add new feature (#123)"
```

**When to use:**
- Feature branches with many commits
- Bug fix branches
- Work-in-progress branches with messy history

**Benefits:**
- Clean, linear history on main
- Easy to revert entire features
- Better changelog generation

#### Merge Commit

Use for release branches or important milestone merges.

```bash
git checkout main
git merge --no-ff release/v1.2.0
```

**When to use:**
- Release branches
- Hotfix branches (to preserve urgency context)
- Large feature integrations from develop

#### Rebase and Merge

Use rarely, only for very clean, well-structured commits.

```bash
git checkout feature/VA-123-new-feature
git rebase main
git checkout main
git merge --ff-only feature/VA-123-new-feature
```

**When to use:**
- Small, atomic changes
- Commits already well-structured
- Documentation updates

### 1.5 Git Hooks

We use **Husky** for git hooks to enforce quality standards.

#### Installation

```bash
# Install Husky
pnpm add -D husky

# Initialize Husky
pnpm exec husky install

# Add to package.json
{
  "scripts": {
    "prepare": "husky install"
  }
}
```

#### Pre-commit Hook

`.husky/pre-commit`:

```bash
#!/usr/bin/env sh
. "$(dirname -- "$0")/_/husky.sh"

# Run lint-staged for changed files only
pnpm exec lint-staged

# Run type checking
pnpm run type-check

# Check for console.log statements (warn only)
if git diff --cached --name-only --diff-filter=ACM | grep -E '\.(ts|tsx|js|jsx)$' | xargs grep -n "console\.log" 2>/dev/null; then
  echo "⚠️  Warning: Found console.log statements. Please remove before committing to main."
fi

# Check for debugger statements (error)
if git diff --cached --name-only --diff-filter=ACM | grep -E '\.(ts|tsx|js|jsx)$' | xargs grep -n "debugger" 2>/dev/null; then
  echo "❌ Error: Found debugger statements. Please remove."
  exit 1
fi

# Check for .only in tests (error)
if git diff --cached --name-only --diff-filter=ACM | grep -E '\.test\.(ts|tsx|js|jsx)$' | xargs grep -n "\.only" 2>/dev/null; then
  echo "❌ Error: Found .only in tests. Remove before committing."
  exit 1
fi
```

#### Commit-msg Hook

`.husky/commit-msg`:

```bash
#!/usr/bin/env sh
. "$(dirname -- "$0")/_/husky.sh"

# Validate commit message format
pnpm exec commitlint --edit "$1"
```

#### Pre-push Hook

`.husky/pre-push`:

```bash
#!/usr/bin/env sh
. "$(dirname -- "$0")/_/husky.sh"

# Run all tests before push
echo "🧪 Running tests before push..."
pnpm run test

# Check if pushing to protected branches
current_branch=$(git symbolic-ref HEAD | sed -e 's,.*/\(.*\),\1,')
protected_branches=("main" "develop" "staging")

for branch in "${protected_branches[@]}"; do
  if [ "$current_branch" = "$branch" ]; then
    echo "❌ Error: Direct push to $branch is not allowed."
    echo "Please create a pull request instead."
    exit 1
  fi
done
```

#### Lint-staged Configuration

`package.json`:

```json
{
  "lint-staged": {
    "*.{ts,tsx}": [
      "eslint --fix",
      "prettier --write"
    ],
    "*.{js,jsx}": [
      "eslint --fix",
      "prettier --write"
    ],
    "*.{json,md,yml,yaml}": [
      "prettier --write"
    ],
    "*.{css,scss}": [
      "prettier --write"
    ]
  }
}
```

#### Commitlint Configuration

`commitlint.config.js`:

```javascript
module.exports = {
  extends: ['@commitlint/config-conventional'],
  rules: {
    'type-enum': [
      2,
      'always',
      [
        'feat',
        'fix',
        'docs',
        'style',
        'refactor',
        'perf',
        'test',
        'build',
        'ci',
        'chore',
        'revert'
      ]
    ],
    'type-case': [2, 'always', 'lower-case'],
    'type-empty': [2, 'never'],
    'scope-case': [2, 'always', 'lower-case'],
    'subject-empty': [2, 'never'],
    'subject-full-stop': [2, 'never', '.'],
    'subject-case': [2, 'always', 'lower-case'],
    'header-max-length': [2, 'always', 72],
    'body-leading-blank': [2, 'always'],
    'body-max-line-length': [2, 'always', 100],
    'footer-leading-blank': [2, 'always'],
    'footer-max-line-length': [2, 'always', 100]
  }
};
```

### 1.6 Git Workflow Example

#### Complete Feature Development Workflow

```bash
# 1. Ensure main branch is up to date
git checkout main
git pull origin main

# 2. Create feature branch
git checkout -b feature/VA-123-add-voice-controls

# 3. Make changes and commit regularly
git add src/components/VoiceControls.tsx
git commit -m "feat(voice): add voice control component"

git add src/components/VoiceControls.test.tsx
git commit -m "test(voice): add tests for voice controls"

# 4. Keep branch updated with main
git fetch origin
git rebase origin/main

# 5. Push to remote
git push origin feature/VA-123-add-voice-controls

# 6. Create Pull Request via GitHub UI

# 7. Address review feedback
git add src/components/VoiceControls.tsx
git commit -m "refactor(voice): address PR feedback"
git push origin feature/VA-123-add-voice-controls

# 8. After approval, squash and merge via GitHub UI

# 9. Clean up local branches
git checkout main
git pull origin main
git branch -d feature/VA-123-add-voice-controls
```

#### Hotfix Workflow

```bash
# 1. Create hotfix branch from main
git checkout main
git pull origin main
git checkout -b hotfix/VA-789-security-patch

# 2. Make urgent fix
git add src/utils/sanitize.ts
git commit -m "fix(security): patch XSS vulnerability"

# 3. Push and create PR
git push origin hotfix/VA-789-security-patch

# 4. After approval, merge without squashing (preserve context)
# Use merge commit via GitHub UI

# 5. Tag the release
git checkout main
git pull origin main
git tag -a v1.2.1 -m "Security patch release"
git push origin v1.2.1
```

---

## 2. Code Review Process

### 2.1 Review Checklist

#### Reviewer Checklist Template

Use this checklist for every code review:

```markdown
## Code Review Checklist

### Functionality
- [ ] Code does what the PR description says
- [ ] Edge cases handled appropriately
- [ ] Error handling is comprehensive
- [ ] User experience is intuitive
- [ ] Accessibility requirements met (WCAG 2.1 AA)

### Code Quality
- [ ] Code is readable and maintainable
- [ ] No unnecessary complexity
- [ ] Functions are small and focused (< 50 lines)
- [ ] No code duplication (DRY principle)
- [ ] Naming is clear and consistent
- [ ] Comments explain "why", not "what"
- [ ] No commented-out code

### TypeScript/JavaScript
- [ ] Proper TypeScript types (no `any`)
- [ ] Type safety maintained
- [ ] Async/await used correctly
- [ ] Promise errors handled
- [ ] No memory leaks (event listeners cleaned up)
- [ ] No console.log or debugger statements

### React Best Practices
- [ ] Components are properly modularized
- [ ] Hooks used correctly (dependencies array)
- [ ] No unnecessary re-renders
- [ ] Props are properly typed
- [ ] State management is appropriate
- [ ] Side effects properly handled (useEffect)
- [ ] Keys used correctly in lists

### Performance
- [ ] No performance regressions
- [ ] Expensive operations memoized
- [ ] Images optimized
- [ ] Lazy loading implemented where appropriate
- [ ] Bundle size impact acceptable

### Testing
- [ ] Unit tests added for new functions
- [ ] Integration tests added for new features
- [ ] Edge cases tested
- [ ] Error scenarios tested
- [ ] Test coverage maintained (80%+)
- [ ] Tests are deterministic (no flaky tests)

### Security
- [ ] Input validation implemented
- [ ] XSS vulnerabilities addressed
- [ ] CSRF protection in place
- [ ] Authentication/authorization correct
- [ ] No sensitive data in logs
- [ ] Dependencies have no known vulnerabilities
- [ ] HIPAA compliance maintained

### API Integration
- [ ] API calls properly typed
- [ ] Loading states handled
- [ ] Error states handled
- [ ] Retry logic implemented
- [ ] Rate limiting respected
- [ ] Timeouts configured

### UI/UX
- [ ] Responsive design works on all breakpoints
- [ ] Loading indicators shown
- [ ] Error messages are user-friendly
- [ ] Forms have proper validation
- [ ] Keyboard navigation works
- [ ] Focus management correct
- [ ] Color contrast meets WCAG standards

### Documentation
- [ ] README updated if needed
- [ ] API documentation updated
- [ ] Comments added for complex logic
- [ ] Migration guide provided (if breaking change)
- [ ] Changelog updated

### Git/Process
- [ ] Branch name follows conventions
- [ ] Commit messages follow conventions
- [ ] PR description is clear
- [ ] All CI checks pass
- [ ] No merge conflicts
- [ ] Changes are atomic (focused on one thing)
```

### 2.2 Review Process

#### Step-by-Step Review Process

**For Reviewers:**

1. **Initial Assessment (5 minutes)**
   ```bash
   # Check out the PR branch
   gh pr checkout 123

   # Review the PR description and changes
   # Verify CI checks are passing
   ```

2. **Code Review (30-60 minutes)**
   - Read through all changes systematically
   - Use the review checklist above
   - Test locally if needed
   - Add inline comments for specific issues
   - Suggest improvements with code examples

3. **Testing (15-30 minutes)**
   ```bash
   # Install dependencies
   pnpm install

   # Run tests
   pnpm test

   # Start dev server and test manually
   pnpm dev

   # Check for console errors or warnings
   ```

4. **Submit Review**
   - **Approve**: All checks pass, no issues found
   - **Request Changes**: Issues that must be fixed
   - **Comment**: Suggestions or questions, no blocking issues

**For PR Authors:**

1. **Before Requesting Review**
   ```bash
   # Self-review your changes
   git diff origin/main...HEAD

   # Run all checks locally
   pnpm run lint
   pnpm run type-check
   pnpm test

   # Ensure PR description is complete
   ```

2. **Respond to Feedback**
   - Address all comments (even if you disagree)
   - Ask for clarification if needed
   - Mark conversations as resolved after fixing
   - Thank reviewers for their time

3. **After Approval**
   - Squash and merge
   - Delete the branch
   - Close related issues

### 2.3 Approval Requirements

#### Required Approvals by Branch

| Target Branch | Required Approvals | Who Can Approve |
|---------------|-------------------|-----------------|
| `main` | 2 | Senior developers, tech lead |
| `develop` | 1 | Any developer |
| `staging` | 1 | Any developer |
| Feature branches | 0 | Optional review |

#### Exception Process

For urgent hotfixes:

1. Create hotfix PR
2. Tag with `urgent` label
3. Request expedited review in Slack
4. Single approval from tech lead sufficient
5. Must include post-deployment verification plan

### 2.4 Common Feedback Patterns

#### Code Smells to Watch For

**1. Large Components**

```tsx
// ❌ Bad: Component too large (200+ lines)
function UserDashboard() {
  // 200+ lines of logic and JSX
}

// ✅ Good: Split into smaller components
function UserDashboard() {
  return (
    <div>
      <UserHeader />
      <UserStats />
      <UserActivity />
      <UserSettings />
    </div>
  );
}
```

**2. Missing Error Handling**

```tsx
// ❌ Bad: Unhandled promise rejection
async function fetchUserData(userId: string) {
  const response = await fetch(`/api/users/${userId}`);
  return response.json();
}

// ✅ Good: Proper error handling
async function fetchUserData(userId: string): Promise<User> {
  try {
    const response = await fetch(`/api/users/${userId}`);

    if (!response.ok) {
      throw new Error(`HTTP ${response.status}: ${response.statusText}`);
    }

    return await response.json();
  } catch (error) {
    console.error('Failed to fetch user data:', error);
    throw new UserFetchError('Unable to load user data', { cause: error });
  }
}
```

**3. Prop Drilling**

```tsx
// ❌ Bad: Prop drilling through multiple levels
function App() {
  const [user, setUser] = useState<User | null>(null);
  return <Layout user={user} setUser={setUser} />;
}

function Layout({ user, setUser }: Props) {
  return <Sidebar user={user} setUser={setUser} />;
}

function Sidebar({ user, setUser }: Props) {
  return <UserMenu user={user} setUser={setUser} />;
}

// ✅ Good: Use context or state management
const UserContext = createContext<UserContextType | null>(null);

function App() {
  const [user, setUser] = useState<User | null>(null);
  return (
    <UserContext.Provider value={{ user, setUser }}>
      <Layout />
    </UserContext.Provider>
  );
}

function UserMenu() {
  const { user, setUser } = useUser(); // Custom hook
  // ...
}
```

**4. Missing TypeScript Types**

```tsx
// ❌ Bad: Using `any`
function processData(data: any) {
  return data.map((item: any) => item.value);
}

// ✅ Good: Proper typing
interface DataItem {
  id: string;
  value: number;
}

function processData(data: DataItem[]): number[] {
  return data.map(item => item.value);
}
```

**5. Inefficient Re-renders**

```tsx
// ❌ Bad: Creates new object on every render
function UserList() {
  const style = { color: 'blue' }; // New object each render
  return <div style={style}>...</div>;
}

// ✅ Good: Memoize or use constant
const STYLE = { color: 'blue' };

function UserList() {
  return <div style={STYLE}>...</div>;
}

// Or use useMemo for dynamic values
function UserList({ darkMode }: Props) {
  const style = useMemo(
    () => ({ color: darkMode ? 'white' : 'black' }),
    [darkMode]
  );
  return <div style={style}>...</div>;
}
```

### 2.5 Review Response Time Expectations

| PR Type | Expected Review Time | Maximum Time |
|---------|---------------------|--------------|
| Hotfix | 2 hours | 4 hours |
| Small bug fix (< 50 lines) | 4 hours | 24 hours |
| Feature (< 200 lines) | 24 hours | 48 hours |
| Large feature (200+ lines) | 48 hours | 72 hours |
| Documentation | 24 hours | 48 hours |

**If review is delayed:**
- Ping reviewer in Slack after expected time
- Escalate to tech lead after maximum time
- Consider splitting large PRs into smaller chunks

---

## 3. Testing Requirements

### 3.1 Testing Philosophy

**Test Pyramid:**

```
       /\
      /  \     E2E Tests (10%)
     /____\
    /      \
   /        \  Integration Tests (30%)
  /__________\
 /            \
/______________\ Unit Tests (60%)
```

**Coverage Requirements:**

- **Overall:** 80% minimum
- **New code:** 90% minimum
- **Critical paths:** 100% (auth, payments, PHI handling)
- **Utilities:** 95% minimum

### 3.2 Unit Testing

#### Unit Test Guidelines

**File Naming:**
- Test files: `ComponentName.test.tsx` or `functionName.test.ts`
- Test utilities: `test-utils.ts`
- Mocks: `__mocks__/moduleName.ts`

**Test Structure:**

```tsx
// src/components/Button.test.tsx
import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { Button } from './Button';

describe('Button', () => {
  describe('Rendering', () => {
    it('renders with correct text', () => {
      render(<Button>Click me</Button>);
      expect(screen.getByRole('button', { name: 'Click me' })).toBeInTheDocument();
    });

    it('renders with loading state', () => {
      render(<Button loading>Click me</Button>);
      expect(screen.getByRole('button')).toHaveAttribute('disabled');
      expect(screen.getByTestId('spinner')).toBeInTheDocument();
    });

    it('applies variant styles correctly', () => {
      const { rerender } = render(<Button variant="primary">Primary</Button>);
      expect(screen.getByRole('button')).toHaveClass('bg-blue-600');

      rerender(<Button variant="secondary">Secondary</Button>);
      expect(screen.getByRole('button')).toHaveClass('bg-gray-600');
    });
  });

  describe('Interactions', () => {
    it('calls onClick handler when clicked', () => {
      const handleClick = vi.fn();
      render(<Button onClick={handleClick}>Click me</Button>);

      fireEvent.click(screen.getByRole('button'));

      expect(handleClick).toHaveBeenCalledTimes(1);
    });

    it('does not call onClick when disabled', () => {
      const handleClick = vi.fn();
      render(<Button onClick={handleClick} disabled>Click me</Button>);

      fireEvent.click(screen.getByRole('button'));

      expect(handleClick).not.toHaveBeenCalled();
    });
  });

  describe('Accessibility', () => {
    it('has correct ARIA attributes', () => {
      render(<Button aria-label="Close dialog">×</Button>);
      expect(screen.getByLabelText('Close dialog')).toBeInTheDocument();
    });

    it('is keyboard accessible', () => {
      const handleClick = vi.fn();
      render(<Button onClick={handleClick}>Click me</Button>);

      const button = screen.getByRole('button');
      button.focus();

      expect(button).toHaveFocus();

      fireEvent.keyDown(button, { key: 'Enter' });
      expect(handleClick).toHaveBeenCalled();
    });
  });

  describe('Edge Cases', () => {
    it('handles rapid clicks gracefully', () => {
      const handleClick = vi.fn();
      render(<Button onClick={handleClick}>Click me</Button>);

      const button = screen.getByRole('button');

      // Simulate rapid clicks
      for (let i = 0; i < 10; i++) {
        fireEvent.click(button);
      }

      expect(handleClick).toHaveBeenCalledTimes(10);
    });
  });
});
```

#### Custom Hook Testing

```tsx
// src/hooks/useAuth.test.ts
import { renderHook, act, waitFor } from '@testing-library/react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { useAuth } from './useAuth';
import { authApi } from '@voiceassist/api-client';

vi.mock('@voiceassist/api-client');

describe('useAuth', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('initializes with null user', () => {
    const { result } = renderHook(() => useAuth());

    expect(result.current.user).toBeNull();
    expect(result.current.isAuthenticated).toBe(false);
    expect(result.current.isLoading).toBe(false);
  });

  it('logs in successfully', async () => {
    const mockUser = { id: '1', email: 'test@example.com' };
    vi.mocked(authApi.login).mockResolvedValue({
      user: mockUser,
      token: 'mock-token'
    });

    const { result } = renderHook(() => useAuth());

    act(() => {
      result.current.login('test@example.com', 'password');
    });

    expect(result.current.isLoading).toBe(true);

    await waitFor(() => {
      expect(result.current.isLoading).toBe(false);
      expect(result.current.user).toEqual(mockUser);
      expect(result.current.isAuthenticated).toBe(true);
    });
  });

  it('handles login error', async () => {
    const mockError = new Error('Invalid credentials');
    vi.mocked(authApi.login).mockRejectedValue(mockError);

    const { result } = renderHook(() => useAuth());

    await act(async () => {
      await result.current.login('test@example.com', 'wrong-password');
    });

    expect(result.current.error).toEqual(mockError);
    expect(result.current.isAuthenticated).toBe(false);
  });

  it('logs out successfully', async () => {
    const { result } = renderHook(() => useAuth());

    // First login
    await act(async () => {
      await result.current.login('test@example.com', 'password');
    });

    // Then logout
    act(() => {
      result.current.logout();
    });

    expect(result.current.user).toBeNull();
    expect(result.current.isAuthenticated).toBe(false);
  });
});
```

#### Utility Function Testing

```tsx
// src/utils/date.test.ts
import { describe, it, expect } from 'vitest';
import { formatDate, parseDate, isValidDate } from './date';

describe('Date Utilities', () => {
  describe('formatDate', () => {
    it('formats date in default format', () => {
      const date = new Date('2025-01-15T10:30:00Z');
      expect(formatDate(date)).toBe('Jan 15, 2025');
    });

    it('formats date with custom format', () => {
      const date = new Date('2025-01-15T10:30:00Z');
      expect(formatDate(date, 'yyyy-MM-dd')).toBe('2025-01-15');
    });

    it('handles invalid date', () => {
      expect(formatDate(new Date('invalid'))).toBe('Invalid Date');
    });
  });

  describe('parseDate', () => {
    it('parses ISO date string', () => {
      const result = parseDate('2025-01-15T10:30:00Z');
      expect(result).toBeInstanceOf(Date);
      expect(result.getFullYear()).toBe(2025);
    });

    it('returns null for invalid date string', () => {
      expect(parseDate('not-a-date')).toBeNull();
    });
  });

  describe('isValidDate', () => {
    it('returns true for valid date', () => {
      expect(isValidDate(new Date('2025-01-15'))).toBe(true);
    });

    it('returns false for invalid date', () => {
      expect(isValidDate(new Date('invalid'))).toBe(false);
    });

    it('returns false for non-date values', () => {
      expect(isValidDate('2025-01-15')).toBe(false);
      expect(isValidDate(null)).toBe(false);
      expect(isValidDate(undefined)).toBe(false);
    });
  });
});
```

### 3.3 Integration Testing

#### API Integration Tests

```tsx
// src/api/auth.integration.test.ts
import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { setupServer } from 'msw/node';
import { http, HttpResponse } from 'msw';
import { authApi } from '@voiceassist/api-client';

const server = setupServer();

beforeAll(() => server.listen());
afterAll(() => server.close());

describe('Auth API Integration', () => {
  it('successfully logs in user', async () => {
    server.use(
      http.post('/api/auth/login', () => {
        return HttpResponse.json({
          user: { id: '1', email: 'test@example.com' },
          token: 'mock-jwt-token',
          refreshToken: 'mock-refresh-token'
        });
      })
    );

    const result = await authApi.login({
      email: 'test@example.com',
      password: 'password123'
    });

    expect(result.user).toMatchObject({
      id: '1',
      email: 'test@example.com'
    });
    expect(result.token).toBe('mock-jwt-token');
  });

  it('handles 401 authentication error', async () => {
    server.use(
      http.post('/api/auth/login', () => {
        return new HttpResponse(null, {
          status: 401,
          statusText: 'Unauthorized'
        });
      })
    );

    await expect(
      authApi.login({
        email: 'test@example.com',
        password: 'wrong-password'
      })
    ).rejects.toThrow('Unauthorized');
  });

  it('refreshes token successfully', async () => {
    server.use(
      http.post('/api/auth/refresh', () => {
        return HttpResponse.json({
          token: 'new-jwt-token',
          refreshToken: 'new-refresh-token'
        });
      })
    );

    const result = await authApi.refreshToken('old-refresh-token');

    expect(result.token).toBe('new-jwt-token');
    expect(result.refreshToken).toBe('new-refresh-token');
  });
});
```

#### Component Integration Tests

```tsx
// src/features/auth/LoginPage.integration.test.tsx
import { describe, it, expect, vi } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { LoginPage } from './LoginPage';
import { QueryClientProvider, QueryClient } from '@tanstack/react-query';
import { BrowserRouter } from 'react-router-dom';

const queryClient = new QueryClient({
  defaultOptions: {
    queries: { retry: false },
    mutations: { retry: false }
  }
});

function renderLoginPage() {
  return render(
    <QueryClientProvider client={queryClient}>
      <BrowserRouter>
        <LoginPage />
      </BrowserRouter>
    </QueryClientProvider>
  );
}

describe('LoginPage Integration', () => {
  it('completes full login flow', async () => {
    const user = userEvent.setup();
    renderLoginPage();

    // Fill in email
    const emailInput = screen.getByLabelText(/email/i);
    await user.type(emailInput, 'test@example.com');

    // Fill in password
    const passwordInput = screen.getByLabelText(/password/i);
    await user.type(passwordInput, 'password123');

    // Submit form
    const submitButton = screen.getByRole('button', { name: /log in/i });
    await user.click(submitButton);

    // Verify loading state
    expect(screen.getByText(/logging in/i)).toBeInTheDocument();

    // Verify redirect after successful login
    await waitFor(() => {
      expect(window.location.pathname).toBe('/dashboard');
    });
  });

  it('shows validation errors', async () => {
    const user = userEvent.setup();
    renderLoginPage();

    // Submit empty form
    const submitButton = screen.getByRole('button', { name: /log in/i });
    await user.click(submitButton);

    // Verify validation messages
    expect(screen.getByText(/email is required/i)).toBeInTheDocument();
    expect(screen.getByText(/password is required/i)).toBeInTheDocument();
  });

  it('displays API error message', async () => {
    const user = userEvent.setup();
    renderLoginPage();

    // Fill in invalid credentials
    await user.type(screen.getByLabelText(/email/i), 'test@example.com');
    await user.type(screen.getByLabelText(/password/i), 'wrong-password');

    // Submit form
    await user.click(screen.getByRole('button', { name: /log in/i }));

    // Verify error message
    await waitFor(() => {
      expect(screen.getByText(/invalid credentials/i)).toBeInTheDocument();
    });
  });
});
```

### 3.4 End-to-End (E2E) Testing

#### Playwright E2E Tests

```typescript
// e2e/auth.spec.ts
import { test, expect } from '@playwright/test';

test.describe('Authentication Flow', () => {
  test('user can log in successfully', async ({ page }) => {
    await page.goto('/login');

    // Fill login form
    await page.fill('input[name="email"]', 'test@example.com');
    await page.fill('input[name="password"]', 'password123');

    // Submit
    await page.click('button:has-text("Log In")');

    // Verify redirect to dashboard
    await expect(page).toHaveURL('/dashboard');

    // Verify user menu shows
    await expect(page.locator('[data-testid="user-menu"]')).toBeVisible();
    await expect(page.locator('[data-testid="user-email"]')).toHaveText('test@example.com');
  });

  test('shows error for invalid credentials', async ({ page }) => {
    await page.goto('/login');

    await page.fill('input[name="email"]', 'test@example.com');
    await page.fill('input[name="password"]', 'wrong-password');

    await page.click('button:has-text("Log In")');

    // Verify error message
    await expect(page.locator('[role="alert"]')).toContainText('Invalid credentials');

    // Verify still on login page
    await expect(page).toHaveURL('/login');
  });

  test('user can log out', async ({ page, context }) => {
    // Login first
    await page.goto('/login');
    await page.fill('input[name="email"]', 'test@example.com');
    await page.fill('input[name="password"]', 'password123');
    await page.click('button:has-text("Log In")');
    await expect(page).toHaveURL('/dashboard');

    // Open user menu
    await page.click('[data-testid="user-menu-button"]');

    // Click logout
    await page.click('button:has-text("Log Out")');

    // Verify redirect to login
    await expect(page).toHaveURL('/login');

    // Verify token cleared
    const cookies = await context.cookies();
    expect(cookies.find(c => c.name === 'auth_token')).toBeUndefined();
  });
});
```

#### Voice Mode E2E Tests

```typescript
// e2e/voice-mode.spec.ts
import { test, expect } from '@playwright/test';

test.describe('Voice Mode', () => {
  test.beforeEach(async ({ page }) => {
    // Login
    await page.goto('/login');
    await page.fill('input[name="email"]', 'test@example.com');
    await page.fill('input[name="password"]', 'password123');
    await page.click('button:has-text("Log In")');
    await expect(page).toHaveURL('/dashboard');
  });

  test('starts voice session', async ({ page, context }) => {
    // Grant microphone permission
    await context.grantPermissions(['microphone']);

    await page.goto('/voice');

    // Click start button
    await page.click('button:has-text("Start Voice Mode")');

    // Verify voice mode is active
    await expect(page.locator('[data-testid="voice-status"]')).toHaveText('Listening...');
    await expect(page.locator('[data-testid="voice-indicator"]')).toBeVisible();

    // Verify WebSocket connection
    const wsMessages = [];
    page.on('websocket', ws => {
      ws.on('framereceived', frame => {
        const data = JSON.parse(frame.payload.toString());
        wsMessages.push(data);
      });
    });

    await page.waitForTimeout(1000);

    expect(wsMessages).toContainEqual(
      expect.objectContaining({ type: 'voice_session_started' })
    );
  });

  test('displays transcript in real-time', async ({ page, context }) => {
    await context.grantPermissions(['microphone']);

    await page.goto('/voice');
    await page.click('button:has-text("Start Voice Mode")');

    // Mock WebSocket message
    await page.evaluate(() => {
      // Simulate transcript message
      window.dispatchEvent(new CustomEvent('ws-message', {
        detail: {
          type: 'transcript',
          text: 'What is hypertension?',
          isFinal: true
        }
      }));
    });

    // Verify transcript appears
    await expect(page.locator('[data-testid="transcript"]')).toContainText('What is hypertension?');
  });

  test('stops voice session', async ({ page, context }) => {
    await context.grantPermissions(['microphone']);

    await page.goto('/voice');
    await page.click('button:has-text("Start Voice Mode")');

    await expect(page.locator('[data-testid="voice-status"]')).toHaveText('Listening...');

    // Stop voice mode
    await page.click('button:has-text("Stop")');

    // Verify stopped
    await expect(page.locator('[data-testid="voice-status"]')).toHaveText('Stopped');
    await expect(page.locator('[data-testid="voice-indicator"]')).not.toBeVisible();
  });
});
```

### 3.5 Accessibility Testing

```tsx
// src/components/Button.a11y.test.tsx
import { describe, it, expect } from 'vitest';
import { render } from '@testing-library/react';
import { axe, toHaveNoViolations } from 'jest-axe';
import { Button } from './Button';

expect.extend(toHaveNoViolations);

describe('Button Accessibility', () => {
  it('has no accessibility violations', async () => {
    const { container } = render(<Button>Click me</Button>);
    const results = await axe(container);
    expect(results).toHaveNoViolations();
  });

  it('has no violations when disabled', async () => {
    const { container } = render(<Button disabled>Click me</Button>);
    const results = await axe(container);
    expect(results).toHaveNoViolations();
  });

  it('has no violations with icon only', async () => {
    const { container } = render(
      <Button aria-label="Close">
        <CloseIcon />
      </Button>
    );
    const results = await axe(container);
    expect(results).toHaveNoViolations();
  });

  it('maintains focus visibility', () => {
    const { getByRole } = render(<Button>Click me</Button>);
    const button = getByRole('button');

    button.focus();

    // Check for visible focus indicator
    const styles = window.getComputedStyle(button);
    expect(styles.outline).not.toBe('none');
  });

  it('supports keyboard navigation', () => {
    const handleClick = vi.fn();
    const { getByRole } = render(<Button onClick={handleClick}>Click me</Button>);
    const button = getByRole('button');

    // Enter key
    fireEvent.keyDown(button, { key: 'Enter' });
    expect(handleClick).toHaveBeenCalled();

    // Space key
    fireEvent.keyDown(button, { key: ' ' });
    expect(handleClick).toHaveBeenCalledTimes(2);
  });
});
```

### 3.6 Performance Testing

```tsx
// src/components/ChatMessageList.perf.test.tsx
import { describe, it, expect } from 'vitest';
import { render } from '@testing-library/react';
import { ChatMessageList } from './ChatMessageList';

describe('ChatMessageList Performance', () => {
  it('renders 1000 messages in under 500ms', () => {
    const messages = Array.from({ length: 1000 }, (_, i) => ({
      id: String(i),
      text: `Message ${i}`,
      sender: i % 2 === 0 ? 'user' : 'assistant',
      timestamp: new Date()
    }));

    const startTime = performance.now();
    render(<ChatMessageList messages={messages} />);
    const endTime = performance.now();

    const renderTime = endTime - startTime;
    expect(renderTime).toBeLessThan(500);
  });

  it('does not re-render when unrelated props change', () => {
    const messages = [
      { id: '1', text: 'Hello', sender: 'user', timestamp: new Date() }
    ];

    let renderCount = 0;
    const TestComponent = () => {
      renderCount++;
      return <ChatMessageList messages={messages} />;
    };

    const { rerender } = render(<TestComponent />);
    expect(renderCount).toBe(1);

    // Rerender with same messages
    rerender(<TestComponent />);
    expect(renderCount).toBe(1); // Should not re-render
  });
});
```

### 3.7 Test Configuration

#### Vitest Configuration

`vitest.config.ts`:

```typescript
import { defineConfig } from 'vitest/config';
import react from '@vitejs/plugin-react-swc';
import path from 'path';

export default defineConfig({
  plugins: [react()],
  test: {
    globals: true,
    environment: 'jsdom',
    setupFiles: ['./src/test/setup.ts'],
    coverage: {
      provider: 'v8',
      reporter: ['text', 'json', 'html', 'lcov'],
      exclude: [
        'node_modules/',
        'src/test/',
        '**/*.d.ts',
        '**/*.config.*',
        '**/mockData/',
        '**/*.stories.tsx'
      ],
      statements: 80,
      branches: 80,
      functions: 80,
      lines: 80
    },
    include: ['src/**/*.{test,spec}.{js,ts,jsx,tsx}'],
    exclude: ['node_modules', 'dist', '.idea', '.git', '.cache'],
    testTimeout: 10000,
    hookTimeout: 10000
  },
  resolve: {
    alias: {
      '@': path.resolve(__dirname, './src'),
      '@voiceassist/ui': path.resolve(__dirname, '../packages/ui/src'),
      '@voiceassist/types': path.resolve(__dirname, '../packages/types/src'),
      '@voiceassist/api-client': path.resolve(__dirname, '../packages/api-client/src'),
      '@voiceassist/utils': path.resolve(__dirname, '../packages/utils/src')
    }
  }
});
```

#### Test Setup

`src/test/setup.ts`:

```typescript
import { expect, afterEach, vi } from 'vitest';
import { cleanup } from '@testing-library/react';
import * as matchers from '@testing-library/jest-dom/matchers';
import { toHaveNoViolations } from 'jest-axe';

// Extend Vitest's expect with jest-dom matchers
expect.extend(matchers);
expect.extend(toHaveNoViolations);

// Cleanup after each test
afterEach(() => {
  cleanup();
});

// Mock window.matchMedia
Object.defineProperty(window, 'matchMedia', {
  writable: true,
  value: vi.fn().mockImplementation(query => ({
    matches: false,
    media: query,
    onchange: null,
    addListener: vi.fn(),
    removeListener: vi.fn(),
    addEventListener: vi.fn(),
    removeEventListener: vi.fn(),
    dispatchEvent: vi.fn(),
  })),
});

// Mock IntersectionObserver
global.IntersectionObserver = class IntersectionObserver {
  constructor() {}
  disconnect() {}
  observe() {}
  takeRecords() {
    return [];
  }
  unobserve() {}
} as any;

// Mock ResizeObserver
global.ResizeObserver = class ResizeObserver {
  constructor() {}
  disconnect() {}
  observe() {}
  unobserve() {}
} as any;

// Mock WebSocket
global.WebSocket = class WebSocket {
  constructor() {}
  send() {}
  close() {}
} as any;
```

#### Playwright Configuration

`playwright.config.ts`:

```typescript
import { defineConfig, devices } from '@playwright/test';

export default defineConfig({
  testDir: './e2e',
  fullyParallel: true,
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 2 : 0,
  workers: process.env.CI ? 1 : undefined,
  reporter: [
    ['html'],
    ['junit', { outputFile: 'test-results/junit.xml' }],
    ['json', { outputFile: 'test-results/results.json' }]
  ],
  use: {
    baseURL: process.env.E2E_BASE_URL || 'http://localhost:5173',
    trace: 'on-first-retry',
    screenshot: 'only-on-failure',
    video: 'retain-on-failure'
  },
  projects: [
    {
      name: 'chromium',
      use: { ...devices['Desktop Chrome'] },
    },
    {
      name: 'firefox',
      use: { ...devices['Desktop Firefox'] },
    },
    {
      name: 'webkit',
      use: { ...devices['Desktop Safari'] },
    },
    {
      name: 'Mobile Chrome',
      use: { ...devices['Pixel 5'] },
    },
    {
      name: 'Mobile Safari',
      use: { ...devices['iPhone 12'] },
    },
  ],
  webServer: {
    command: 'pnpm dev',
    url: 'http://localhost:5173',
    reuseExistingServer: !process.env.CI,
  },
});
```

---

## 4. CI/CD Pipelines

### 4.1 GitHub Actions Workflows

#### Main CI Workflow

`.github/workflows/ci.yml`:

```yaml
name: CI

on:
  push:
    branches: [main, develop, staging]
  pull_request:
    branches: [main, develop, staging]

concurrency:
  group: ${{ github.workflow }}-${{ github.ref }}
  cancel-in-progress: true

jobs:
  # Job 1: Lint and Type Check
  lint:
    name: Lint & Type Check
    runs-on: ubuntu-latest
    timeout-minutes: 10

    steps:
      - name: Checkout code
        uses: actions/checkout@v4

      - name: Setup pnpm
        uses: pnpm/action-setup@v2
        with:
          version: 8

      - name: Setup Node.js
        uses: actions/setup-node@v4
        with:
          node-version: '20'
          cache: 'pnpm'

      - name: Install dependencies
        run: pnpm install --frozen-lockfile

      - name: Run ESLint
        run: pnpm run lint

      - name: Run TypeScript type check
        run: pnpm run type-check

      - name: Check formatting
        run: pnpm run format:check

  # Job 2: Unit Tests
  test:
    name: Unit Tests
    runs-on: ubuntu-latest
    timeout-minutes: 15

    steps:
      - name: Checkout code
        uses: actions/checkout@v4

      - name: Setup pnpm
        uses: pnpm/action-setup@v2
        with:
          version: 8

      - name: Setup Node.js
        uses: actions/setup-node@v4
        with:
          node-version: '20'
          cache: 'pnpm'

      - name: Install dependencies
        run: pnpm install --frozen-lockfile

      - name: Run unit tests
        run: pnpm test --coverage

      - name: Upload coverage to Codecov
        uses: codecov/codecov-action@v3
        with:
          token: ${{ secrets.CODECOV_TOKEN }}
          files: ./coverage/lcov.info
          flags: unittests
          name: codecov-umbrella

      - name: Check coverage threshold
        run: |
          if [ $(jq '.total.lines.pct' coverage/coverage-summary.json | cut -d. -f1) -lt 80 ]; then
            echo "Coverage is below 80%"
            exit 1
          fi

  # Job 3: E2E Tests
  e2e:
    name: E2E Tests
    runs-on: ubuntu-latest
    timeout-minutes: 30

    steps:
      - name: Checkout code
        uses: actions/checkout@v4

      - name: Setup pnpm
        uses: pnpm/action-setup@v2
        with:
          version: 8

      - name: Setup Node.js
        uses: actions/setup-node@v4
        with:
          node-version: '20'
          cache: 'pnpm'

      - name: Install dependencies
        run: pnpm install --frozen-lockfile

      - name: Install Playwright browsers
        run: pnpm exec playwright install --with-deps

      - name: Run E2E tests
        run: pnpm run test:e2e
        env:
          E2E_BASE_URL: http://localhost:5173

      - name: Upload test results
        if: always()
        uses: actions/upload-artifact@v3
        with:
          name: playwright-report
          path: playwright-report/
          retention-days: 30

  # Job 4: Build
  build:
    name: Build
    runs-on: ubuntu-latest
    needs: [lint, test]
    timeout-minutes: 15

    strategy:
      matrix:
        app: [web-app, admin-panel, docs-site]

    steps:
      - name: Checkout code
        uses: actions/checkout@v4

      - name: Setup pnpm
        uses: pnpm/action-setup@v2
        with:
          version: 8

      - name: Setup Node.js
        uses: actions/setup-node@v4
        with:
          node-version: '20'
          cache: 'pnpm'

      - name: Install dependencies
        run: pnpm install --frozen-lockfile

      - name: Build ${{ matrix.app }}
        run: pnpm --filter ${{ matrix.app }} build

      - name: Check bundle size
        run: |
          SIZE=$(du -sb apps/${{ matrix.app }}/dist | cut -f1)
          MAX_SIZE=5242880  # 5MB
          if [ $SIZE -gt $MAX_SIZE ]; then
            echo "Bundle size ($SIZE bytes) exceeds maximum ($MAX_SIZE bytes)"
            exit 1
          fi

      - name: Upload build artifacts
        uses: actions/upload-artifact@v3
        with:
          name: ${{ matrix.app }}-dist
          path: apps/${{ matrix.app }}/dist
          retention-days: 7

  # Job 5: Security Scan
  security:
    name: Security Scan
    runs-on: ubuntu-latest
    timeout-minutes: 10

    steps:
      - name: Checkout code
        uses: actions/checkout@v4

      - name: Run Snyk security scan
        uses: snyk/actions/node@master
        env:
          SNYK_TOKEN: ${{ secrets.SNYK_TOKEN }}
        with:
          args: --severity-threshold=high

      - name: Run npm audit
        run: pnpm audit --production --audit-level=moderate

  # Job 6: Accessibility Check
  a11y:
    name: Accessibility Check
    runs-on: ubuntu-latest
    needs: build
    timeout-minutes: 15

    steps:
      - name: Checkout code
        uses: actions/checkout@v4

      - name: Setup pnpm
        uses: pnpm/action-setup@v2
        with:
          version: 8

      - name: Setup Node.js
        uses: actions/setup-node@v4
        with:
          node-version: '20'
          cache: 'pnpm'

      - name: Install dependencies
        run: pnpm install --frozen-lockfile

      - name: Run Pa11y
        run: pnpm run test:a11y

      - name: Upload accessibility report
        if: always()
        uses: actions/upload-artifact@v3
        with:
          name: a11y-report
          path: a11y-report/
          retention-days: 30
```

#### Deploy Workflow

`.github/workflows/deploy.yml`:

```yaml
name: Deploy

on:
  push:
    branches: [main]
    tags:
      - 'v*'

  workflow_dispatch:
    inputs:
      environment:
        description: 'Environment to deploy to'
        required: true
        type: choice
        options:
          - staging
          - production

jobs:
  deploy-staging:
    name: Deploy to Staging
    runs-on: ubuntu-latest
    if: github.ref == 'refs/heads/develop' || github.event.inputs.environment == 'staging'
    environment:
      name: staging
      url: https://staging.voiceassist.asimo.io

    steps:
      - name: Checkout code
        uses: actions/checkout@v4

      - name: Setup pnpm
        uses: pnpm/action-setup@v2
        with:
          version: 8

      - name: Setup Node.js
        uses: actions/setup-node@v4
        with:
          node-version: '20'
          cache: 'pnpm'

      - name: Install dependencies
        run: pnpm install --frozen-lockfile

      - name: Build all apps
        run: pnpm run build
        env:
          VITE_API_URL: https://api-staging.voiceassist.asimo.io
          VITE_WS_URL: wss://ws-staging.voiceassist.asimo.io

      - name: Deploy to staging
        uses: easingthemes/ssh-deploy@v4
        with:
          SSH_PRIVATE_KEY: ${{ secrets.SSH_PRIVATE_KEY }}
          ARGS: "-avz --delete"
          SOURCE: "apps/*/dist/"
          REMOTE_HOST: ${{ secrets.STAGING_HOST }}
          REMOTE_USER: ${{ secrets.STAGING_USER }}
          TARGET: /var/www/voiceassist-staging/

      - name: Notify deployment
        uses: slackapi/slack-github-action@v1
        with:
          webhook-url: ${{ secrets.SLACK_WEBHOOK }}
          payload: |
            {
              "text": "VoiceAssist deployed to staging",
              "blocks": [
                {
                  "type": "section",
                  "text": {
                    "type": "mrkdwn",
                    "text": "*Deployment to Staging Complete*\nCommit: ${{ github.sha }}"
                  }
                }
              ]
            }

  deploy-production:
    name: Deploy to Production
    runs-on: ubuntu-latest
    if: github.ref == 'refs/heads/main' || github.event.inputs.environment == 'production'
    environment:
      name: production
      url: https://voiceassist.asimo.io

    steps:
      - name: Checkout code
        uses: actions/checkout@v4

      - name: Setup pnpm
        uses: pnpm/action-setup@v2
        with:
          version: 8

      - name: Setup Node.js
        uses: actions/setup-node@v4
        with:
          node-version: '20'
          cache: 'pnpm'

      - name: Install dependencies
        run: pnpm install --frozen-lockfile

      - name: Build all apps
        run: pnpm run build
        env:
          VITE_API_URL: https://api.voiceassist.asimo.io
          VITE_WS_URL: wss://ws.voiceassist.asimo.io

      - name: Run smoke tests
        run: pnpm run test:smoke
        env:
          E2E_BASE_URL: https://voiceassist.asimo.io

      - name: Create Sentry release
        uses: getsentry/action-release@v1
        env:
          SENTRY_AUTH_TOKEN: ${{ secrets.SENTRY_AUTH_TOKEN }}
          SENTRY_ORG: ${{ secrets.SENTRY_ORG }}
          SENTRY_PROJECT: ${{ secrets.SENTRY_PROJECT }}
        with:
          environment: production
          version: ${{ github.sha }}

      - name: Deploy to production
        uses: easingthemes/ssh-deploy@v4
        with:
          SSH_PRIVATE_KEY: ${{ secrets.SSH_PRIVATE_KEY }}
          ARGS: "-avz --delete"
          SOURCE: "apps/*/dist/"
          REMOTE_HOST: ${{ secrets.PRODUCTION_HOST }}
          REMOTE_USER: ${{ secrets.PRODUCTION_USER }}
          TARGET: /var/www/voiceassist/

      - name: Notify deployment
        uses: slackapi/slack-github-action@v1
        with:
          webhook-url: ${{ secrets.SLACK_WEBHOOK }}
          payload: |
            {
              "text": "VoiceAssist deployed to production",
              "blocks": [
                {
                  "type": "section",
                  "text": {
                    "type": "mrkdwn",
                    "text": "*Deployment to Production Complete*\nVersion: ${{ github.sha }}\nURL: https://voiceassist.asimo.io"
                  }
                }
              ]
            }

      - name: Create GitHub Release
        if: startsWith(github.ref, 'refs/tags/')
        uses: softprops/action-gh-release@v1
        with:
          generate_release_notes: true
```

### 4.2 Build Optimization

#### Turborepo Configuration

`turbo.json`:

```json
{
  "$schema": "https://turbo.build/schema.json",
  "globalDependencies": [".env"],
  "pipeline": {
    "build": {
      "dependsOn": ["^build"],
      "outputs": ["dist/**", ".next/**"],
      "env": [
        "VITE_API_URL",
        "VITE_WS_URL",
        "VITE_SENTRY_DSN"
      ]
    },
    "test": {
      "dependsOn": ["build"],
      "outputs": ["coverage/**"],
      "cache": false
    },
    "lint": {
      "outputs": []
    },
    "type-check": {
      "outputs": []
    },
    "dev": {
      "cache": false,
      "persistent": true
    }
  }
}
```

### 4.3 Automated Testing

#### Test Matrix Strategy

```yaml
# .github/workflows/test-matrix.yml
name: Test Matrix

on:
  pull_request:
    branches: [main, develop]

jobs:
  test:
    name: Test on ${{ matrix.os }} with Node ${{ matrix.node }}
    runs-on: ${{ matrix.os }}

    strategy:
      matrix:
        os: [ubuntu-latest, macos-latest, windows-latest]
        node: ['18', '20']

    steps:
      - uses: actions/checkout@v4
      - uses: pnpm/action-setup@v2
        with:
          version: 8
      - uses: actions/setup-node@v4
        with:
          node-version: ${{ matrix.node }}
          cache: 'pnpm'
      - run: pnpm install --frozen-lockfile
      - run: pnpm test
```

---

## 5. Deployment Procedures

### 5.1 Pre-Deployment Checklist

```markdown
## Pre-Deployment Checklist

### Code Quality
- [ ] All CI checks passing
- [ ] Code review approved (2+ reviewers for production)
- [ ] No console.log or debugger statements
- [ ] No TODO or FIXME comments
- [ ] Test coverage >= 80%

### Testing
- [ ] Unit tests passing
- [ ] Integration tests passing
- [ ] E2E tests passing
- [ ] Manual testing completed
- [ ] Accessibility tests passing
- [ ] Performance tests passing

### Security
- [ ] Security scan completed (Snyk)
- [ ] No high/critical vulnerabilities
- [ ] Secrets not hardcoded
- [ ] HIPAA compliance verified
- [ ] API rate limiting tested

### Documentation
- [ ] README updated
- [ ] CHANGELOG updated
- [ ] API documentation updated
- [ ] Migration guide written (if breaking changes)
- [ ] Deployment notes documented

### Infrastructure
- [ ] Environment variables configured
- [ ] Database migrations ready
- [ ] Rollback plan prepared
- [ ] Monitoring alerts configured
- [ ] Backup verified

### Communication
- [ ] Stakeholders notified
- [ ] Deployment window scheduled
- [ ] Support team briefed
- [ ] Incident response team on standby
```

### 5.2 Deployment Steps

#### Staging Deployment

```bash
#!/bin/bash
# deploy-staging.sh

set -e  # Exit on error

echo "🚀 Deploying to Staging..."

# 1. Verify current branch
CURRENT_BRANCH=$(git branch --show-current)
if [ "$CURRENT_BRANCH" != "develop" ]; then
  echo "❌ Error: Must deploy from 'develop' branch"
  exit 1
fi

# 2. Ensure clean working directory
if [ -n "$(git status --porcelain)" ]; then
  echo "❌ Error: Working directory is not clean"
  exit 1
fi

# 3. Pull latest changes
echo "📥 Pulling latest changes..."
git pull origin develop

# 4. Install dependencies
echo "📦 Installing dependencies..."
pnpm install --frozen-lockfile

# 5. Run tests
echo "🧪 Running tests..."
pnpm test

# 6. Build for staging
echo "🏗️  Building applications..."
export VITE_API_URL=https://api-staging.voiceassist.asimo.io
export VITE_WS_URL=wss://ws-staging.voiceassist.asimo.io
pnpm run build

# 7. Deploy to staging server
echo "📤 Deploying to staging server..."
rsync -avz --delete \
  apps/web-app/dist/ \
  deploy@staging.voiceassist.asimo.io:/var/www/voiceassist/web/

rsync -avz --delete \
  apps/admin-panel/dist/ \
  deploy@staging.voiceassist.asimo.io:/var/www/voiceassist/admin/

rsync -avz --delete \
  apps/docs-site/dist/ \
  deploy@staging.voiceassist.asimo.io:/var/www/voiceassist/docs/

# 8. Verify deployment
echo "✅ Verifying deployment..."
HTTP_STATUS=$(curl -s -o /dev/null -w "%{http_code}" https://staging.voiceassist.asimo.io)
if [ "$HTTP_STATUS" != "200" ]; then
  echo "❌ Error: Staging site returned HTTP $HTTP_STATUS"
  exit 1
fi

echo "✅ Deployment to staging complete!"
echo "🌐 URL: https://staging.voiceassist.asimo.io"
```

#### Production Deployment

```bash
#!/bin/bash
# deploy-production.sh

set -e

echo "🚀 Deploying to Production..."

# 1. Verify current branch
CURRENT_BRANCH=$(git branch --show-current)
if [ "$CURRENT_BRANCH" != "main" ]; then
  echo "❌ Error: Must deploy from 'main' branch"
  exit 1
fi

# 2. Confirm deployment
read -p "⚠️  Deploy to PRODUCTION? (yes/no): " CONFIRM
if [ "$CONFIRM" != "yes" ]; then
  echo "❌ Deployment cancelled"
  exit 1
fi

# 3. Create backup
echo "💾 Creating backup..."
ssh deploy@voiceassist.asimo.io "tar -czf /backups/voiceassist-$(date +%Y%m%d-%H%M%S).tar.gz /var/www/voiceassist/"

# 4. Pull latest changes
echo "📥 Pulling latest changes..."
git pull origin main

# 5. Install dependencies
echo "📦 Installing dependencies..."
pnpm install --frozen-lockfile

# 6. Run all tests
echo "🧪 Running all tests..."
pnpm test
pnpm run test:e2e

# 7. Build for production
echo "🏗️  Building applications..."
export VITE_API_URL=https://api.voiceassist.asimo.io
export VITE_WS_URL=wss://ws.voiceassist.asimo.io
pnpm run build

# 8. Deploy to production server
echo "📤 Deploying to production server..."
rsync -avz --delete \
  apps/web-app/dist/ \
  deploy@voiceassist.asimo.io:/var/www/voiceassist/web-new/

rsync -avz --delete \
  apps/admin-panel/dist/ \
  deploy@voiceassist.asimo.io:/var/www/voiceassist/admin-new/

rsync -avz --delete \
  apps/docs-site/dist/ \
  deploy@voiceassist.asimo.io:/var/www/voiceassist/docs-new/

# 9. Atomic swap
echo "🔄 Performing atomic swap..."
ssh deploy@voiceassist.asimo.io << 'EOF'
  mv /var/www/voiceassist/web /var/www/voiceassist/web-old
  mv /var/www/voiceassist/web-new /var/www/voiceassist/web

  mv /var/www/voiceassist/admin /var/www/voiceassist/admin-old
  mv /var/www/voiceassist/admin-new /var/www/voiceassist/admin

  mv /var/www/voiceassist/docs /var/www/voiceassist/docs-old
  mv /var/www/voiceassist/docs-new /var/www/voiceassist/docs
EOF

# 10. Verify deployment
echo "✅ Verifying deployment..."
HTTP_STATUS=$(curl -s -o /dev/null -w "%{http_code}" https://voiceassist.asimo.io)
if [ "$HTTP_STATUS" != "200" ]; then
  echo "❌ Error: Production site returned HTTP $HTTP_STATUS"
  echo "🔙 Rolling back..."
  ssh deploy@voiceassist.asimo.io << 'EOF'
    mv /var/www/voiceassist/web /var/www/voiceassist/web-failed
    mv /var/www/voiceassist/web-old /var/www/voiceassist/web
EOF
  exit 1
fi

# 11. Clean up old versions
echo "🧹 Cleaning up..."
ssh deploy@voiceassist.asimo.io "rm -rf /var/www/voiceassist/*-old"

# 12. Create release tag
VERSION=$(date +%Y.%m.%d-%H%M)
git tag -a "v$VERSION" -m "Production deployment $VERSION"
git push origin "v$VERSION"

echo "✅ Deployment to production complete!"
echo "🌐 URL: https://voiceassist.asimo.io"
echo "🏷️  Version: v$VERSION"
```

### 5.3 Rollback Procedure

```bash
#!/bin/bash
# rollback.sh

set -e

echo "🔙 Rolling back deployment..."

# 1. Verify environment
read -p "⚠️  Rollback PRODUCTION? (yes/no): " CONFIRM
if [ "$CONFIRM" != "yes" ]; then
  echo "❌ Rollback cancelled"
  exit 1
fi

# 2. List available backups
echo "📦 Available backups:"
ssh deploy@voiceassist.asimo.io "ls -lht /backups/voiceassist-*.tar.gz | head -5"

# 3. Select backup
read -p "Enter backup filename (e.g., voiceassist-20250121-143000.tar.gz): " BACKUP_FILE

# 4. Restore from backup
echo "🔄 Restoring from backup..."
ssh deploy@voiceassist.asimo.io << EOF
  cd /var/www
  tar -xzf /backups/$BACKUP_FILE
EOF

# 5. Verify restoration
HTTP_STATUS=$(curl -s -o /dev/null -w "%{http_code}" https://voiceassist.asimo.io)
if [ "$HTTP_STATUS" != "200" ]; then
  echo "❌ Error: Rollback verification failed"
  exit 1
fi

echo "✅ Rollback complete!"
echo "🌐 URL: https://voiceassist.asimo.io"
```

### 5.4 Post-Deployment Verification

```bash
#!/bin/bash
# verify-deployment.sh

set -e

BASE_URL=${1:-https://voiceassist.asimo.io}

echo "🔍 Verifying deployment at $BASE_URL..."

# 1. Check HTTP status
HTTP_STATUS=$(curl -s -o /dev/null -w "%{http_code}" $BASE_URL)
if [ "$HTTP_STATUS" != "200" ]; then
  echo "❌ HTTP status check failed: $HTTP_STATUS"
  exit 1
fi
echo "✅ HTTP status: 200"

# 2. Check response time
RESPONSE_TIME=$(curl -s -o /dev/null -w "%{time_total}" $BASE_URL)
if (( $(echo "$RESPONSE_TIME > 2.0" | bc -l) )); then
  echo "⚠️  Warning: Slow response time: ${RESPONSE_TIME}s"
else
  echo "✅ Response time: ${RESPONSE_TIME}s"
fi

# 3. Check SSL certificate
SSL_EXPIRY=$(echo | openssl s_client -servername voiceassist.asimo.io -connect voiceassist.asimo.io:443 2>/dev/null | openssl x509 -noout -dates | grep notAfter | cut -d= -f2)
echo "✅ SSL certificate valid until: $SSL_EXPIRY"

# 4. Check critical endpoints
ENDPOINTS=(
  "/health"
  "/api/health"
  "/api/auth/verify"
)

for ENDPOINT in "${ENDPOINTS[@]}"; do
  STATUS=$(curl -s -o /dev/null -w "%{http_code}" "$BASE_URL$ENDPOINT")
  if [ "$STATUS" == "200" ] || [ "$STATUS" == "401" ]; then
    echo "✅ $ENDPOINT: $STATUS"
  else
    echo "❌ $ENDPOINT: $STATUS"
    exit 1
  fi
done

# 5. Check JavaScript bundle loaded
if curl -s $BASE_URL | grep -q "script"; then
  echo "✅ JavaScript bundles loaded"
else
  echo "❌ JavaScript bundles missing"
  exit 1
fi

# 6. Check for console errors (requires running browser)
echo "⚠️  Manual check required: Open browser console and verify no errors"

echo "✅ Deployment verification complete!"
```

---

## 6. Documentation Standards

### 6.1 Code Documentation

#### JSDoc Standards

```typescript
/**
 * Authenticates a user with email and password.
 *
 * @param {string} email - User's email address
 * @param {string} password - User's password
 * @returns {Promise<AuthResponse>} Authentication response with user and tokens
 * @throws {AuthenticationError} If credentials are invalid
 * @throws {NetworkError} If network request fails
 *
 * @example
 * ```typescript
 * const result = await loginUser('user@example.com', 'password123');
 * console.log(result.user.email); // 'user@example.com'
 * ```
 *
 * @see {@link AuthResponse} for response structure
 * @see {@link https://docs.voiceassist.asimo.io/auth|Auth Documentation}
 */
async function loginUser(
  email: string,
  password: string
): Promise<AuthResponse> {
  // Implementation
}

/**
 * Custom hook for managing authentication state.
 *
 * @returns {UseAuthReturn} Authentication state and methods
 *
 * @example
 * ```typescript
 * function LoginPage() {
 *   const { user, login, logout, isLoading } = useAuth();
 *
 *   const handleLogin = async () => {
 *     await login('user@example.com', 'password');
 *   };
 *
 *   return <div>...</div>;
 * }
 * ```
 */
function useAuth(): UseAuthReturn {
  // Implementation
}

/**
 * User data structure.
 *
 * @interface User
 * @property {string} id - Unique user identifier
 * @property {string} email - User's email address
 * @property {string} name - User's full name
 * @property {UserRole} role - User's role
 * @property {Date} createdAt - Account creation timestamp
 * @property {Date} [lastLoginAt] - Last login timestamp (optional)
 */
interface User {
  id: string;
  email: string;
  name: string;
  role: UserRole;
  createdAt: Date;
  lastLoginAt?: Date;
}
```

#### Component Documentation

```tsx
/**
 * Button component with multiple variants and states.
 *
 * Supports primary, secondary, and ghost variants with loading and disabled states.
 * Fully accessible with keyboard navigation and screen reader support.
 *
 * @component
 * @example
 * ```tsx
 * // Primary button
 * <Button variant="primary" onClick={handleClick}>
 *   Click Me
 * </Button>
 *
 * // Loading state
 * <Button variant="primary" loading>
 *   Processing...
 * </Button>
 *
 * // Disabled state
 * <Button variant="secondary" disabled>
 *   Unavailable
 * </Button>
 * ```
 */
export function Button({
  /**
   * Button content
   */
  children,

  /**
   * Visual variant
   * @default 'primary'
   */
  variant = 'primary',

  /**
   * Loading state - shows spinner and disables interaction
   * @default false
   */
  loading = false,

  /**
   * Disabled state
   * @default false
   */
  disabled = false,

  /**
   * Click handler
   */
  onClick,

  /**
   * Additional CSS classes
   */
  className,

  ...props
}: ButtonProps) {
  // Implementation
}
```

### 6.2 README Standards

#### Component README Template

```markdown
# Button Component

A flexible, accessible button component with multiple variants and states.

## Features

- ✅ Multiple variants (primary, secondary, ghost)
- ✅ Loading state with spinner
- ✅ Fully accessible (WCAG 2.1 AA compliant)
- ✅ Keyboard navigation support
- ✅ TypeScript support
- ✅ Customizable via Tailwind classes

## Installation

```bash
pnpm add @voiceassist/ui
```

## Usage

### Basic Button

```tsx
import { Button } from '@voiceassist/ui';

function App() {
  return (
    <Button onClick={() => alert('Clicked!')}>
      Click Me
    </Button>
  );
}
```

### Variants

```tsx
<Button variant="primary">Primary</Button>
<Button variant="secondary">Secondary</Button>
<Button variant="ghost">Ghost</Button>
```

### States

```tsx
<Button loading>Loading...</Button>
<Button disabled>Disabled</Button>
```

### With Icons

```tsx
import { PlusIcon } from '@heroicons/react/24/outline';

<Button>
  <PlusIcon className="w-5 h-5 mr-2" />
  Add Item
</Button>
```

## Props

| Prop | Type | Default | Description |
|------|------|---------|-------------|
| `variant` | `'primary' \| 'secondary' \| 'ghost'` | `'primary'` | Visual variant |
| `loading` | `boolean` | `false` | Shows loading spinner |
| `disabled` | `boolean` | `false` | Disables interaction |
| `onClick` | `() => void` | - | Click handler |
| `children` | `ReactNode` | - | Button content |
| `className` | `string` | - | Additional CSS classes |

## Accessibility

- ✅ Keyboard accessible (Tab, Enter, Space)
- ✅ Screen reader support
- ✅ Focus visible indicator
- ✅ ARIA attributes
- ✅ Disabled state communicated

## Testing

```tsx
import { render, screen, fireEvent } from '@testing-library/react';
import { Button } from './Button';

test('calls onClick when clicked', () => {
  const handleClick = vi.fn();
  render(<Button onClick={handleClick}>Click</Button>);

  fireEvent.click(screen.getByRole('button'));

  expect(handleClick).toHaveBeenCalled();
});
```

## Related Components

- [IconButton](./IconButton.md) - Button with icon only
- [ButtonGroup](./ButtonGroup.md) - Group of related buttons

## License

MIT
```

### 6.3 API Documentation

#### OpenAPI/Swagger Annotations

```typescript
/**
 * @swagger
 * /api/auth/login:
 *   post:
 *     summary: Authenticate user
 *     description: Authenticates a user with email and password, returns JWT tokens
 *     tags:
 *       - Authentication
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required:
 *               - email
 *               - password
 *             properties:
 *               email:
 *                 type: string
 *                 format: email
 *                 example: user@example.com
 *               password:
 *                 type: string
 *                 format: password
 *                 example: password123
 *     responses:
 *       200:
 *         description: Successful authentication
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 user:
 *                   $ref: '#/components/schemas/User'
 *                 token:
 *                   type: string
 *                   description: JWT access token
 *                 refreshToken:
 *                   type: string
 *                   description: JWT refresh token
 *       401:
 *         description: Invalid credentials
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/Error'
 *       429:
 *         description: Too many requests
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/Error'
 */
export async function login(req: Request, res: Response) {
  // Implementation
}
```

---

## 7. Code Style Guide

### 7.1 TypeScript/JavaScript Style

#### ESLint Configuration

`.eslintrc.js`:

```javascript
module.exports = {
  root: true,
  extends: [
    'eslint:recommended',
    'plugin:@typescript-eslint/recommended',
    'plugin:@typescript-eslint/recommended-requiring-type-checking',
    'plugin:react/recommended',
    'plugin:react-hooks/recommended',
    'plugin:jsx-a11y/recommended',
    'prettier'
  ],
  parser: '@typescript-eslint/parser',
  parserOptions: {
    ecmaVersion: 2022,
    sourceType: 'module',
    ecmaFeatures: {
      jsx: true
    },
    project: './tsconfig.json'
  },
  plugins: ['@typescript-eslint', 'react', 'react-hooks', 'jsx-a11y'],
  rules: {
    // TypeScript
    '@typescript-eslint/no-explicit-any': 'error',
    '@typescript-eslint/explicit-function-return-type': 'off',
    '@typescript-eslint/explicit-module-boundary-types': 'off',
    '@typescript-eslint/no-unused-vars': ['error', {
      argsIgnorePattern: '^_',
      varsIgnorePattern: '^_'
    }],
    '@typescript-eslint/no-floating-promises': 'error',
    '@typescript-eslint/await-thenable': 'error',
    '@typescript-eslint/no-misused-promises': 'error',

    // React
    'react/react-in-jsx-scope': 'off',  // Not needed in React 17+
    'react/prop-types': 'off',  // Using TypeScript
    'react/jsx-uses-react': 'off',
    'react/jsx-key': 'error',
    'react/no-array-index-key': 'warn',
    'react-hooks/rules-of-hooks': 'error',
    'react-hooks/exhaustive-deps': 'warn',

    // General
    'no-console': ['warn', { allow: ['warn', 'error'] }],
    'no-debugger': 'error',
    'no-alert': 'warn',
    'prefer-const': 'error',
    'no-var': 'error',
    'eqeqeq': ['error', 'always'],
    'curly': ['error', 'all']
  },
  settings: {
    react: {
      version: 'detect'
    }
  }
};
```

#### Prettier Configuration

`.prettierrc`:

```json
{
  "semi": true,
  "trailingComma": "es5",
  "singleQuote": true,
  "printWidth": 100,
  "tabWidth": 2,
  "useTabs": false,
  "arrowParens": "avoid",
  "endOfLine": "lf",
  "bracketSpacing": true,
  "jsxSingleQuote": false,
  "jsxBracketSameLine": false
}
```

### 7.2 Naming Conventions

```typescript
// ✅ Good naming conventions

// Constants (UPPER_SNAKE_CASE)
const MAX_RETRY_COUNT = 3;
const API_BASE_URL = 'https://api.voiceassist.asimo.io';

// Enums (PascalCase)
enum UserRole {
  Admin = 'admin',
  Doctor = 'doctor',
  Patient = 'patient'
}

// Interfaces and Types (PascalCase)
interface User {
  id: string;
  email: string;
}

type AuthResponse = {
  user: User;
  token: string;
};

// Classes (PascalCase)
class AuthenticationService {
  private apiClient: ApiClient;

  constructor(apiClient: ApiClient) {
    this.apiClient = apiClient;
  }
}

// Functions and methods (camelCase)
function authenticateUser(email: string, password: string): Promise<AuthResponse> {
  // Implementation
}

// React components (PascalCase)
function LoginButton({ onClick }: LoginButtonProps) {
  return <button onClick={onClick}>Login</button>;
}

// Custom hooks (camelCase with 'use' prefix)
function useAuth() {
  const [user, setUser] = useState<User | null>(null);
  return { user, setUser };
}

// Variables (camelCase)
const userEmail = 'user@example.com';
const isAuthenticated = true;

// Boolean variables (is/has/can prefix)
const isLoading = false;
const hasError = false;
const canSubmit = true;

// Event handlers (handle prefix)
const handleClick = () => { /* ... */ };
const handleSubmit = async (e: FormEvent) => { /* ... */ };

// Private class members (underscore prefix)
class UserService {
  private _cache: Map<string, User>;

  private _getCachedUser(id: string): User | undefined {
    return this._cache.get(id);
  }
}
```

### 7.3 File Organization

```
src/
├── components/           # Reusable UI components
│   ├── Button/
│   │   ├── Button.tsx
│   │   ├── Button.test.tsx
│   │   ├── Button.stories.tsx
│   │   └── index.ts
│   └── ...
│
├── features/            # Feature-based modules
│   ├── auth/
│   │   ├── components/   # Feature-specific components
│   │   ├── hooks/        # Feature-specific hooks
│   │   ├── stores/       # Feature-specific state
│   │   ├── types/        # Feature-specific types
│   │   ├── utils/        # Feature-specific utilities
│   │   └── index.ts
│   └── ...
│
├── hooks/               # Shared custom hooks
│   ├── useAuth.ts
│   ├── useWebSocket.ts
│   └── ...
│
├── stores/              # Global state management
│   ├── authStore.ts
│   ├── chatStore.ts
│   └── ...
│
├── types/               # Shared TypeScript types
│   ├── api.ts
│   ├── user.ts
│   └── ...
│
├── utils/               # Utility functions
│   ├── date.ts
│   ├── validation.ts
│   └── ...
│
├── api/                 # API client
│   ├── client.ts
│   ├── auth.ts
│   ├── chat.ts
│   └── ...
│
├── pages/               # Page components (routing)
│   ├── LoginPage.tsx
│   ├── DashboardPage.tsx
│   └── ...
│
├── styles/              # Global styles
│   ├── globals.css
│   └── tailwind.css
│
├── config/              # Configuration files
│   ├── constants.ts
│   └── env.ts
│
└── App.tsx              # Root component
```

---

## 8. Performance Guidelines

### 8.1 React Performance

#### Optimize Re-renders

```tsx
// ❌ Bad: Inline object creation causes re-render
function UserList() {
  const users = useUsers();

  return (
    <div>
      {users.map(user => (
        <UserCard key={user.id} user={user} style={{ padding: '10px' }} />
      ))}
    </div>
  );
}

// ✅ Good: Memoize style object
const USER_CARD_STYLE = { padding: '10px' };

function UserList() {
  const users = useUsers();

  return (
    <div>
      {users.map(user => (
        <UserCard key={user.id} user={user} style={USER_CARD_STYLE} />
      ))}
    </div>
  );
}

// ✅ Better: Use React.memo for expensive components
const UserCard = React.memo(function UserCard({ user, style }: UserCardProps) {
  return <div style={style}>{user.name}</div>;
});
```

#### Use useMemo and useCallback

```tsx
function ChatMessages({ messages }: ChatMessagesProps) {
  // ✅ Memoize expensive calculations
  const sortedMessages = useMemo(() => {
    return messages.sort((a, b) => a.timestamp - b.timestamp);
  }, [messages]);

  // ✅ Memoize callback functions
  const handleMessageClick = useCallback((messageId: string) => {
    console.log('Clicked message:', messageId);
  }, []);

  return (
    <div>
      {sortedMessages.map(message => (
        <Message
          key={message.id}
          message={message}
          onClick={handleMessageClick}
        />
      ))}
    </div>
  );
}
```

#### Lazy Loading

```tsx
// ✅ Code splitting with React.lazy
const AdminPanel = React.lazy(() => import('./features/admin/AdminPanel'));
const VoiceMode = React.lazy(() => import('./features/voice/VoiceMode'));

function App() {
  return (
    <Suspense fallback={<LoadingSpinner />}>
      <Routes>
        <Route path="/admin" element={<AdminPanel />} />
        <Route path="/voice" element={<VoiceMode />} />
      </Routes>
    </Suspense>
  );
}

// ✅ Lazy load images
<img
  src={thumbnail}
  loading="lazy"
  alt="Thumbnail"
/>
```

### 8.2 Bundle Size Optimization

#### Analyze Bundle

```bash
# Install analyzer
pnpm add -D vite-plugin-bundle-analyzer

# Add to vite.config.ts
import { visualizer } from 'vite-plugin-bundle-analyzer';

export default defineConfig({
  plugins: [
    react(),
    visualizer({
      filename: './dist/stats.html',
      open: true
    })
  ]
});

# Build and analyze
pnpm build
```

#### Tree Shaking

```typescript
// ❌ Bad: Imports entire library
import _ from 'lodash';
const result = _.debounce(fn, 300);

// ✅ Good: Import specific function
import { debounce } from 'lodash-es';
const result = debounce(fn, 300);

// ✅ Better: Use modern alternatives
import debounce from 'just-debounce-it';  // Smaller package
const result = debounce(fn, 300);
```

### 8.3 Network Performance

#### API Request Optimization

```typescript
// ✅ Debounce search queries
function useSearchUsers(query: string) {
  const [results, setResults] = useState<User[]>([]);

  useEffect(() => {
    const handler = debounce(async () => {
      if (query.length < 2) return;
      const data = await searchUsers(query);
      setResults(data);
    }, 300);

    handler();

    return () => handler.cancel();
  }, [query]);

  return results;
}

// ✅ Implement request caching
const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      staleTime: 5 * 60 * 1000,  // 5 minutes
      cacheTime: 10 * 60 * 1000,  // 10 minutes
    },
  },
});

// ✅ Use pagination
function useInfiniteMessages() {
  return useInfiniteQuery({
    queryKey: ['messages'],
    queryFn: ({ pageParam = 0 }) => fetchMessages(pageParam),
    getNextPageParam: (lastPage, pages) => lastPage.nextCursor,
  });
}
```

---

## 9. Security Guidelines

### 9.1 Input Validation

```typescript
// ✅ Validate all user input
import { z } from 'zod';

const loginSchema = z.object({
  email: z.string().email('Invalid email format'),
  password: z.string().min(8, 'Password must be at least 8 characters')
});

function LoginForm() {
  const handleSubmit = async (data: unknown) => {
    try {
      const validated = loginSchema.parse(data);
      await login(validated.email, validated.password);
    } catch (error) {
      if (error instanceof z.ZodError) {
        // Handle validation errors
      }
    }
  };
}
```

### 9.2 XSS Prevention

```tsx
// ✅ React escapes by default
<div>{userInput}</div>  // Safe

// ❌ Dangerous: dangerouslySetInnerHTML
<div dangerouslySetInnerHTML={{ __html: userInput }} />  // XSS risk!

// ✅ Sanitize HTML if needed
import DOMPurify from 'isomorphic-dompurify';

<div dangerouslySetInnerHTML={{ __html: DOMPurify.sanitize(userInput) }} />
```

### 9.3 Secrets Management

```typescript
// ❌ Bad: Hardcoded secrets
const API_KEY = 'sk-abc123...';

// ✅ Good: Environment variables
const API_KEY = import.meta.env.VITE_API_KEY;

// ✅ Never commit .env files
# .gitignore
.env
.env.local
.env.production
```

---

## 10. Troubleshooting

### 10.1 Common Issues

#### Build Errors

**Issue:** `Module not found: Can't resolve '@voiceassist/ui'`

**Solution:**
```bash
# Rebuild shared packages
pnpm run build --filter @voiceassist/ui

# Clear cache
rm -rf node_modules/.cache
rm -rf apps/*/dist

# Reinstall dependencies
pnpm install
```

#### Type Errors

**Issue:** `Property 'X' does not exist on type 'Y'`

**Solution:**
```bash
# Regenerate TypeScript types
pnpm run type-check

# Clear TypeScript cache
rm -rf apps/*/tsconfig.tsbuildinfo
```

#### Test Failures

**Issue:** Tests failing in CI but passing locally

**Solution:**
```bash
# Run tests in CI mode
CI=true pnpm test

# Check for timezone issues
TZ=UTC pnpm test

# Check for random test order issues
pnpm test --random
```

### 10.2 Debugging Tips

```typescript
// Use console.group for better logging
console.group('User Login');
console.log('Email:', email);
console.log('Timestamp:', new Date());
console.groupEnd();

// Use debugger with conditional breakpoints
if (user.role === 'admin') {
  debugger;  // Only breaks for admin users
}

// Use React DevTools Profiler
// Wrap component with Profiler
import { Profiler } from 'react';

<Profiler id="UserList" onRender={(id, phase, actualDuration) => {
  console.log(`${id} (${phase}) took ${actualDuration}ms`);
}}>
  <UserList />
</Profiler>
```

### 10.3 Support Resources

- **Documentation:** https://docs-voice.asimo.io
- **GitHub Issues:** https://github.com/mohammednazmy/VoiceAssist/issues
- **Team Slack:** #voiceassist-dev
- **Tech Lead:** [Name]

---

## Appendix: Quick Reference

### Essential Commands

```bash
# Development
pnpm dev                    # Start dev server
pnpm build                  # Build for production
pnpm test                   # Run tests
pnpm lint                   # Run linter
pnpm type-check             # TypeScript check

# Git
git checkout -b feature/VA-123-description
git commit -m "feat(scope): description"
git push origin feature/VA-123-description

# Deployment
./scripts/deploy-staging.sh
./scripts/deploy-production.sh
./scripts/rollback.sh
```

### Code Snippet Templates

Available in `.vscode/snippets.code-snippets`:

- `rfc` - React functional component
- `rhook` - React custom hook
- `rtest` - React component test
- `apitest` - API integration test

---

**Document Version:** 1.0.0
**Last Updated:** 2025-11-21
**Maintained By:** VoiceAssist Development Team

*This is a living document. Submit improvements via pull request.*
