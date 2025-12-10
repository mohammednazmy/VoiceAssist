---
title: Testing Guide
slug: testing-guide
summary: >-
  This guide describes how to run, write, and generate end-to-end (E2E) tests
  for the VoiceAssist web application using Playwright and Auto Playwright (...
status: stable
stability: production
owner: docs
lastUpdated: "2025-11-27"
audience:
  - frontend
  - ai-agents
tags:
  - testing
  - guide
category: testing
component: "testing/e2e"
relatedPaths:
  - "apps/web-app/playwright.config.ts"
  - "apps/web-app/e2e/example.spec.ts"
  - "apps/web-app/src/__tests__"
  - "packages/ui/vitest.config.ts"
ai_summary: >-
  This guide describes how to run, write, and generate end-to-end (E2E) tests
  for the VoiceAssist web application using Playwright and Auto Playwright
  (AI-powered test generation). VoiceAssist uses a multi-layered testing
  approach: - Unit Tests: Component-level tests using Vitest (in
  apps/web-app/s...
---

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

# Run fast Vitest tests (for development)
cd apps/web-app && pnpm test:fast
```

## Project Structure

```
VoiceAssist/
├── e2e/                          # E2E test directory
│   ├── fixtures/                 # Test fixtures and helpers
│   │   ├── auth.ts               # Authentication helpers and mock state
│   │   └── files/                # Test fixture files
│   │       └── sample-document.txt  # Sample document for upload tests
│   ├── login.spec.ts             # Manual login tests
│   ├── voice-mode-navigation.spec.ts  # [ACTIVE] Voice Mode tile → /chat flow
│   ├── voice-mode-session-smoke.spec.ts # [ACTIVE] Voice session smoke test
│   └── ai/                       # AI-generated and implemented tests
│       ├── quick-consult.spec.ts    # [ACTIVE] Chat flow tests
│       ├── clinical-context.spec.ts # [ACTIVE] Clinical context UI tests
│       ├── pdf-upload.spec.ts       # [ACTIVE] Document upload tests
│       ├── voice-mode.spec.ts       # [ACTIVE] Voice mode UI tests (legacy)
│       ├── register-user.spec.ts    # [TEMPLATE] User registration
│       ├── conversation-management.spec.ts # [TEMPLATE] Conversation CRUD
│       ├── profile-settings.spec.ts # [TEMPLATE] Profile management
│       ├── export-conversation.spec.ts # [TEMPLATE] Export functionality
│       └── accessibility.spec.ts    # [TEMPLATE] Keyboard navigation
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

## AI Template Tests

The `e2e/ai/` directory contains AI-generated test templates. **These are skipped by default** to prevent false positives in CI.

### Template Status

| File                              | Status   | Description                              |
| --------------------------------- | -------- | ---------------------------------------- |
| `quick-consult.spec.ts`           | ACTIVE   | Fully implemented - tests chat flow      |
| `clinical-context.spec.ts`        | ACTIVE   | Fully implemented - clinical context UI  |
| `pdf-upload.spec.ts`              | ACTIVE   | Fully implemented - document upload flow |
| `voice-mode.spec.ts`              | ACTIVE   | Fully implemented - voice UI elements    |
| `accessibility.spec.ts`           | TEMPLATE | Skipped - keyboard navigation            |
| `conversation-management.spec.ts` | TEMPLATE | Skipped - conversation CRUD              |
| `export-conversation.spec.ts`     | TEMPLATE | Skipped - export functionality           |
| `profile-settings.spec.ts`        | TEMPLATE | Skipped - profile management             |
| `register-user.spec.ts`           | TEMPLATE | Skipped - user registration              |

### Promoting a Template to a Real Test

To convert a template into a fully functional test:

1. **Implement all TODO steps** with actual Playwright code
2. **Add meaningful assertions** that validate expected behavior
3. **Handle edge cases** (backend unavailable, auth failures)
4. **Remove `.skip`** from `test.describe.skip` → `test.describe`
5. **Update the file header** from `STATUS: TEMPLATE` to `STATUS: IMPLEMENTED`
6. **Run locally** to verify: `pnpm test:e2e --project=chromium e2e/ai/<file>.spec.ts`

Example promotion (see `quick-consult.spec.ts` for reference):

```typescript
// Before (template)
test.describe.skip("Feature Name (template)", () => {
  test("description", async ({ page }) => {
    // TODO: Step 1: Navigate...
  });
});

// After (implemented)
test.describe("Feature Name", () => {
  test("description", async ({ page }) => {
    await page.goto("/feature");
    await expect(page.getByRole("heading")).toBeVisible();
    // ... real implementation
  });
});
```

## Voice Mode E2E Tests

VoiceAssist includes dedicated E2E tests for the Voice Mode feature. These tests verify the user journey from the Home page Voice Mode tile to the Chat page with voice capabilities.

### Voice Mode Test Files

| File                                        | Status | Description                                   |
| ------------------------------------------- | ------ | --------------------------------------------- |
| `voice-mode-navigation.spec.ts`             | ACTIVE | Tests Voice Mode tile → /chat navigation      |
| `voice-mode-session-smoke.spec.ts`          | ACTIVE | Tests "Start Voice Session" button behavior   |
| `voice-mode-voice-chat-integration.spec.ts` | ACTIVE | Tests voice panel + chat timeline integration |
| `ai/voice-mode.spec.ts`                     | ACTIVE | Legacy voice UI tests (for migration)         |

### Voice Mode Navigation Test

**File**: `e2e/voice-mode-navigation.spec.ts`

**Purpose**: Tests the complete Voice Mode navigation flow from Home to Chat.

**Test Cases**:

1. **Main Navigation Flow**:
   - User clicks Voice Mode tile on Home page
   - User is navigated to `/chat` with voice state
   - Voice Mode panel auto-opens
   - "Start Voice Session" button is visible and enabled

2. **Voice Mode Tile Branding**:
   - Verify Voice Mode tile has correct heading
   - Verify description mentions voice/hands-free
   - Check for NEW badge (optional)

3. **Keyboard Accessibility**:
   - Voice Mode tile is keyboard focusable
   - Can be activated with Enter/Space

4. **Home Page Layout**:
   - Both Voice Mode and Quick Consult tiles visible

**Run Locally**:

```bash
# Run all Voice Mode navigation tests
pnpm test:e2e voice-mode-navigation.spec.ts

# Run specific test
pnpm test:e2e voice-mode-navigation.spec.ts -g "should navigate"

# Debug mode
pnpm test:e2e voice-mode-navigation.spec.ts --debug
```

### Voice Mode Session Smoke Test

**File**: `e2e/voice-mode-session-smoke.spec.ts`

**Purpose**: Tests "Start Voice Session" button behavior without requiring live backend.

**Design Philosophy**:

This test is **tolerant of backend configuration** and only fails if the UI is completely unresponsive. It succeeds if ANY of these occur:

- Connection state indicator appears (Connecting/Connected/Error)
- Error banner/toast appears (backend unavailable)
- Voice visualizer appears
- Button changes state (disabled, loading, text change)
- Stop/Cancel button appears
- Permission dialog appears

**Backend Architecture**:

Voice Mode now uses **OpenAI Realtime API ephemeral sessions** for secure authentication:

- Backend calls `/v1/realtime/sessions` to create short-lived session tokens
- Frontend receives ephemeral token (e.g., `ek_...`) with expiration timestamp
- WebSocket connects using `openai-insecure-api-key.{ephemeral_token}` protocol
- No raw OpenAI API keys exposed to the client
- Automatic session refresh before expiry (monitored at hook level)

**Test Cases**:

1. **Response Validation** (always runs):
   - Clicks "Start Voice Session"
   - Verifies SOME UI response occurs within 10 seconds
   - Logs which response was detected
   - Fails ONLY if no UI change occurs (indicates broken button)

2. **Connection Status Visibility** (always runs):
   - Clicks "Start Voice Session"
   - Verifies connection status text is displayed
   - Status should be one of: `connecting`, `connected`, `reconnecting`, `error`, `failed`, `expired`, or `disconnected`
   - Tests that ephemeral session states are surfaced in the UI

3. **Live Backend Test** (gated by `LIVE_REALTIME_E2E=1`):
   - Connects to actual OpenAI Realtime API
   - Verifies either connected state or error message
   - Skipped by default to avoid API costs
   - Uses ephemeral session tokens (backend must have valid OPENAI_API_KEY)

**Run Locally**:

```bash
# Run smoke test (tolerant, no backend required)
pnpm test:e2e voice-mode-session-smoke.spec.ts

# Run with live backend (requires OPENAI_API_KEY)
LIVE_REALTIME_E2E=1 pnpm test:e2e voice-mode-session-smoke.spec.ts

# Debug mode
pnpm test:e2e voice-mode-session-smoke.spec.ts --debug
```

**Environment Variables**:

- `LIVE_REALTIME_E2E=1`: Enable live backend testing (costs money, requires valid OpenAI key)

### Voice Pipeline Smoke Suite

For comprehensive voice pipeline validation, use the **Voice Pipeline Smoke Suite** which covers backend, frontend unit, and E2E tests:

```bash
# Quick validation (backend + frontend + E2E)
# See docs/VOICE_MODE_PIPELINE.md for full commands

# Backend (mocked)
cd services/api-gateway && source venv/bin/activate
python -m pytest tests/integration/test_openai_config.py tests/integration/test_voice_metrics.py -v

# Frontend unit (run individually to avoid OOM)
cd apps/web-app && export NODE_OPTIONS="--max-old-space-size=768"
npx vitest run src/hooks/__tests__/useRealtimeVoiceSession.test.ts --reporter=dot

# E2E
npx playwright test e2e/voice-mode-*.spec.ts --project=chromium --reporter=list
```

For detailed pipeline architecture, metrics tracking, and complete test commands, see [VOICE_MODE_PIPELINE.md](./VOICE_MODE_PIPELINE.md).

## Thinker/Talker Transcript Validation Tests

The transcript validation suite tests STT accuracy and echo contamination using a mocked Thinker/Talker WebSocket.

### Running the Tests

```bash
# Run with mock WebSocket (deterministic, no real backend)
MOCK_WEBSOCKET_E2E=1 pnpm exec playwright test e2e/voice-transcript-validation.spec.ts --project=chromium
```

### What It Validates

1. **User transcript accuracy**: DOM transcript matches expected user text (≥0.9 overallScore)
2. **AI transcript accuracy (planned)**: Currently stubbed via deterministic mock data; stricter DOM-based assertions will be added once pipeline debug surfaces are stable
3. **Echo contamination**: User transcript is NOT polluted with AI keywords/phrases

### Mock WebSocket Details

- Intercepts connections to `/api/voice/pipeline-ws`
- Emits T/T protocol messages: `transcript.delta`, `transcript.complete`, `response.delta`, `response.complete`
- Uses deterministic test transcripts for reproducible assertions

### Utilities

- `TranscriptScorer` class in `e2e/voice/utils/transcript-scorer.ts`
  - `score(expected, actual)`: Returns accuracy metrics
  - `detectEchoContamination(userText, aiKeywords, aiFullResponse?)`: Detects AI speech leakage

### Voice Mode Test Strategy

**Deterministic Tests** (run in CI):

- ✅ Navigation flow (Voice Mode tile → /chat)
- ✅ UI element presence (panel, buttons, tiles)
- ✅ Button responsiveness (some UI change occurs)
- ✅ Connection status visibility (ephemeral session states)
- ✅ Keyboard accessibility

**Optional Live Tests** (gated by env flag):

- ⏭️ Actual WebSocket connection (requires backend)
- ⏭️ Audio capture/playback (requires permissions)
- ⏭️ OpenAI Realtime API integration (costs money)

**Not Tested** (too flaky/expensive for E2E):

- ❌ Actual voice recognition accuracy
- ❌ Real-time latency measurements
- ❌ Audio quality assessment
- ❌ Cross-browser WebRTC compatibility

### Voice Mode vs Quick Consult

Both features are tested with similar patterns:

| Feature       | Navigation Test          | Session Test                          |
| ------------- | ------------------------ | ------------------------------------- |
| Voice Mode    | `voice-mode-navigation`  | `voice-mode-session-smoke` (tolerant) |
| Quick Consult | `quick-consult` (in ai/) | Covered by chat flow tests            |

### Troubleshooting Voice Mode Tests

**Voice Mode panel not found**:

- Check that `data-testid="chat-with-voice-card"` exists on Home page
- Verify unified chat/voice feature flag is enabled (`unified_chat_voice_ui` via `/api/experiments/flags/unified_chat_voice_ui`)
- Confirm `UnifiedChatContainer` is rendering `ThinkerTalkerVoicePanel` with `data-testid="voice-mode-panel"`
- Check browser console for React errors

**Start button not responding**:

- Check if button is actually enabled (`isEnabled` check)
- Verify WebSocket connection handler exists
- Check for JavaScript errors in console

**Live tests timing out**:

- Ensure `OPENAI_API_KEY` is set and valid
- Check that backend `/voice/realtime-session` endpoint is accessible
- Verify network connectivity (no firewall blocking WebSockets)

**Permission dialogs blocking tests**:

- Tests should handle permission prompts gracefully
- Smoke test considers permission dialog as a valid response
- Use browser flags to auto-grant permissions if needed

## Writing Robust Assertions

### Avoid Always-Passing Tests

**Never use patterns like:**

```typescript
// BAD: Always passes
expect(condition || true).toBe(true);

// BAD: Empty assertion
test("should work", async ({ page }) => {
  await page.goto("/");
  // No assertions!
});
```

**Use real assertions:**

```typescript
// GOOD: Real validation
expect(stateChanged, `Expected state change but got: ${debugInfo}`).toBe(true);

// GOOD: Verify actual behavior
await expect(page.getByText("Success")).toBeVisible();
```

### Login Test Pattern

The login test (`e2e/login.spec.ts`) validates form submission by checking for ANY of:

- Navigation away from `/login`
- Error alert or toast appears
- Button changes to loading state
- Network request was made to auth endpoint

```typescript
// Real assertion with network tracking
page.on("request", (req) => {
  if (req.url().includes("/auth")) loginRequestMade = true;
});

const stateChanged = !isStillOnLogin || hasAlert || hasToast || isButtonDisabled || loginRequestMade;

expect(stateChanged, "Form submission must trigger some response").toBe(true);
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
2. Runs all E2E tests (templates are skipped)
3. Uploads test reports as artifacts

**Note:** AI test generation is disabled by default in CI to avoid OpenAI API costs. To enable it, set the repository variable `CI_GENERATE_AI_TESTS=true` in Settings > Secrets and variables > Actions > Variables.

Add the following secrets in your repository settings (Settings > Secrets and variables > Actions):

| Secret           | Purpose                                          |
| ---------------- | ------------------------------------------------ |
| `E2E_EMAIL`      | Test user email for login tests (required)       |
| `E2E_PASSWORD`   | Test user password for login tests (required)    |
| `OPENAI_API_KEY` | AI test generation (optional, needs var enabled) |

| Variable               | Purpose                                    |
| ---------------------- | ------------------------------------------ |
| `CI_GENERATE_AI_TESTS` | Set to `true` to enable AI test generation |

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
