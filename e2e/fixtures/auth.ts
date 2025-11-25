/**
 * E2E Authentication Fixtures
 *
 * Provides authentication helpers and storage state management for Playwright tests.
 * Uses localStorage to manage auth state since the app uses zustand persist.
 */

import { test as base, Page, expect } from "@playwright/test";

// Test credentials from environment variables
export const TEST_USER = {
  email: process.env.E2E_EMAIL || "test@example.com",
  password: process.env.E2E_PASSWORD || "TestPassword123!",
};

/**
 * Mock authentication state for the app
 * This bypasses the actual login API call by setting localStorage directly
 *
 * The state structure must match what Zustand persist expects:
 * - state: The actual store state (partialized fields + _hasHydrated)
 * - version: Schema version for migrations
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
    // Important: Mark as hydrated so ProtectedRoute doesn't wait forever
    _hasHydrated: true,
  },
  version: 0,
};

/**
 * Set up authenticated state in the browser using addInitScript
 * The script runs before page scripts on every navigation
 */
export async function setupAuthenticatedState(page: Page): Promise<void> {
  await page.addInitScript((authState) => {
    window.localStorage.setItem("voiceassist-auth", JSON.stringify(authState));
  }, mockAuthState);
}

/**
 * Set up authenticated state and ensure it's hydrated
 * This is the recommended approach for tests that need to access protected routes
 *
 * The storageState is pre-configured in playwright.config.ts to load auth from
 * e2e/.auth/user.json. We also mock API calls to prevent 401 responses from
 * triggering the app's logout logic.
 */
export async function setupAndHydrateAuth(page: Page): Promise<void> {
  // Mock API responses to prevent 401 errors from triggering logout
  await mockApiResponses(page);

  // Navigate to root - storageState should already have auth in localStorage
  await page.goto("/");
  await page.waitForLoadState("networkidle");

  // Wait for React to fully render and Zustand to hydrate from localStorage
  await page.waitForTimeout(500);

  // Verify we're NOT on the login page
  const currentUrl = page.url();
  if (currentUrl.includes("/login")) {
    throw new Error(
      "[E2E Auth] Authentication failed - landed on login page. " +
      "Check that e2e/.auth/user.json exists and is correctly configured in playwright.config.ts"
    );
  }
}

/**
 * Mock API responses to prevent 401 errors from triggering the logout cascade
 *
 * Uses a single catch-all route handler with URL checking to avoid issues with
 * Playwright's glob pattern matching not catching query strings properly.
 */
async function mockApiResponses(page: Page): Promise<void> {
  // Track created conversation ID for consistent responses
  let createdConversationId = `e2e-conv-${Date.now()}`;

  // Single route handler that intercepts ALL requests and filters by URL
  await page.route("**/*", async (route) => {
    const url = route.request().url();
    const method = route.request().method();

    // Only intercept external API calls (not Vite module requests to localhost:5173)
    if (!url.includes("/api/") || url.includes("localhost:5173")) {
      await route.continue();
      return;
    }

    // Skip WebSocket upgrade requests
    if (route.request().headers()["upgrade"] === "websocket") {
      await route.continue();
      return;
    }

    // Parse the URL to get the pathname
    const parsedUrl = new URL(url);
    const pathname = parsedUrl.pathname;

    // Route: POST /api/conversations (create new conversation)
    if (pathname === "/api/conversations" && method === "POST") {
      await route.fulfill({
        status: 201,
        contentType: "application/json",
        body: JSON.stringify({
          data: {
            id: createdConversationId,
            title: "New Conversation",
            created_at: new Date().toISOString(),
            updated_at: new Date().toISOString(),
            user_id: "e2e-test-user",
          },
        }),
      });
      return;
    }

    // Route: GET /api/conversations (list conversations)
    if (pathname === "/api/conversations" && method === "GET") {
      await route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify({
          data: [],
          total: 0,
          page: 1,
          limit: 50,
        }),
      });
      return;
    }

    // Route: GET /api/conversations/:id (get single conversation)
    const conversationMatch = pathname.match(/^\/api\/conversations\/([^/]+)$/);
    if (conversationMatch && method === "GET") {
      const convId = conversationMatch[1];
      await route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify({
          data: {
            id: convId,
            title: "Test Conversation",
            created_at: new Date().toISOString(),
            updated_at: new Date().toISOString(),
            user_id: "e2e-test-user",
          },
        }),
      });
      return;
    }

    // Route: GET /api/conversations/:id/messages (get messages)
    const messagesMatch = pathname.match(/^\/api\/conversations\/([^/]+)\/messages$/);
    if (messagesMatch && method === "GET") {
      await route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify({
          data: [],
          total: 0,
          page: 1,
          limit: 50,
        }),
      });
      return;
    }

    // Route: GET /api/conversations/:id/branches
    const branchesMatch = pathname.match(/^\/api\/conversations\/([^/]+)\/branches$/);
    if (branchesMatch && method === "GET") {
      await route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify({
          data: [],
        }),
      });
      return;
    }

    // Route: GET /api/clinical-contexts/*
    if (pathname.startsWith("/api/clinical-contexts")) {
      await route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify({
          data: null,
        }),
      });
      return;
    }

    // Route: GET /api/auth/me (user profile)
    if (pathname === "/api/auth/me" && method === "GET") {
      await route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify({
          data: {
            id: "e2e-test-user",
            email: TEST_USER.email,
            name: "E2E Test User",
            role: "user",
            createdAt: new Date().toISOString(),
            updatedAt: new Date().toISOString(),
          },
        }),
      });
      return;
    }

    // Route: POST /api/auth/refresh
    if (pathname === "/api/auth/refresh" && method === "POST") {
      await route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify({
          data: {
            accessToken: "e2e-mock-refreshed-token",
            refreshToken: "e2e-mock-refresh-token",
            expiresIn: 3600,
          },
        }),
      });
      return;
    }

    // Default: Return success for any other API endpoint
    await route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({ data: null, success: true }),
    });
  });
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
 * Uses setupAndHydrateAuth to ensure Zustand has time to hydrate from localStorage
 */
export const test = base.extend<{
  authenticatedPage: Page;
}>({
  authenticatedPage: async ({ page }, use) => {
    // Set up authenticated state and wait for hydration
    await setupAndHydrateAuth(page);
    await use(page);
  },
});

export { expect } from "@playwright/test";
