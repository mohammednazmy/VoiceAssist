# Contributing to VoiceAssist

Thank you for your interest in contributing to VoiceAssist! This document provides guidelines and best practices for contributing to the project.

## Table of Contents

- [Code of Conduct](#code-of-conduct)
- [Getting Started](#getting-started)
- [Development Workflow](#development-workflow)
- [Code Style](#code-style)
- [Testing Requirements](#testing-requirements)
- [Pull Request Process](#pull-request-process)
- [Security and Privacy](#security-and-privacy)
- [Documentation](#documentation)

---

## Code of Conduct

This project adheres to professional standards of conduct. We expect all contributors to:

- Be respectful and inclusive
- Focus on constructive feedback
- Prioritize the best interests of the project and its users
- Maintain confidentiality regarding security issues

---

## Getting Started

### 1. Fork and Clone

```bash
# Fork the repository on GitHub, then clone your fork
git clone git@github.com:YOUR_USERNAME/VoiceAssist.git
cd VoiceAssist

# Add upstream remote
git remote add upstream git@github.com:mohammednazmy/VoiceAssist.git
```

### 2. Set Up Development Environment

Follow the complete setup instructions in [docs/LOCAL_DEVELOPMENT.md](docs/LOCAL_DEVELOPMENT.md).

Quick setup:

```bash
# Backend
cd services/api-gateway
python3 -m venv venv
source venv/bin/activate
pip install -r requirements.txt

# Frontend
cd ../..
pnpm install

# Validate environment
make check-env
```

### 3. Keep Your Fork Updated

```bash
git fetch upstream
git checkout main
git merge upstream/main
git push origin main
```

---

## Development Workflow

### Branching Strategy

We use a feature branch workflow:

```bash
# Create a feature branch from main
git checkout main
git pull upstream main
git checkout -b feature/your-feature-name

# Or for bug fixes
git checkout -b fix/bug-description
```

Branch naming conventions:

- `feature/` - New features
- `fix/` - Bug fixes
- `docs/` - Documentation updates
- `refactor/` - Code refactoring
- `test/` - Test improvements
- `chore/` - Build, tooling, dependencies

### Making Changes

1. **Keep changes focused** - One feature or fix per branch
2. **Write clear commit messages**:

   ```
   feat: add user profile page

   - Created ProfilePage component
   - Added profile update API endpoint
   - Added unit tests for profile service

   Closes #123
   ```

3. **Commit message format**:
   - `feat:` - New feature
   - `fix:` - Bug fix
   - `docs:` - Documentation only
   - `style:` - Formatting, missing semicolons, etc.
   - `refactor:` - Code refactoring
   - `test:` - Adding tests
   - `chore:` - Build, dependencies, tooling

4. **Commit early and often** - Small, logical commits are easier to review

### Before Opening a PR

Run these checks locally to ensure CI will pass:

```bash
# 1. Validate environment
make check-env

# 2. Run all tests
make test           # Backend tests (pytest)
pnpm test           # Frontend tests (runs Vitest in non-watch mode)

# 3. Run linters
make lint           # Backend (flake8, black, isort)
pnpm lint           # Frontend (ESLint)

# 4. Run type checking
make type-check     # Backend (mypy)
pnpm type-check     # Frontend (TypeScript)

# 5. Run pre-commit hooks
pre-commit run --all-files

# 6. Run security scans
make bandit
```

**Note on frontend tests**:

- `pnpm test` - Runs tests once and exits (used in CI)
- `pnpm test:watch` - Runs tests in interactive watch mode (for local development)
- Tests use jsdom 24.1.3 (downgraded from 27.2.0 to fix initialization hang)
- Some tests have known failures - see KNOWN_ISSUES.md for details

---

## Code Style

### Python (Backend)

We follow PEP 8 with these tools enforcing style:

- **Black** (code formatter)
- **isort** (import sorting)
- **flake8** (linting)
- **mypy** (type checking, optional but recommended)

Configuration is in:

- `.flake8`
- `pyproject.toml`
- `.isort.cfg`

**Type Hints**: Use type hints for all function signatures:

```python
from typing import Optional, List, Dict, Any

def get_user(user_id: str) -> Optional[User]:
    """Get user by ID."""
    pass

async def list_users(
    skip: int = 0,
    limit: int = 100
) -> List[User]:
    """List users with pagination."""
    pass
```

**Docstrings**: Use Google-style docstrings:

```python
def process_query(
    query: str,
    context: Optional[Dict[str, Any]] = None
) -> QueryResult:
    """Process a user query and return results.

    Args:
        query: The user's query string
        context: Optional context dictionary for the query

    Returns:
        QueryResult containing the processed response

    Raises:
        ValidationError: If query is invalid
        ProcessingError: If query processing fails
    """
    pass
```

### TypeScript/JavaScript (Frontend)

We use:

- **Prettier** (code formatting)
- **ESLint** (linting)
- **TypeScript** (type safety)

Configuration is in:

- `.prettierrc`
- `.eslintrc.js`
- `tsconfig.json`

**Type Safety**: Always use TypeScript, avoid `any`:

```typescript
// Good
interface User {
  id: string;
  email: string;
  role: "user" | "admin";
}

function getUser(id: string): Promise<User> {
  return apiClient.get<User>(`/users/${id}`);
}

// Avoid
function getUser(id: any): Promise<any> {
  return apiClient.get(`/users/${id}`);
}
```

**Component Structure**: Use functional components with hooks:

```typescript
interface ProfilePageProps {
  userId: string;
}

export function ProfilePage({ userId }: ProfilePageProps) {
  const [user, setUser] = useState<User | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    loadUser();
  }, [userId]);

  const loadUser = async () => {
    // Implementation
  };

  return (
    <div>
      {/* JSX */}
    </div>
  );
}
```

### Editor Configuration

We use `.editorconfig` to maintain consistent formatting across editors:

```ini
[*]
end_of_line = lf
insert_final_newline = true
charset = utf-8
indent_style = space
indent_size = 2

[*.py]
indent_size = 4

[Makefile]
indent_style = tab
```

Ensure your editor respects `.editorconfig`.

---

## Testing Requirements

### Backend Tests

Tests are required for:

- **All new API endpoints**
- **Business logic functions**
- **Database operations**
- **Authentication/authorization flows**

Test structure:

```
services/api-gateway/tests/
├── unit/              # Unit tests (fast, isolated)
│   ├── test_auth.py
│   ├── test_api_envelope.py
│   └── test_rag_service.py
├── e2e/               # End-to-end tests (slower, integrated)
│   ├── test_auth_flow.py
│   └── test_query_flow.py
└── conftest.py        # Shared fixtures
```

Example test:

```python
import pytest
from app.core.security import create_access_token, verify_token

def test_create_and_verify_access_token():
    """Test JWT token creation and verification."""
    payload = {"sub": "user@example.com", "role": "user"}
    token = create_access_token(payload)

    assert token is not None
    assert isinstance(token, str)

    decoded = verify_token(token)
    assert decoded["sub"] == "user@example.com"
    assert decoded["role"] == "user"
    assert decoded["type"] == "access"
```

### Frontend Tests

Use Vitest for unit tests and React Testing Library for component tests:

```typescript
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { LoginPage } from './LoginPage';
import { describe, it, expect, vi } from 'vitest';

describe('LoginPage', () => {
  it('should submit login form with valid credentials', async () => {
    const mockLogin = vi.fn();
    render(<LoginPage onLogin={mockLogin} />);

    fireEvent.change(screen.getByLabelText(/email/i), {
      target: { value: 'user@example.com' }
    });
    fireEvent.change(screen.getByLabelText(/password/i), {
      target: { value: 'password123' }
    });

    fireEvent.click(screen.getByRole('button', { name: /sign in/i }));

    await waitFor(() => {
      expect(mockLogin).toHaveBeenCalledWith({
        email: 'user@example.com',
        password: 'password123'
      });
    });
  });
});
```

### Test Coverage

Aim for:

- **Backend**: 80%+ overall, 90%+ for critical paths (auth, data handling)
- **Frontend**: 70%+ for shared packages, 60%+ for apps

Check coverage:

```bash
# Backend
cd services/api-gateway
pytest --cov=app --cov-report=html
open htmlcov/index.html

# Frontend
pnpm test:coverage
```

---

## Pull Request Process

### 1. Prepare Your PR

- [ ] All tests pass locally
- [ ] All linters pass
- [ ] Type checking passes
- [ ] Pre-commit hooks pass
- [ ] New tests added for new features
- [ ] Documentation updated (if needed)
- [ ] Changelog updated (for user-facing changes)

### 2. Open the Pull Request

```bash
git push origin feature/your-feature-name
```

Then open a PR on GitHub with:

**Title**: Clear, concise description (e.g., "feat: add user profile management")

**Description template**:

```markdown
## Description

Brief description of what this PR does.

## Changes

- List of specific changes
- Bullet points for clarity

## Testing

- [ ] Unit tests added/updated
- [ ] E2E tests added/updated (if applicable)
- [ ] Manual testing performed

## Screenshots (if UI changes)

![Screenshot](url)

## Related Issues

Closes #123
Relates to #456

## Checklist

- [ ] Tests pass
- [ ] Linters pass
- [ ] Documentation updated
- [ ] CHANGELOG updated (if user-facing)
```

### 3. Code Review

- Address all review comments
- Keep discussions focused and professional
- Make requested changes in new commits (don't force-push during review)
- Mark conversations as resolved once addressed

### 4. Merge

Once approved and all CI checks pass:

- We typically use **squash merging** to keep main branch history clean
- Ensure the squash commit message is clear and follows conventions
- Delete your branch after merging

---

## Security and Privacy

### Secrets Management

**NEVER commit:**

- API keys
- Passwords
- Private keys
- SSL certificates
- `.env` files with real values

Use `.env.example` as a template with placeholder values.

**Check before commit:**

```bash
git diff --staged  # Review what you're committing
```

### HIPAA and PHI

This is a healthcare application. Be extremely careful with Protected Health Information (PHI):

- **Never log PHI** - Don't include patient data in logs
- **Never commit test data with PHI** - Use synthetic/fake data only
- **Sanitize examples** - Redact any real data in documentation or bug reports
- **Encrypt sensitive data** - Follow encryption standards in codebase

### Security Issues

**DO NOT** open public GitHub issues for security vulnerabilities.

Instead:

1. Email security concerns to: [INSERT EMAIL]
2. Include detailed description and reproduction steps
3. We'll respond within 48 hours

---

## Documentation

### When to Update Docs

Update documentation when you:

- Add a new feature
- Change API contracts
- Modify configuration requirements
- Update deployment procedures
- Change development setup

### Documentation Locations

- **API docs**: Auto-generated from code (`/docs` endpoint)
- **Architecture**: `docs/UNIFIED_ARCHITECTURE.md`
- **Setup**: `docs/DEVELOPMENT_SETUP.md`
- **Deployment**: `docs/DEPLOYMENT_GUIDE.md`
- **Client implementation**: `docs/client-implementation/`
- **README**: `README.md` (high-level overview)

### Inline Documentation

- **Python**: Use Google-style docstrings
- **TypeScript**: Use JSDoc comments

```python
def calculate_similarity(
    query_embedding: List[float],
    document_embedding: List[float]
) -> float:
    """Calculate cosine similarity between two embeddings.

    Args:
        query_embedding: Query vector embedding
        document_embedding: Document vector embedding

    Returns:
        Similarity score between 0 and 1

    Example:
        >>> query_emb = [0.1, 0.2, 0.3]
        >>> doc_emb = [0.2, 0.3, 0.4]
        >>> similarity = calculate_similarity(query_emb, doc_emb)
        >>> print(f"Similarity: {similarity:.2f}")
    """
```

````typescript
/**
 * Fetch user profile data
 *
 * @param userId - The unique user identifier
 * @returns Promise resolving to User object
 * @throws {NotFoundError} If user doesn't exist
 *
 * @example
 * ```typescript
 * const user = await fetchUser('user-123');
 * console.log(user.email);
 * ```
 */
async function fetchUser(userId: string): Promise<User> {
  // Implementation
}
````

---

## Questions or Issues?

- **General questions**: Open a GitHub Discussion
- **Bug reports**: Open a GitHub Issue (use bug template)
- **Feature requests**: Open a GitHub Issue (use feature template)
- **Security issues**: Email security team (DO NOT open public issue)

---

Thank you for contributing to VoiceAssist! 🎉
