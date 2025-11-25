# VoiceAssist E2E Testing Guide

This guide describes how to run, write, and generate end-to-end (E2E) tests for the VoiceAssist web application using Playwright and Auto Playwright (AI-powered test generation).

## Overview

VoiceAssist uses a multi-layered testing approach:

- **Unit Tests**: Component-level tests using Vitest (in `apps/web-app/src/__tests__/`)
- **Integration Tests**: API and service integration tests
- **E2E Tests**: Full user journey tests using Playwright (in `e2e/`)

## Prerequisites

- Node.js 18+ installed
- pnpm 8+ installed
- Playwright browsers installed

## Quick Start

```bash
# Install dependencies
pnpm install

# Install Playwright browsers (first time only)
pnpm exec playwright install --with-deps

# Run all E2E tests
pnpm test:e2e

# Run tests with UI (interactive mode)
pnpm test:e2e:ui

# Run tests in debug mode
pnpm test:e2e:debug

# View HTML report after tests
pnpm test:e2e:report
```

## Project Structure

```
VoiceAssist/
├── e2e/                          # E2E test directory
│   ├── fixtures/                 # Test fixtures and helpers
│   │   └── auth.ts               # Authentication helpers
│   ├── login.spec.ts             # Manual login tests
│   └── ai/                       # AI-generated tests
│       ├── register-user.spec.ts
│       ├── quick-consult.spec.ts
│       ├── pdf-upload.spec.ts
│       ├── voice-mode.spec.ts
│       ├── conversation-management.spec.ts
│       ├── profile-settings.spec.ts
│       ├── clinical-context.spec.ts
│       ├── export-conversation.spec.ts
│       └── accessibility.spec.ts
├── playwright.config.ts          # Playwright configuration
├── scripts/
│   └── generate-e2e-tests.js     # AI test generator script
├── playwright-report/            # HTML test reports (generated)
└── test-results/                 # Test artifacts (generated)
```

## Test Credentials Setup

E2E tests require test credentials. Set these in your `.env` file:

```bash
# E2E Test Credentials (do not commit real credentials)
E2E_BASE_URL=http://localhost:5173
E2E_EMAIL=test@example.com
E2E_PASSWORD=TestPassword123!
```

The auth fixtures in `e2e/fixtures/auth.ts` provide helpers for:

- **Mock authentication**: Set localStorage state to bypass login
- **UI-based login**: Actually fill and submit the login form
- **Clearing auth state**: Reset authentication between tests

### Using Auth Fixtures

```typescript
import { TEST_USER, setupAuthenticatedState, clearAuthState, loginViaUI } from "./fixtures/auth";

test.beforeEach(async ({ page }) => {
  // Option 1: Mock authentication (faster, no API needed)
  await setupAuthenticatedState(page);
  await page.goto("/");

  // Option 2: Login via UI (tests actual login flow)
  await loginViaUI(page);
});
```

## Configuration

The Playwright configuration is in `playwright.config.ts`:

| Setting      | Value                   | Description                               |
| ------------ | ----------------------- | ----------------------------------------- |
| `testDir`    | `./e2e`                 | Directory containing test files           |
| `baseURL`    | `http://localhost:5173` | Default app URL (or E2E_BASE_URL env var) |
| `trace`      | `on-first-retry`        | Collect trace on first retry              |
| `screenshot` | `only-on-failure`       | Screenshot on failure                     |
| `video`      | `retain-on-failure`     | Record video on failure                   |
| `timeout`    | `30000`                 | Test timeout (30s)                        |
| `retries`    | `2` (CI) / `0` (local)  | Retry count                               |

### Browser Projects

Tests run on multiple browsers and devices:

- Chromium (Desktop Chrome)
- Firefox
- WebKit (Safari)
- Mobile Chrome (Pixel 5)
- Mobile Safari (iPhone 12)

## Writing E2E Tests

### Basic Test Structure

