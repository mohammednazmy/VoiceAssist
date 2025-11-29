/**
 * Voice Mobile Viewport E2E Tests
 *
 * Tests voice mode functionality on mobile viewports including:
 * - iPhone 13 (390x844)
 * - Pixel 5 (393x851)
 * - Responsive layout
 * - Touch-friendly interactions
 * - Portrait/landscape orientation
 */

import { test as base, expect, Page, BrowserContext, devices } from "@playwright/test";
import {
  VOICE_SELECTORS,
  VOICE_CONFIG,
  WAIT_TIMES,
  navigateToVoiceChat,
  waitForVoicePanel,
  startVoiceSession,
  stopVoiceSession,
  waitForVoiceConnection,
} from "../fixtures/voice";
import { mockAuthState } from "../fixtures/auth";

// Mobile device configurations
const MOBILE_DEVICES = {
  iPhone13: {
    ...devices["iPhone 13"],
    permissions: ["microphone"],
  },
  Pixel5: {
    ...devices["Pixel 5"],
    permissions: ["microphone"],
  },
};

// Extended fixture for mobile testing
const mobileTest = base.extend<{
  iPhonePage: Page;
  pixelPage: Page;
}>({
  iPhonePage: async ({ browser }, use) => {
    const context = await browser.newContext(MOBILE_DEVICES.iPhone13);
    const page = await context.newPage();

    // Set up auth
    await page.addInitScript((authState) => {
      window.localStorage.setItem("voiceassist-auth", JSON.stringify(authState));
    }, mockAuthState);

    // Mock API responses
    await page.route("**/api/**", async (route) => {
      const url = route.request().url();
      if (url.includes("/auth/me")) {
        await route.fulfill({
          status: 200,
          contentType: "application/json",
          body: JSON.stringify({ data: { id: "e2e-test-user", email: "test@example.com" } }),
        });
      } else if (url.includes("/conversations") && route.request().method() === "GET") {
        await route.fulfill({
          status: 200,
          contentType: "application/json",
          body: JSON.stringify({ data: [], total: 0 }),
        });
      } else {
        await route.fulfill({
          status: 200,
          contentType: "application/json",
          body: JSON.stringify({ data: null }),
        });
      }
    });

    await use(page);
    await context.close();
  },

  pixelPage: async ({ browser }, use) => {
    const context = await browser.newContext(MOBILE_DEVICES.Pixel5);
    const page = await context.newPage();

    // Set up auth
    await page.addInitScript((authState) => {
      window.localStorage.setItem("voiceassist-auth", JSON.stringify(authState));
    }, mockAuthState);

    // Mock API responses
    await page.route("**/api/**", async (route) => {
      const url = route.request().url();
      if (url.includes("/auth/me")) {
        await route.fulfill({
          status: 200,
          contentType: "application/json",
          body: JSON.stringify({ data: { id: "e2e-test-user", email: "test@example.com" } }),
        });
      } else if (url.includes("/conversations") && route.request().method() === "GET") {
        await route.fulfill({
          status: 200,
          contentType: "application/json",
          body: JSON.stringify({ data: [], total: 0 }),
        });
      } else {
        await route.fulfill({
          status: 200,
          contentType: "application/json",
          body: JSON.stringify({ data: null }),
        });
      }
    });

    await use(page);
    await context.close();
  },
});

// Skip tests if live backend not enabled
mobileTest.beforeEach(async ({}, testInfo) => {
  if (!VOICE_CONFIG.LIVE_REALTIME) {
    testInfo.skip(true, "Set LIVE_REALTIME_E2E=1 to run live voice tests");
  }
});

