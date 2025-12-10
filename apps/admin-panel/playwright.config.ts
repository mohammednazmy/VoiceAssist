import { defineConfig, devices } from "@playwright/test";

/**
 * Playwright E2E Configuration for Admin Panel
 * Sprint 5: E2E Test Coverage
 */

export default defineConfig({
  testDir: "./e2e",
  fullyParallel: true,
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 2 : 0,
  workers: process.env.CI ? 1 : undefined,
  reporter: "html",

  use: {
    baseURL: "http://localhost:5174",
    trace: "on-first-retry",
    screenshot: "only-on-failure",
  },

  projects: [
    {
      name: "chromium",
      use: { ...devices["Desktop Chrome"] },
    },
    // Mobile viewport for responsive testing
    {
      name: "mobile",
      use: { ...devices["iPhone 13"] },
    },
  ],

  // Run local dev server before tests
  webServer: {
    command: "pnpm dev",
    url: "http://localhost:5174",
    reuseExistingServer: !process.env.CI,
    timeout: 120000,
  },
});