```typescript
import { test, expect } from "@playwright/test";

test.describe("Feature Name", () => {
  test.beforeEach(async ({ page }) => {
    // Setup: Navigate to starting page
    await page.goto("/login");
  });

  test("should do something", async ({ page }) => {
    // Interact with the page
    await page.getByLabel(/email/i).fill("user@example.com");
    await page.getByLabel(/password/i).fill("password");
    await page.getByRole("button", { name: /sign in/i }).click();

    // Assert expectations
    await expect(page).toHaveURL("/");
    await expect(page.getByText("Welcome")).toBeVisible();
  });
});
```

### Best Practices

1. **Use semantic locators**: Prefer `getByRole()`, `getByLabel()`, `getByText()` over CSS selectors
2. **Wait for elements**: Use `await expect(element).toBeVisible()` before interacting
3. **Test user flows**: Focus on real user journeys, not implementation details
4. **Keep tests independent**: Each test should be able to run in isolation
5. **Use meaningful descriptions**: Test names should describe the expected behavior

### Common Patterns

#### Authentication

```typescript
// Login helper - note: use #password for password field
// (getByLabel matches multiple elements due to "Show password" button)
async function login(page: Page, email: string, password: string) {
  await page.goto("/login");
  await page.getByLabel(/email/i).fill(email);
  await page.locator("#password").fill(password); // Use ID selector for password
  await page.getByRole("button", { name: /sign in/i }).click();
  await expect(page).toHaveURL("/");
}
```

#### Common Selectors for VoiceAssist

```typescript
// Form fields
page.getByLabel(/email/i); // Email input
page.locator("#password"); // Password input (use ID)
page.getByRole("button", { name: /sign in/i }); // Sign in button
page.getByRole("button", { name: /sign up/i }); // Sign up button

// Navigation
page.getByRole("link", { name: /sign up/i }); // Registration link
page.getByRole("link", { name: /forgot/i }); // Forgot password link

// OAuth buttons
page.getByRole("button", { name: /google/i }); // Google OAuth
page.getByRole("button", { name: /microsoft/i }); // Microsoft OAuth

// Validation errors
page.locator('[role="alert"]'); // Error alert messages
page.getByText(/required/i); // Required field errors
```

#### Form Validation

```typescript
test("should show validation errors", async ({ page }) => {
  await page.getByRole("button", { name: /submit/i }).click();
  await expect(page.locator('[role="alert"]')).toBeVisible();
});
```

#### Navigation

```typescript
test("should navigate to profile", async ({ page }) => {
  await page.goto("/profile");
  await expect(page).toHaveURL("/profile");
  await expect(page.getByRole("heading", { name: /profile/i })).toBeVisible();
});
```

## AI-Powered Test Generation

VoiceAssist includes Auto Playwright for AI-powered test generation.

### Setup

1. Set your OpenAI API key:

   ```bash
   export OPENAI_API_KEY="sk-..."
   ```

2. Run the generator:
   ```bash
   pnpm generate:e2e           # Skip existing files (default)
   pnpm generate:e2e --force   # Overwrite all files
   ```

### How It Works

The generator script (`scripts/generate-e2e-tests.js`) creates test files from natural language descriptions. When `OPENAI_API_KEY` is set, it generates tests using the `auto()` function from `auto-playwright`, which interprets plain-text instructions at runtime.

**Important**: By default, the generator **skips existing files** to preserve manually edited tests. Use `--force` to regenerate all files.

### Adding New AI-Generated Tests

Edit `scripts/generate-e2e-tests.js` to add new scenarios:

```javascript
const testScenarios = [
  // ... existing scenarios
  {
    name: "My New Feature",
    filename: "my-feature.spec.ts",
    description: "User performs action X and sees result Y",
    steps: [
      "Navigate to the feature page",
      "Click the start button",
      "Fill in the form with test data",
      "Submit the form",
      "Verify the success message appears",
    ],
  },
];
```

Then regenerate tests:

```bash
pnpm generate:e2e
```

### Auto Playwright Usage in Tests

