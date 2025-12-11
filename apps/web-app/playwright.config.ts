/**
 * Playwright Configuration for VoiceAssist Web App E2E Tests
 *
 * Phase 4 - Auth UX + E2E Smoke Tests
 *
 * Run tests: npx playwright test
 * Run with UI: npx playwright test --ui
 * Run authenticated: E2E_MOCK_AUTH=true npx playwright test
 */

import { defineConfig, devices } from "@playwright/test";
import path from "path";

// Target the localhost:5173 environment or local dev server
const baseURL = process.env.E2E_BASE_URL || "http://localhost:5173";
const _apiURL = process.env.E2E_API_URL || "http://localhost:8200";

// Auth state file path
const AUTH_STATE_PATH = path.join(__dirname, "e2e", ".auth-state.json");

export default defineConfig({
  testDir: "./e2e",
  fullyParallel: true,
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 2 : 0,
  workers: process.env.CI ? 1 : undefined,
  reporter: "html",
  timeout: 30000,

  // Global setup for authentication
  globalSetup: "./e2e/global-setup.ts",

  use: {
    baseURL,
    trace: "on-first-retry",
    screenshot: "only-on-failure",
    video: "retain-on-failure",
  },

  projects: [
    // Unauthenticated tests (login, register, etc.)
    {
      name: "unauthenticated",
      testMatch: /auth\.spec\.ts/,
      use: { ...devices["Desktop Chrome"] },
    },
    // Authenticated tests (voice mode, chat, etc.)
    {
      name: "chromium",
      testIgnore: /auth\.spec\.ts/,
      use: {
        ...devices["Desktop Chrome"],
        storageState: AUTH_STATE_PATH,
      },
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
