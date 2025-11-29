import { defineConfig, devices } from '@playwright/test';

/**
 * Playwright Configuration for VoiceAssist E2E Tests
 *
 * Based on DEVELOPMENT_WORKFLOW.md specifications
 * @see https://playwright.dev/docs/test-configuration
 */
export default defineConfig({
  testDir: './e2e',

  /* Global setup for authentication */
  globalSetup: require.resolve('./e2e/global-setup'),

  /* Run tests in files in parallel */
  fullyParallel: true,

  /* Fail the build on CI if you accidentally left test.only in the source code */
  forbidOnly: !!process.env.CI,

  /* Retry on CI only */
  retries: process.env.CI ? 2 : 0,

  /* Opt out of parallel tests on CI */
  workers: process.env.CI ? 1 : undefined,

  /* Reporter to use */
  reporter: [
    ['html', { outputFolder: 'playwright-report' }],
    ['json', { outputFile: 'test-results/results.json' }],
    ['junit', { outputFile: 'test-results/junit.xml' }],
  ],

  /* Shared settings for all the projects below */
  use: {
    /* Base URL to use in actions like `await page.goto('/')` */
    baseURL: process.env.E2E_BASE_URL || 'http://localhost:5173',

    /* Collect trace when retrying the failed test */
    trace: 'on-first-retry',

    /* Capture screenshot only on failure */
    screenshot: 'only-on-failure',

    /* Record video only on failure and retain it */
    video: 'retain-on-failure',

    /* Maximum time each action such as `click()` can take */
    actionTimeout: 10000,

    /* Maximum time navigation can take */
    navigationTimeout: 30000,
  },

  /* Configure projects for major browsers and mobile viewports */
  projects: [
    {
      name: 'chromium',
      use: {
        ...devices['Desktop Chrome'],
        // Use pre-populated auth state for authenticated tests
        storageState: 'e2e/.auth/user.json',
      },
    },

    {
      name: 'firefox',
      use: { ...devices['Desktop Firefox'] },
    },

    {
      name: 'webkit',
      use: { ...devices['Desktop Safari'] },
    },

    /* Test against mobile viewports */
    {
      name: 'Mobile Chrome',
      use: { ...devices['Pixel 5'] },
    },
    {
      name: 'Mobile Safari',
      use: { ...devices['iPhone 12'] },
    },

    {
      name: 'smoke-gateway',
      testMatch: /smoke-.*\.spec\.ts/,
      use: {
        baseURL: process.env.CLIENT_GATEWAY_URL || 'http://localhost:8080',
      },
    },

    /* Voice E2E tests - Live backend (requires LIVE_REALTIME_E2E=1) */
    {
      name: 'voice-live',
      testDir: './e2e/voice',
      testMatch: /voice-.*\.spec\.ts/,
      use: {
        ...devices['Desktop Chrome'],
        permissions: ['microphone'],
        launchOptions: {
          args: [
            '--use-fake-ui-for-media-stream',
            '--use-fake-device-for-media-stream',
          ],
        },
        storageState: 'e2e/.auth/user.json',
      },
      timeout: 90 * 1000, // 90 seconds for live API calls
    },

    /* Voice E2E tests - Mobile viewports */
    {
      name: 'voice-mobile-iphone',
      testDir: './e2e/voice',
      testMatch: /voice-mobile\.spec\.ts/,
      use: {
        ...devices['iPhone 13'],
        permissions: ['microphone'],
        launchOptions: {
          args: [
            '--use-fake-ui-for-media-stream',
            '--use-fake-device-for-media-stream',
          ],
        },
      },
      timeout: 60 * 1000,
    },
    {
      name: 'voice-mobile-pixel',
      testDir: './e2e/voice',
      testMatch: /voice-mobile\.spec\.ts/,
      use: {
        ...devices['Pixel 5'],
        permissions: ['microphone'],
        launchOptions: {
          args: [
            '--use-fake-ui-for-media-stream',
            '--use-fake-device-for-media-stream',
          ],
        },
      },
      timeout: 60 * 1000,
    },
  ],

  /* Run your local dev server before starting the tests */
  webServer: {
    command: 'pnpm dev',
    url: 'http://localhost:5173',
    reuseExistingServer: !process.env.CI,
    timeout: 120 * 1000,
  },

  /* Folder for test artifacts such as screenshots, videos, traces, etc. */
  outputDir: 'test-results/',

  /* Maximum time one test can run */
  timeout: 30 * 1000,

  /* Expect timeout */
  expect: {
    timeout: 5000,
  },
});
