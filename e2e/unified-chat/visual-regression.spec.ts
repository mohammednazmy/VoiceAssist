/**
 * Unified Chat Visual Regression E2E Tests
 *
 * Uses Playwright's screenshot comparison for visual consistency:
 * - Component appearance at different states
 * - Responsive layout at various viewports
 * - Dark/light mode (if applicable)
 * - Animation states
 */

import { test, expect, UNIFIED_CHAT_SELECTORS, UNIFIED_CHAT_WAIT_TIMES } from "../fixtures/unified-chat";

// Configure visual comparison settings
const VISUAL_COMPARISON_OPTIONS = {
  maxDiffPixels: 500, // Allow minor differences for component screenshots
  threshold: 0.3, // Pixel comparison threshold (more lenient)
};

// Higher tolerance for full page screenshots (more dynamic content)
const FULL_PAGE_VISUAL_OPTIONS = {
  maxDiffPixelRatio: 0.02, // Allow 2% pixel difference for full pages
  threshold: 0.3,
};

test.describe("Unified Chat Visual Regression", () => {
  test.setTimeout(60000);

  test.describe("Desktop Layout", () => {
    test("main layout should match snapshot", async ({ unifiedChatPage }) => {
      const page = unifiedChatPage;

      // Ensure consistent viewport
      await page.setViewportSize({ width: 1280, height: 800 });
      await page.waitForTimeout(UNIFIED_CHAT_WAIT_TIMES.UI_UPDATE);

      // Take full page screenshot
      await expect(page).toHaveScreenshot("desktop-layout.png", {
        fullPage: false,
        ...FULL_PAGE_VISUAL_OPTIONS,
      });
    });

    test("header should match snapshot", async ({ unifiedChatPage }) => {
      const page = unifiedChatPage;

      const header = page.locator(UNIFIED_CHAT_SELECTORS.header);
      await expect(header).toHaveScreenshot("header.png", VISUAL_COMPARISON_OPTIONS);
    });

    test("sidebar should match snapshot", async ({ unifiedChatPage }) => {
      const page = unifiedChatPage;

      const sidebar = page.locator(UNIFIED_CHAT_SELECTORS.sidebar);
      if (await sidebar.isVisible()) {
        await expect(sidebar).toHaveScreenshot("sidebar.png", VISUAL_COMPARISON_OPTIONS);
      }
    });

    test("input area should match snapshot", async ({ unifiedChatPage }) => {
      const page = unifiedChatPage;

      const inputArea = page.locator(UNIFIED_CHAT_SELECTORS.inputArea);
      await expect(inputArea).toHaveScreenshot("input-area.png", VISUAL_COMPARISON_OPTIONS);
    });

    test("input area with text should match snapshot", async ({
      unifiedChatPage,
    }) => {
      const page = unifiedChatPage;

      const messageInput = page.locator(UNIFIED_CHAT_SELECTORS.messageInput);
      await messageInput.fill("This is a sample message for visual testing");

      const inputArea = page.locator(UNIFIED_CHAT_SELECTORS.inputArea);
      await expect(inputArea).toHaveScreenshot("input-area-with-text.png", VISUAL_COMPARISON_OPTIONS);
    });
  });

  test.describe("Tablet Layout", () => {
    test("tablet layout should match snapshot", async ({ unifiedChatPage }) => {
      const page = unifiedChatPage;

      await page.setViewportSize({ width: 768, height: 1024 });
      await page.waitForTimeout(UNIFIED_CHAT_WAIT_TIMES.UI_UPDATE);

      await expect(page).toHaveScreenshot("tablet-layout.png", {
        fullPage: false,
        ...FULL_PAGE_VISUAL_OPTIONS,
      });

      // Reset viewport
      await page.setViewportSize({ width: 1280, height: 800 });
    });
  });

  test.describe("Mobile Layout", () => {
    test("mobile layout should match snapshot", async ({ unifiedChatPage }) => {
      const page = unifiedChatPage;

      await page.setViewportSize({ width: 375, height: 812 });
      await page.waitForTimeout(UNIFIED_CHAT_WAIT_TIMES.UI_UPDATE);

      await expect(page).toHaveScreenshot("mobile-layout.png", {
        fullPage: false,
        ...FULL_PAGE_VISUAL_OPTIONS,
      });

      // Reset viewport
      await page.setViewportSize({ width: 1280, height: 800 });
    });

    test("mobile sidebar open should match snapshot", async ({
      unifiedChatPage,
    }) => {
      const page = unifiedChatPage;

      await page.setViewportSize({ width: 375, height: 812 });
      await page.waitForTimeout(UNIFIED_CHAT_WAIT_TIMES.UI_UPDATE);

      // First dismiss any overlay that might be showing
      const overlay = page.locator('.fixed.inset-0.z-40');
      if (await overlay.isVisible()) {
        await overlay.click({ position: { x: 350, y: 400 } }); // Click on edge to dismiss
        await page.waitForTimeout(300);
      }

      // Open sidebar on mobile
      const menuButton = page.locator('button[aria-label="Open sidebar"]').first();
      if (await menuButton.isVisible()) {
        await menuButton.click({ force: true }); // Use force to bypass any intercepts
        await page.waitForTimeout(UNIFIED_CHAT_WAIT_TIMES.ANIMATION);

        await expect(page).toHaveScreenshot("mobile-sidebar-open.png", {
          fullPage: false,
          ...FULL_PAGE_VISUAL_OPTIONS,
        });
      }

      // Reset viewport
      await page.setViewportSize({ width: 1280, height: 800 });
    });
  });

  test.describe("Component States", () => {
    test("voice toggle off state should match snapshot", async ({
      unifiedChatPage,
    }) => {
      const page = unifiedChatPage;

      const voiceToggle = page.locator(UNIFIED_CHAT_SELECTORS.voiceModeToggle);
      if (await voiceToggle.isVisible()) {
        await expect(voiceToggle).toHaveScreenshot("voice-toggle-off.png", VISUAL_COMPARISON_OPTIONS);
      }
    });

    test("voice toggle on state should match snapshot", async ({
      unifiedChatPage,
    }) => {
      const page = unifiedChatPage;

      const voiceToggle = page.locator(UNIFIED_CHAT_SELECTORS.voiceModeToggle);
      if (await voiceToggle.isVisible()) {
        await voiceToggle.click();
        await page.waitForTimeout(UNIFIED_CHAT_WAIT_TIMES.ANIMATION);

        await expect(voiceToggle).toHaveScreenshot("voice-toggle-on.png", VISUAL_COMPARISON_OPTIONS);

        // Toggle back
        await voiceToggle.click();
      }
    });

    test("send button disabled state should match snapshot", async ({
      unifiedChatPage,
    }) => {
      const page = unifiedChatPage;

      const sendButton = page.locator(UNIFIED_CHAT_SELECTORS.sendButton);
      await expect(sendButton).toHaveScreenshot("send-button-disabled.png", VISUAL_COMPARISON_OPTIONS);
    });

    test("input focus state should match snapshot", async ({
      unifiedChatPage,
    }) => {
      const page = unifiedChatPage;

      const messageInput = page.locator(UNIFIED_CHAT_SELECTORS.messageInput);
      await messageInput.focus();
      await page.waitForTimeout(100);

      await expect(messageInput).toHaveScreenshot("input-focused.png", VISUAL_COMPARISON_OPTIONS);
    });
  });

  test.describe("Hover States", () => {
    test("new chat button hover should match snapshot", async ({
      unifiedChatPage,
    }) => {
      const page = unifiedChatPage;

      const newChatButton = page.locator(UNIFIED_CHAT_SELECTORS.newChatButton);
      if (await newChatButton.isVisible()) {
        await newChatButton.hover();
        await page.waitForTimeout(100);

        await expect(newChatButton).toHaveScreenshot("new-chat-hover.png", VISUAL_COMPARISON_OPTIONS);
      }
    });

    test("send button hover should match snapshot", async ({
      unifiedChatPage,
    }) => {
      const page = unifiedChatPage;

      // Enable send button by typing
      const messageInput = page.locator(UNIFIED_CHAT_SELECTORS.messageInput);
      await messageInput.fill("Test message");

      const sendButton = page.locator(UNIFIED_CHAT_SELECTORS.sendButton);
      const isEnabled = await sendButton.isEnabled();

      if (isEnabled) {
        await sendButton.hover();
        await page.waitForTimeout(100);

        await expect(sendButton).toHaveScreenshot("send-button-hover.png", VISUAL_COMPARISON_OPTIONS);
      }
    });
  });

  test.describe("Loading States", () => {
    test("skeleton loading state should match snapshot", async ({ page }) => {
      // Navigate directly without waiting for load
      await page.goto("/chat", { waitUntil: "commit" });

      // Try to capture skeleton state
      const skeleton = page.locator(UNIFIED_CHAT_SELECTORS.skeleton);
      const skeletonVisible = await skeleton.isVisible().catch(() => false);

      if (skeletonVisible) {
        await expect(skeleton).toHaveScreenshot("loading-skeleton.png", VISUAL_COMPARISON_OPTIONS);
      } else {
        console.log("Skeleton loaded too fast to capture");
      }
    });
  });

  test.describe("Animation Consistency", () => {
    test("sidebar toggle animation should be smooth", async ({
      unifiedChatPage,
    }) => {
      const page = unifiedChatPage;

      // Take screenshot before toggle
      await expect(page).toHaveScreenshot("sidebar-before-toggle.png", {
        fullPage: false,
        ...FULL_PAGE_VISUAL_OPTIONS,
      });

      // Toggle sidebar
      const toggleButton = page.locator(UNIFIED_CHAT_SELECTORS.sidebarToggle);
      if (await toggleButton.isVisible()) {
        await toggleButton.click();
        await page.waitForTimeout(UNIFIED_CHAT_WAIT_TIMES.ANIMATION);

        // Take screenshot after toggle
        await expect(page).toHaveScreenshot("sidebar-after-toggle.png", {
          fullPage: false,
          ...FULL_PAGE_VISUAL_OPTIONS,
        });

        // Toggle back
        const openButton = page.locator(UNIFIED_CHAT_SELECTORS.sidebarOpenButton).first();
        if (await openButton.isVisible()) {
          await openButton.click();
          await page.waitForTimeout(UNIFIED_CHAT_WAIT_TIMES.ANIMATION);
        }
      }
    });
  });

  test.describe("Cross-browser Consistency", () => {
    test("layout should be consistent across viewports", async ({
      unifiedChatPage,
    }) => {
      const page = unifiedChatPage;
      const viewports = [
        { width: 1920, height: 1080, name: "1080p" },
        { width: 1440, height: 900, name: "laptop" },
        { width: 1280, height: 800, name: "default" },
      ];

      for (const viewport of viewports) {
        await page.setViewportSize({ width: viewport.width, height: viewport.height });
        await page.waitForTimeout(300);

        await expect(page).toHaveScreenshot(`layout-${viewport.name}.png`, {
          fullPage: false,
          ...FULL_PAGE_VISUAL_OPTIONS,
        });
      }
    });
  });
});
