/**
 * E2E Authentication Fixtures
 *
 * Provides authentication helpers and storage state management for Playwright tests.
 * Uses localStorage to manage auth state since the app uses zustand persist.
 */

import { test as base, Page } from "@playwright/test";

// Test credentials from environment variables
export const TEST_USER = {
  email: process.env.E2E_EMAIL || "test@example.com",
  password: process.env.E2E_PASSWORD || "TestPassword123!",
};

/**
 * Mock authentication state for the app
 * This bypasses the actual login API call by setting localStorage directly
 */
export const mockAuthState = {
  state: {
    user: {
      id: "e2e-test-user",
      email: TEST_USER.email,
      name: "E2E Test User",
      role: "user",
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    },
    tokens: {
      accessToken: "e2e-mock-access-token",
      refreshToken: "e2e-mock-refresh-token",
      expiresIn: 3600,
    },
    isAuthenticated: true,
  },
  version: 0,
};

/**
 * Set up authenticated state in the browser
 * This mimics what happens after a successful login
 */
export async function setupAuthenticatedState(page: Page): Promise<void> {
  await page.addInitScript((authState) => {
    window.localStorage.setItem("voiceassist-auth", JSON.stringify(authState));
  }, mockAuthState);
}

/**
 * Clear authentication state
 */
export async function clearAuthState(page: Page): Promise<void> {
  await page.addInitScript(() => {
    window.localStorage.removeItem("voiceassist-auth");
  });
}

/**
 * Perform actual login via the UI
 * Use this when testing the login flow itself
 */
export async function loginViaUI(
  page: Page,
  email: string = TEST_USER.email,
  password: string = TEST_USER.password
): Promise<void> {
  await page.goto("/login");
  await page.getByLabel(/email/i).fill(email);
  await page.locator("#password").fill(password);
  await page.getByRole("button", { name: /sign in/i }).click();
}

/**
 * Extended test fixture with authentication helpers
 */
export const test = base.extend<{
  authenticatedPage: Page;
}>({
  authenticatedPage: async ({ page }, use) => {
    // Set up authenticated state before navigating
    await setupAuthenticatedState(page);
    await page.goto("/");
    await use(page);
  },
});

export { expect } from "@playwright/test";