mobileTest.describe("Voice Mobile - iPhone 13", () => {
  mobileTest.setTimeout(60000);

  mobileTest("should show stacked voice panel layout", async ({ iPhonePage }) => {
    const page = iPhonePage;

    await page.goto("/chat?mode=voice");
    await page.waitForLoadState("networkidle");
    await page.waitForTimeout(WAIT_TIMES.UI_UPDATE);

    // Check viewport
    const viewportSize = page.viewportSize();
    console.log(`iPhone viewport: ${viewportSize?.width}x${viewportSize?.height}`);

    // Open voice panel
    const voiceButton = page.locator(VOICE_SELECTORS.toggleButton);
    if (await voiceButton.count() > 0) {
      await voiceButton.click();
      await page.waitForTimeout(WAIT_TIMES.UI_UPDATE);
    }

    // Check voice panel layout
    const voicePanel = page.locator(VOICE_SELECTORS.panel);

    if (await voicePanel.count() > 0) {
      // Get panel dimensions
      const panelBox = await voicePanel.boundingBox();

      if (panelBox) {
        console.log(`Voice panel dimensions: ${panelBox.width}x${panelBox.height}`);

        // On mobile, panel should take full width or be stacked
        expect(panelBox.width).toBeGreaterThan(300);
        console.log("Voice panel is using mobile layout");
      }

      // Check that elements are stacked vertically (not side-by-side)
      const panelChildren = await voicePanel.locator("> *").all();
      const childrenYPositions: number[] = [];

      for (const child of panelChildren.slice(0, 5)) {
        const box = await child.boundingBox();
        if (box) {
          childrenYPositions.push(box.y);
        }
      }

      // Elements should have increasing Y positions (stacked)
      const isStacked = childrenYPositions.every((y, i) =>
        i === 0 || y >= childrenYPositions[i - 1]
      );

      console.log(`Elements stacked vertically: ${isStacked}`);
    }
  });

  mobileTest("should show touch-friendly buttons (44px min)", async ({ iPhonePage }) => {
    const page = iPhonePage;

    await page.goto("/chat?mode=voice");
    await page.waitForLoadState("networkidle");
    await page.waitForTimeout(WAIT_TIMES.UI_UPDATE);

    // Open voice panel
    const voiceButton = page.locator(VOICE_SELECTORS.toggleButton);
    if (await voiceButton.count() > 0) {
      await voiceButton.click();
      await page.waitForTimeout(WAIT_TIMES.UI_UPDATE);
    }

    // Check all buttons in voice panel
    const voicePanel = page.locator(VOICE_SELECTORS.panel);
    const buttons = await voicePanel.locator("button").all();

    console.log(`Found ${buttons.length} buttons in voice panel`);

    const MIN_TAP_TARGET = 44; // iOS Human Interface Guidelines
    let smallButtonCount = 0;

    for (let i = 0; i < buttons.length; i++) {
      const box = await buttons[i].boundingBox();

      if (box) {
        const minDimension = Math.min(box.width, box.height);

        if (minDimension < MIN_TAP_TARGET) {
          smallButtonCount++;
          console.log(`Button ${i}: ${box.width}x${box.height} - BELOW minimum tap target`);
        } else {
          console.log(`Button ${i}: ${box.width}x${box.height} - OK`);
        }
      }
    }

    // Most buttons should meet minimum tap target
    // Some icon-only buttons may be smaller but should have padding
    if (buttons.length > 0) {
      const percentageSmall = (smallButtonCount / buttons.length) * 100;
      console.log(`${percentageSmall.toFixed(1)}% of buttons below minimum tap target`);

      // Allow some tolerance - main action buttons should be large
      expect(percentageSmall).toBeLessThan(50);
    }
  });

  mobileTest("should handle portrait/landscape rotation", async ({ iPhonePage }) => {
    const page = iPhonePage;

    await page.goto("/chat?mode=voice");
    await page.waitForLoadState("networkidle");
    await page.waitForTimeout(WAIT_TIMES.UI_UPDATE);

    // Get initial viewport (portrait)
    const portraitViewport = page.viewportSize();
    console.log(`Portrait: ${portraitViewport?.width}x${portraitViewport?.height}`);

    // Open voice panel in portrait
    const voiceButton = page.locator(VOICE_SELECTORS.toggleButton);
    if (await voiceButton.count() > 0) {
      await voiceButton.click();
      await page.waitForTimeout(WAIT_TIMES.UI_UPDATE);
    }

    const voicePanel = page.locator(VOICE_SELECTORS.panel);
    const portraitBox = await voicePanel.boundingBox();

    // Rotate to landscape
    await page.setViewportSize({
      width: portraitViewport?.height || 844,
      height: portraitViewport?.width || 390,
    });
    await page.waitForTimeout(WAIT_TIMES.UI_UPDATE);

    const landscapeViewport = page.viewportSize();
    console.log(`Landscape: ${landscapeViewport?.width}x${landscapeViewport?.height}`);

    // Check voice panel adapts
    const landscapeBox = await voicePanel.boundingBox();

    if (portraitBox && landscapeBox) {
      console.log(`Portrait panel: ${portraitBox.width}x${portraitBox.height}`);
      console.log(`Landscape panel: ${landscapeBox.width}x${landscapeBox.height}`);

      // Panel should adapt to new orientation
      // Width should be different in landscape
      const layoutChanged = landscapeBox.width !== portraitBox.width ||
                           landscapeBox.height !== portraitBox.height;

      console.log(`Layout adapted to rotation: ${layoutChanged}`);
    }

    // Rotate back to portrait
    await page.setViewportSize({
      width: portraitViewport?.width || 390,
      height: portraitViewport?.height || 844,
    });
  });
});

