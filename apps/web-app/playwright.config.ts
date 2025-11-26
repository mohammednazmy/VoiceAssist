/**
 * Playwright Configuration for VoiceAssist Web App E2E Tests
 *
 * Phase 4 - Auth UX + E2E Smoke Tests
 *
 * Run tests: npx playwright test
 * Run with UI: npx playwright test --ui
 */

import { defineConfig, devices } from "@playwright/test";

// Target the dev.asimo.io environment or local dev server
const baseURL = process.env.E2E_BASE_URL || "http://localhost:5173";

export default defineConfig({
  testDir: "./e2e",
  fullyParallel: true,
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 2 : 0,
  workers: process.env.CI ? 1 : undefined,
  reporter: "html",
  timeout: 30000,

  use: {
    baseURL,
    trace: "on-first-retry",
    screenshot: "only-on-failure",
    video: "retain-on-failure",
  },

  projects: [
    {
      name: "chromium",
      use: { ...devices["Desktop Chrome"] },
    },
  ],

  // Start local dev server before running tests (only if not targeting remote)
  webServer: baseURL.includes("localhost")
    ? {
        command: "npm run dev",
        url: baseURL,
        reuseExistingServer: !process.env.CI,
        timeout: 120000,
      }
    : undefined,
});
