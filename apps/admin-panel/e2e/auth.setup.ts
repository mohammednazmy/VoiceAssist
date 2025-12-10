import { test as setup, expect } from "@playwright/test";

/**
 * Authentication setup for E2E tests
 * Creates authenticated state for admin and viewer roles
 */

const STORAGE_STATE = "e2e/.auth/admin.json";
const VIEWER_STORAGE_STATE = "e2e/.auth/viewer.json";

// Mock admin credentials (for testing with mock API)
const ADMIN_EMAIL = "admin@test.com";
const ADMIN_PASSWORD = "testpassword";

const VIEWER_EMAIL = "viewer@test.com";
const VIEWER_PASSWORD = "testpassword";

setup("authenticate as admin", async ({ page }) => {
  // Navigate to login page
  await page.goto("/login");

  // Fill in credentials
  await page.fill('input[type="email"], input[name="email"]', ADMIN_EMAIL);
  await page.fill(
    'input[type="password"], input[name="password"]',
    ADMIN_PASSWORD,
  );

  // Submit login form
  await page.click('button[type="submit"]');

  // Wait for redirect to dashboard
  await expect(page).toHaveURL(/dashboard/, { timeout: 10000 });

  // Store authenticated state
  await page.context().storageState({ path: STORAGE_STATE });
});

setup("authenticate as viewer", async ({ page }) => {
  await page.goto("/login");
  await page.fill('input[type="email"], input[name="email"]', VIEWER_EMAIL);
  await page.fill(
    'input[type="password"], input[name="password"]',
    VIEWER_PASSWORD,
  );
  await page.click('button[type="submit"]');
  await expect(page).toHaveURL(/dashboard/, { timeout: 10000 });
  await page.context().storageState({ path: VIEWER_STORAGE_STATE });
});