```typescript
import { test } from "@playwright/test";
import { auto } from "auto-playwright";

test("AI-powered test", async ({ page }) => {
  // Navigate manually or let auto handle it
  await page.goto("/");

  // Use natural language instructions
  await auto("Click the login button", { page, test });
  await auto("Enter email address testuser@example.com", { page, test });
  await auto("Click submit", { page, test });
  await auto("Verify the dashboard loads", { page, test });
});
```

## Running Tests

### Local Development

```bash
# Run all tests
pnpm test:e2e

# Run specific test file
pnpm exec playwright test e2e/login.spec.ts

# Run tests matching a pattern
pnpm exec playwright test -g "login"

# Run only on Chrome
pnpm exec playwright test --project=chromium

# Run in headed mode (see browser)
pnpm exec playwright test --headed

# Run in debug mode
pnpm test:e2e:debug
```

### CI/CD Integration

The GitHub Actions workflow (`.github/workflows/frontend-ci.yml`) automatically:

1. Installs dependencies and Playwright browsers
2. Generates AI tests (if OPENAI_API_KEY secret is set)
3. Runs all E2E tests
4. Uploads test reports as artifacts

Add the following secrets in your repository settings (Settings > Secrets and variables > Actions):

| Secret           | Purpose                            |
| ---------------- | ---------------------------------- |
| `OPENAI_API_KEY` | AI test generation (optional)      |
| `E2E_EMAIL`      | Test user email for login tests    |
| `E2E_PASSWORD`   | Test user password for login tests |

### Test Reports

After running tests:

```bash
# Open HTML report
pnpm test:e2e:report

# Reports are also saved to:
# - playwright-report/ (HTML)
# - test-results/results.json (JSON)
# - test-results/junit.xml (JUnit)
```

## Debugging Failed Tests

### Using Traces

When a test fails on retry, Playwright records a trace. View it:

```bash
pnpm exec playwright show-trace test-results/<test-name>/trace.zip
```

### Debug Mode

```bash
# Run specific test in debug mode
pnpm exec playwright test e2e/login.spec.ts --debug
```

### Screenshots and Videos

Failed tests automatically capture:

- Screenshots: `test-results/<test-name>/screenshot.png`
- Videos: `test-results/<test-name>/video.webm`

## Environment Variables

| Variable         | Description                      | Default                 |
| ---------------- | -------------------------------- | ----------------------- |
| `E2E_BASE_URL`   | Base URL for tests               | `http://localhost:5173` |
| `E2E_EMAIL`      | Test user email address          | `test@example.com`      |
| `E2E_PASSWORD`   | Test user password               | `TestPassword123!`      |
| `OPENAI_API_KEY` | OpenAI API key for AI generation | -                       |
| `CI`             | Set to `true` in CI environments | -                       |

**Security Note**: Never commit real credentials. Use `.env` files (gitignored) for local development and GitHub Secrets for CI.

## Troubleshooting

### Tests timing out

Increase timeout in `playwright.config.ts`:

```typescript
export default defineConfig({
  timeout: 60 * 1000, // 60 seconds
});
```

### Browser not installed

```bash
pnpm exec playwright install --with-deps
```

### Tests flaky in CI

- Add retries: `retries: 2` in config
- Use proper waits: `await expect(element).toBeVisible()`
- Check for race conditions in your app

### Auto Playwright not working

- Ensure `OPENAI_API_KEY` is set
- Check OpenAI API quota
- Review generated test code for correct selectors

## Resources

- [Playwright Documentation](https://playwright.dev/docs/intro)
- [Auto Playwright](https://github.com/lucgagan/auto-playwright)
- [VoiceAssist Development Workflow](./client-implementation/DEVELOPMENT_WORKFLOW.md)
- [WEB_APP_SPECS](./WEB_APP_SPECS.md)

## Contact

For issues with E2E tests:

1. Check the test output and logs
2. Review screenshots/videos/traces
3. Consult this guide
4. Open an issue in the repository