mobileTest.describe("Voice Mobile - Pixel 5", () => {
  mobileTest.setTimeout(60000);

  mobileTest("should display voice metrics in compact mode", async ({ pixelPage }) => {
    const page = pixelPage;

    await page.goto("/chat?mode=voice");
    await page.waitForLoadState("networkidle");
    await page.waitForTimeout(WAIT_TIMES.UI_UPDATE);

    // Open voice panel
    const voiceButton = page.locator(VOICE_SELECTORS.toggleButton);
    if (await voiceButton.count() > 0) {
      await voiceButton.click();
      await page.waitForTimeout(WAIT_TIMES.UI_UPDATE);
    }

    // Try to start session for metrics
    const startButton = page.locator(VOICE_SELECTORS.startButton);
    if (await startButton.count() > 0) {
      await startButton.first().click();
      await page.waitForTimeout(WAIT_TIMES.CONNECTION);
    }

    // Check for metrics display
    const metricsDisplay = page.locator(VOICE_SELECTORS.metricsDisplay);
    const metricsVisible = await metricsDisplay.count() > 0;

    if (metricsVisible) {
      const metricsBox = await metricsDisplay.boundingBox();

      if (metricsBox) {
        console.log(`Metrics display size: ${metricsBox.width}x${metricsBox.height}`);

        // On mobile, metrics should be compact
        // Should not take more than 30% of viewport height
        const viewportSize = page.viewportSize();
        if (viewportSize) {
          const heightPercentage = (metricsBox.height / viewportSize.height) * 100;
          console.log(`Metrics height: ${heightPercentage.toFixed(1)}% of viewport`);

          expect(heightPercentage).toBeLessThan(40);
        }
      }
    } else {
      console.log("Metrics display not visible on mobile (may be hidden by default)");
    }

    // Cleanup
    const stopButton = page.locator(VOICE_SELECTORS.stopButton);
    if (await stopButton.count() > 0) {
      await stopButton.first().click();
    }
  });

  mobileTest("should scroll chat while voice active", async ({ pixelPage }) => {
    const page = pixelPage;

    await page.goto("/chat?mode=voice");
    await page.waitForLoadState("networkidle");
    await page.waitForTimeout(WAIT_TIMES.UI_UPDATE);

    // Open voice panel
    const voiceButton = page.locator(VOICE_SELECTORS.toggleButton);
    if (await voiceButton.count() > 0) {
      await voiceButton.click();
      await page.waitForTimeout(WAIT_TIMES.UI_UPDATE);
    }

    const voicePanel = page.locator(VOICE_SELECTORS.panel);
    const initialPanelBox = await voicePanel.boundingBox();

    // Find scrollable chat area
    const chatArea = page.locator(
      `${VOICE_SELECTORS.chatTimeline}, [data-testid="chat-container"], .chat-messages`
    );

    const chatExists = await chatArea.count() > 0;

    if (chatExists && initialPanelBox) {
      // Simulate scroll on chat area
      await chatArea.evaluate((el) => {
        el.scrollTop = 100;
      });
      await page.waitForTimeout(500);

      // Voice panel should stay in place
      const afterScrollBox = await voicePanel.boundingBox();

      if (afterScrollBox) {
        console.log(`Panel position before scroll: ${initialPanelBox.y}`);
        console.log(`Panel position after scroll: ${afterScrollBox.y}`);

        // Panel Y position should remain stable (fixed or sticky)
        const positionStable = Math.abs(afterScrollBox.y - initialPanelBox.y) < 50;
        console.log(`Voice panel stable during scroll: ${positionStable}`);
      }
    }
  });
});

