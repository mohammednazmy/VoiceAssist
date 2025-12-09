/**
 * Playwright Global Setup
 *
 * Creates authenticated state for E2E tests by:
 * 1. Setting up localStorage with mock auth tokens
 * 2. Saving browser state for reuse across tests
 */

import { chromium, type FullConfig } from "@playwright/test";
import * as fs from "fs";
import * as path from "path";

const AUTH_STATE_PATH = path.join(__dirname, ".auth-state.json");

// Test user credentials - should match a test user in the database
// or we mock the auth state directly
const TEST_USER = {
  id: "test-user-e2e-123",
  email: "e2e-test@voiceassist.dev",
  name: "E2E Test User",
};

async function globalSetup(config: FullConfig) {
  const { baseURL } = config.projects[0].use;

  // Check if we're in mock mode (no real backend auth)
  const mockMode =
    process.env.E2E_MOCK_AUTH === "true" || !process.env.E2E_AUTH_TOKEN;

  if (mockMode) {
    console.warn("[E2E Setup] Starting global setup...");
    console.warn("[E2E Setup] Mock mode - creating mock auth state");

    // Create mock auth state that the app will read from localStorage
    // Format must match Zustand persist middleware + AuthTokens interface
    const mockAuthState = {
      cookies: [],
      origins: [
        {
          origin: baseURL || "http://localhost:5173",
          localStorage: [
            {
              name: "voiceassist-auth",
              value: JSON.stringify({
                state: {
                  user: TEST_USER,
                  tokens: {
                    accessToken: "mock-access-token-for-e2e-testing",
                    refreshToken: "mock-refresh-token-for-e2e-testing",
                    expiresIn: 3600, // 1 hour in seconds
                  },
                  isAuthenticated: true,
                },
                version: 0,
              }),
            },
            {
              name: "voiceassist-language",
              value: "en",
            },
          ],
        },
      ],
    };

    // Save auth state to file
    fs.writeFileSync(AUTH_STATE_PATH, JSON.stringify(mockAuthState, null, 2));
    console.warn("[E2E Setup] Mock auth state saved to", AUTH_STATE_PATH);
    return;
  }

  // Real authentication flow
  console.warn("[E2E Setup] Starting real authentication...");
  const browser = await chromium.launch();
  const page = await browser.newPage();

  try {
    // Navigate to login
    await page.goto(`${baseURL}/login`);

    // Fill in credentials
    await page.getByLabel(/email/i).fill(process.env.E2E_TEST_EMAIL || "");
    await page
      .getByLabel(/password/i)
      .fill(process.env.E2E_TEST_PASSWORD || "");
    await page.getByRole("button", { name: /sign in/i }).click();

    // Wait for successful login (redirect to main page)
    await page.waitForURL(/^\/$|\/chat/, { timeout: 10000 });

    // Save authenticated state
    await page.context().storageState({ path: AUTH_STATE_PATH });
    console.warn("[E2E Setup] Auth state saved successfully");
  } catch (error) {
    console.error("[E2E Setup] Authentication failed:", error);
    throw error;
  } finally {
    await browser.close();
  }
}

export default globalSetup;
