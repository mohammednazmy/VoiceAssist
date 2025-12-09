import { defineConfig, devices } from '@playwright/test';
import * as path from 'path';

/**
 * Playwright Configuration for VoiceAssist E2E Tests
 *
 * Based on DEVELOPMENT_WORKFLOW.md specifications
 * @see https://playwright.dev/docs/test-configuration
 */

// Audio fixture paths for real voice testing
const AUDIO_FIXTURES = {
  hello: path.resolve(__dirname, 'e2e/fixtures/audio/hello.wav'),
  bargeIn: path.resolve(__dirname, 'e2e/fixtures/audio/barge-in.wav'),
  conversationStart: path.resolve(__dirname, 'e2e/fixtures/audio/conversation-start.wav'),
  followUp: path.resolve(__dirname, 'e2e/fixtures/audio/follow-up.wav'),
  yes: path.resolve(__dirname, 'e2e/fixtures/audio/yes.wav'),
  // Two-phase audio: conversation-start (3.19s) + 10s silence + barge-in (2.21s) = 15.4s total
  // This gives AI time to respond before the "interruption" phase
  twoPhaseBargeIn: path.resolve(__dirname, 'e2e/fixtures/audio/two-phase-barge-in.wav'),
};

// Get audio file from environment variable or default to hello
const getAudioFile = () => {
  const audioType = process.env.VOICE_AUDIO_TYPE || 'hello';
  return AUDIO_FIXTURES[audioType as keyof typeof AUDIO_FIXTURES] || AUDIO_FIXTURES.hello;
};

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
            `--use-file-for-fake-audio-capture=${getAudioFile()}`,
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
            `--use-file-for-fake-audio-capture=${getAudioFile()}`,
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

    /* Voice E2E tests with REAL audio injection */
    /* These tests use actual speech audio files to simulate real user voice */
    /* Run with: LIVE_REALTIME_E2E=1 npx playwright test --project=voice-real-audio */
    {
      name: 'voice-real-audio',
      testDir: './e2e/voice',
      testMatch: /voice-real-audio\.spec\.ts/,
      use: {
        ...devices['Desktop Chrome'],
        permissions: ['microphone'],
        launchOptions: {
          args: [
            '--use-fake-ui-for-media-stream',
            '--use-fake-device-for-media-stream',
            `--use-file-for-fake-audio-capture=${getAudioFile()}`,
          ],
        },
        storageState: 'e2e/.auth/user.json',
        // Capture all console logs for debugging VAD thresholds
        contextOptions: {
          recordVideo: { dir: 'test-results/videos' },
        },
      },
      timeout: 120 * 1000, // 2 minutes for real conversation flow
    },

    /* Barge-in specific tests with question audio that triggers AI response */
    /* IMPORTANT: Must use audio with a QUESTION (not interruption command) so AI speaks first.
     * Chrome loops the audio, so after AI responds, the looped audio becomes the interruption.
     * Using barge-in.wav ("Stop! Wait a moment please") fails because it doesn't trigger AI speech. */
    {
      name: 'voice-barge-in',
      testDir: './e2e/voice',
      testMatch: /voice-barge-in\.spec\.ts/,
      use: {
        ...devices['Desktop Chrome'],
        permissions: ['microphone'],
        launchOptions: {
          args: [
            '--use-fake-ui-for-media-stream',
            '--use-fake-device-for-media-stream',
            // Use conversation-start (contains question) instead of barge-in (contains stop command)
            `--use-file-for-fake-audio-capture=${AUDIO_FIXTURES.conversationStart}`,
          ],
        },
        storageState: 'e2e/.auth/user.json',
        contextOptions: {
          recordVideo: { dir: 'test-results/videos' },
        },
      },
      timeout: 90 * 1000,
    },

    /* Realistic Barge-in Tests - Tests that FAIL when barge-in doesn't work in production */
    /* These tests verify:
     * 1. AI must actually be PLAYING audio (isPlaying=true) before testing barge-in
     * 2. Audio must IMMEDIATELY stop when user speaks
     * 3. Pipeline must transition to listening state
     * If barge-in works in tests but not production, these tests should expose the issue. */
    {
      name: 'voice-barge-in-realistic',
      testDir: './e2e/voice',
      testMatch: /voice-barge-in-realistic\.spec\.ts/,
      use: {
        ...devices['Desktop Chrome'],
        permissions: ['microphone'],
        launchOptions: {
          args: [
            '--use-fake-ui-for-media-stream',
            '--use-fake-device-for-media-stream',
            `--use-file-for-fake-audio-capture=${AUDIO_FIXTURES.conversationStart}`,
          ],
        },
        storageState: 'e2e/.auth/user.json',
        contextOptions: {
          recordVideo: { dir: 'test-results/videos' },
        },
      },
      timeout: 120 * 1000, // 2 minutes for comprehensive barge-in tests
    },

    /* Two-Phase Barge-in Tests - Uses structured audio with silence gap
     * Audio structure: conversation-start (3.19s) + 10s silence + barge-in (2.21s) = 15.4s
     * Phase 1: User asks a question, AI responds, AI starts playing audio
     * Phase 2 (after 10s silence): User interrupts with "Stop!" - triggers barge-in
     * This approach ensures AI has time to generate and play audio before interruption */
    {
      name: 'voice-barge-in-two-phase',
      testDir: './e2e/voice',
      testMatch: /voice-barge-in-two-phase\.spec\.ts/,
      use: {
        ...devices['Desktop Chrome'],
        permissions: ['microphone'],
        launchOptions: {
          args: [
            '--use-fake-ui-for-media-stream',
            '--use-fake-device-for-media-stream',
            `--use-file-for-fake-audio-capture=${AUDIO_FIXTURES.twoPhaseBargeIn}`,
          ],
        },
        storageState: 'e2e/.auth/user.json',
        contextOptions: {
          recordVideo: { dir: 'test-results/videos' },
        },
      },
      timeout: 120 * 1000, // 2 minutes for two-phase barge-in tests
    },

    /* Voice Smoke Tests - Fast critical path tests for PR validation (~5 min) */
    /* Run with: npx playwright test --project=voice-smoke */
    {
      name: 'voice-smoke',
      testDir: './e2e/voice',
      testMatch: /voice-flag-matrix\.spec\.ts/,
      timeout: 180 * 1000, // 3 minutes per test
      retries: 1,
      use: {
        ...devices['Desktop Chrome'],
        permissions: ['microphone'],
        launchOptions: {
          args: [
            '--use-fake-ui-for-media-stream',
            '--use-fake-device-for-media-stream',
            `--use-file-for-fake-audio-capture=${getAudioFile()}`,
          ],
        },
        storageState: 'e2e/.auth/user.json',
      },
    },

    /* Voice Nightly Tests - Comprehensive flag matrix (~30 min) */
    /* Run with: VOICE_MATRIX_NIGHTLY=1 npx playwright test --project=voice-nightly */
    {
      name: 'voice-nightly',
      testDir: './e2e/voice',
      testMatch: /voice-flag-matrix\.spec\.ts/,
      timeout: 300 * 1000, // 5 minutes per test
      retries: 2,
      use: {
        ...devices['Desktop Chrome'],
        permissions: ['microphone'],
        launchOptions: {
          args: [
            '--use-fake-ui-for-media-stream',
            '--use-fake-device-for-media-stream',
            `--use-file-for-fake-audio-capture=${getAudioFile()}`,
          ],
        },
        storageState: 'e2e/.auth/user.json',
        contextOptions: {
          recordVideo: { dir: 'test-results/videos' },
        },
      },
    },

    /* Voice Scenario Tests - Natural conversation scenarios with real audio */
    /* Run with: LIVE_REALTIME_E2E=1 npx playwright test --project=voice-scenarios */
    {
      name: 'voice-scenarios',
      testDir: './e2e/voice',
      testMatch: /voice-scenarios\.spec\.ts/,
      timeout: 300 * 1000, // 5 minutes for full conversation tests
      use: {
        ...devices['Desktop Chrome'],
        permissions: ['microphone'],
        launchOptions: {
          args: [
            '--use-fake-ui-for-media-stream',
            '--use-fake-device-for-media-stream',
            `--use-file-for-fake-audio-capture=${getAudioFile()}`,
          ],
        },
        storageState: 'e2e/.auth/user.json',
        contextOptions: {
          recordVideo: { dir: 'test-results/videos' },
        },
      },
    },

    /* Voice Debug Tests - Investigation tests for audio/barge-in issues */
    /* Run with: LIVE_REALTIME_E2E=1 npx playwright test --project=voice-debug */
    {
      name: 'voice-debug',
      testDir: './e2e/voice',
      testMatch: /voice-debug\.spec\.ts/,
      timeout: 180 * 1000,
      use: {
        ...devices['Desktop Chrome'],
        permissions: ['microphone'],
        launchOptions: {
          args: [
            '--use-fake-ui-for-media-stream',
            '--use-fake-device-for-media-stream',
            `--use-file-for-fake-audio-capture=${getAudioFile()}`,
          ],
        },
        storageState: 'e2e/.auth/user.json',
        contextOptions: {
          recordVideo: { dir: 'test-results/videos' },
        },
      },
    },
  ],

  /* Run your local dev server before starting the tests */
  webServer: {
    // In CI, use 'preview' to serve pre-built files; locally use 'dev' for HMR
    command: process.env.CI
      ? 'pnpm --filter voiceassist-web preview --port 5173'
      : 'pnpm dev',
    url: 'http://localhost:5173',
    // Reuse existing server locally (CI always starts fresh)
    // .env.local ensures localhost URLs are used for E2E tests
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