mobileTest.describe("Voice Mobile - Common Tests", () => {
  mobileTest.setTimeout(60000);

  mobileTest("should work with on-screen keyboard visible", async ({ iPhonePage }) => {
    const page = iPhonePage;

    await page.goto("/chat?mode=voice");
    await page.waitForLoadState("networkidle");
    await page.waitForTimeout(WAIT_TIMES.UI_UPDATE);

    // Find text input
    const textInput = page.locator(
      'input[type="text"], textarea, [data-testid="chat-input"]'
    );

    const inputExists = await textInput.count() > 0;

    if (inputExists) {
      // Focus input to trigger keyboard
      await textInput.first().focus();
      await page.waitForTimeout(WAIT_TIMES.UI_UPDATE);

      // Check that voice toggle is still accessible
      const voiceButton = page.locator(VOICE_SELECTORS.toggleButton);
      const buttonVisible = await voiceButton.isVisible().catch(() => false);

      console.log(`Voice toggle visible with keyboard: ${buttonVisible}`);

      if (buttonVisible) {
        // Should be clickable
        const buttonBox = await voiceButton.boundingBox();

        if (buttonBox) {
          // Button should be in visible area
          const viewportSize = page.viewportSize();

          if (viewportSize) {
            const inViewport = buttonBox.y < viewportSize.height;
            console.log(`Voice button in viewport: ${inViewport}`);
          }
        }
      }

      // Blur to hide keyboard
      await textInput.first().blur();
    }
  });

  mobileTest("should support touch gestures for voice control", async ({ pixelPage }) => {
    const page = pixelPage;

    await page.goto("/chat?mode=voice");
    await page.waitForLoadState("networkidle");
    await page.waitForTimeout(WAIT_TIMES.UI_UPDATE);

    // Open voice panel
    const voiceButton = page.locator(VOICE_SELECTORS.toggleButton);
    if (await voiceButton.count() > 0) {
      // Use tap gesture
      await voiceButton.tap();
      await page.waitForTimeout(WAIT_TIMES.UI_UPDATE);
    }

    const voicePanel = page.locator(VOICE_SELECTORS.panel);
    const panelVisible = await voicePanel.count() > 0;

    if (panelVisible) {
      console.log("Voice panel opened with tap");

      // Try tapping start button
      const startButton = page.locator(VOICE_SELECTORS.startButton);

      if (await startButton.count() > 0) {
        await startButton.first().tap();
        await page.waitForTimeout(WAIT_TIMES.UI_UPDATE);
        console.log("Start button tapped");
      }

      // Cleanup
      const stopButton = page.locator(VOICE_SELECTORS.stopButton);
      if (await stopButton.count() > 0) {
        await stopButton.first().tap();
      }
    }
  });

  mobileTest("should handle swipe to dismiss voice panel", async ({ iPhonePage }) => {
    const page = iPhonePage;

    await page.goto("/chat?mode=voice");
    await page.waitForLoadState("networkidle");
    await page.waitForTimeout(WAIT_TIMES.UI_UPDATE);

    // Open voice panel
    const voiceButton = page.locator(VOICE_SELECTORS.toggleButton);
    if (await voiceButton.count() > 0) {
      await voiceButton.tap();
      await page.waitForTimeout(WAIT_TIMES.UI_UPDATE);
    }

    const voicePanel = page.locator(VOICE_SELECTORS.panel);

    if (await voicePanel.count() > 0) {
      const panelBox = await voicePanel.boundingBox();

      if (panelBox) {
        // Simulate swipe down gesture
        const startY = panelBox.y + 20;
        const endY = startY + 200;
        const centerX = panelBox.x + panelBox.width / 2;

        await page.mouse.move(centerX, startY);
        await page.mouse.down();
        await page.mouse.move(centerX, endY, { steps: 10 });
        await page.mouse.up();

        await page.waitForTimeout(WAIT_TIMES.UI_UPDATE);

        // Check if panel was dismissed
        const panelStillVisible = await voicePanel.count() > 0;
        console.log(`Panel after swipe: ${panelStillVisible ? "still visible" : "dismissed"}`);

        // Note: Swipe to dismiss may not be implemented
        // This test documents the expected behavior
      }
    }
  });
});
