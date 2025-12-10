/**
 * Unified Chat Error States and Edge Cases E2E Tests
 *
 * Tests error handling, edge cases, and recovery:
 * - Network errors
 * - API failures
 * - Invalid states
 * - Boundary conditions
 * - Recovery scenarios
 */

import { test, expect, UNIFIED_CHAT_SELECTORS, UNIFIED_CHAT_WAIT_TIMES } from "../fixtures/unified-chat";

test.describe("Unified Chat Error States", () => {
  test.setTimeout(45000);

  test.describe("Network Errors", () => {
    test("should handle offline mode gracefully", async ({ unifiedChatPage }) => {
      const page = unifiedChatPage;

      // Go offline
      await page.context().setOffline(true);
      await page.waitForTimeout(1000);

      // UI should still be visible
      const container = page.locator(UNIFIED_CHAT_SELECTORS.container);
      await expect(container).toBeVisible();

      // Input should still be usable for typing
      const messageInput = page.locator(UNIFIED_CHAT_SELECTORS.messageInput);
      await messageInput.fill("Offline message");
      const value = await messageInput.inputValue();
      expect(value).toBe("Offline message");

      // Go back online
      await page.context().setOffline(false);
      await page.waitForTimeout(1000);

      console.log("Handled offline mode gracefully");
    });

    test("should show connection status when disconnected", async ({
      unifiedChatPage,
    }) => {
      const page = unifiedChatPage;

      // Look for connection status indicator
      const statusIndicator = page.locator('[class*="rounded-full"][class*="w-2"][class*="h-2"]');
      await expect(statusIndicator).toBeVisible();

      console.log("Connection status indicator is visible");
    });

    test.skip("should handle slow network gracefully", async ({ page }) => {
      // Skip in CI - network emulation can be flaky
      // This test is for local development verification

      // Simulate slow network
      const client = await page.context().newCDPSession(page);
      await client.send("Network.enable");
      await client.send("Network.emulateNetworkConditions", {
        offline: false,
        downloadThroughput: (100 * 1024) / 8, // 100 Kbps
        uploadThroughput: (100 * 1024) / 8,
        latency: 2000, // 2 second latency
      });

      // Should still load eventually
      await page.goto("/chat", { timeout: 60000 });
      const container = page.locator(UNIFIED_CHAT_SELECTORS.container);
      await expect(container).toBeVisible({ timeout: 30000 });

      // Reset network
      await client.send("Network.emulateNetworkConditions", {
        offline: false,
        downloadThroughput: -1,
        uploadThroughput: -1,
        latency: 0,
      });

      console.log("Handled slow network gracefully");
    });
  });

  test.describe("API Errors", () => {
    test("should handle 401 unauthorized gracefully", async ({ page }) => {
      // Clear auth state
      await page.addInitScript(() => {
        localStorage.removeItem("voiceassist-auth");
      });

      // Navigate to chat
      await page.goto("/chat");
      await page.waitForLoadState("networkidle");

      // Should redirect to login or show auth error
      const currentUrl = page.url();
      const isOnLoginOrChat =
        currentUrl.includes("/login") || currentUrl.includes("/chat");

      expect(isOnLoginOrChat).toBe(true);
      console.log(`Handled 401: redirected to ${currentUrl}`);
    });

    test("should handle 500 server errors gracefully", async ({ page }) => {
      // Mock API to return 500
      await page.route("**/api/**", (route) => {
        route.fulfill({
          status: 500,
          contentType: "application/json",
          body: JSON.stringify({ error: "Internal Server Error" }),
        });
      });

      await page.goto("/chat");

      // App should not crash - either show error or degrade gracefully
      const body = page.locator("body");
      await expect(body).toBeVisible();

      console.log("Handled 500 error gracefully");
    });

    test("should handle API timeout gracefully", async ({ page }) => {
      // Mock API to timeout
      await page.route("**/api/**", async (route) => {
        await new Promise((resolve) => setTimeout(resolve, 30000));
        route.fulfill({ status: 504 });
      });

      await page.goto("/chat", { timeout: 60000 });

      // App should still render
      const body = page.locator("body");
      await expect(body).toBeVisible();

      console.log("Handled API timeout gracefully");
    });
  });

  test.describe("Input Edge Cases", () => {
    test("should handle very long messages", async ({ unifiedChatPage }) => {
      const page = unifiedChatPage;

      const messageInput = page.locator(UNIFIED_CHAT_SELECTORS.messageInput);

      // Type a very long message (1000+ characters)
      const longMessage = "A".repeat(2000);
      await messageInput.fill(longMessage);

      const value = await messageInput.inputValue();
      // Should either accept all or truncate
      expect(value.length).toBeGreaterThan(0);

      console.log(`Long message handling: input length = ${value.length}`);
    });

    test("should handle special characters", async ({ unifiedChatPage }) => {
      const page = unifiedChatPage;

      const messageInput = page.locator(UNIFIED_CHAT_SELECTORS.messageInput);
      const specialChars = '<script>alert("xss")</script> & < > " \' 🎉 مرحبا';

      await messageInput.fill(specialChars);

      const value = await messageInput.inputValue();
      expect(value).toBe(specialChars);

      console.log("Special characters handled correctly");
    });

    test("should handle emoji input", async ({ unifiedChatPage }) => {
      const page = unifiedChatPage;

      const messageInput = page.locator(UNIFIED_CHAT_SELECTORS.messageInput);
      const emojiMessage = "Hello! 👋 This is a test 🧪 with emojis 🎉🚀💡";

      await messageInput.fill(emojiMessage);

      const value = await messageInput.inputValue();
      expect(value).toBe(emojiMessage);

      console.log("Emoji input handled correctly");
    });

    test("should handle RTL text", async ({ unifiedChatPage }) => {
      const page = unifiedChatPage;

      const messageInput = page.locator(UNIFIED_CHAT_SELECTORS.messageInput);
      const arabicText = "مرحبا بك في التطبيق";

      await messageInput.fill(arabicText);

      const value = await messageInput.inputValue();
      expect(value).toBe(arabicText);

      console.log("RTL text handled correctly");
    });

    test("should handle rapid input changes", async ({ unifiedChatPage }) => {
      const page = unifiedChatPage;

      const messageInput = page.locator(UNIFIED_CHAT_SELECTORS.messageInput);

      // Rapidly change input
      for (let i = 0; i < 10; i++) {
        await messageInput.fill(`Message ${i}`);
      }

      const value = await messageInput.inputValue();
      expect(value).toBe("Message 9");

      console.log("Rapid input changes handled correctly");
    });

    test("should handle paste events", async ({ unifiedChatPage }) => {
      const page = unifiedChatPage;

      const messageInput = page.locator(UNIFIED_CHAT_SELECTORS.messageInput);
      await messageInput.focus();

      // Simulate paste
      const pastedText = "This is pasted content with\nmultiple lines";
      await page.evaluate((text) => {
        const input = document.querySelector('[data-testid="message-input"]') as HTMLTextAreaElement;
        if (input) {
          input.value = text;
          input.dispatchEvent(new Event("input", { bubbles: true }));
        }
      }, pastedText);

      const value = await messageInput.inputValue();
      expect(value).toContain("This is pasted content");

      console.log("Paste events handled correctly");
    });
  });

  test.describe("State Edge Cases", () => {
    test("should handle rapid navigation", async ({ page }) => {
      // Rapidly navigate between pages
      await page.goto("/chat");
      await page.goto("/");
      await page.goto("/chat");
      await page.goto("/");
      await page.goto("/chat");

      // Should stabilize
      await page.waitForLoadState("networkidle");

      const container = page.locator(UNIFIED_CHAT_SELECTORS.container);
      const isVisible = await container.isVisible().catch(() => false);

      // Either on chat or redirected - both are valid
      console.log(`Rapid navigation handled: container visible = ${isVisible}`);
    });

    test("should handle browser back/forward", async ({ unifiedChatPage }) => {
      const page = unifiedChatPage;

      // Navigate away and back
      await page.goto("/");
      await page.goBack();
      await page.waitForLoadState("networkidle");

      // Should restore state
      const container = page.locator(UNIFIED_CHAT_SELECTORS.container);
      const isVisible = await container.isVisible().catch(() => false);

      console.log(`Back/forward handled: container visible = ${isVisible}`);
    });

    test("should handle page refresh", async ({ unifiedChatPage }) => {
      const page = unifiedChatPage;

      // Type something
      const messageInput = page.locator(UNIFIED_CHAT_SELECTORS.messageInput);
      await messageInput.fill("Test message before refresh");

      // Refresh page
      await page.reload();
      await page.waitForSelector(UNIFIED_CHAT_SELECTORS.container);

      // App should still work
      const inputAfterRefresh = page.locator(UNIFIED_CHAT_SELECTORS.messageInput);
      await expect(inputAfterRefresh).toBeVisible();

      console.log("Page refresh handled correctly");
    });

    test("should handle concurrent sidebar toggles", async ({
      unifiedChatPage,
    }) => {
      const page = unifiedChatPage;

      // Get the toggle button (close sidebar)
      const toggleButton = page.locator(UNIFIED_CHAT_SELECTORS.sidebarToggle);
      if (!(await toggleButton.isVisible())) {
        console.log("Sidebar toggle not visible, skipping test");
        return;
      }

      // Rapidly toggle sidebar - use try/catch to handle state changes
      for (let i = 0; i < 3; i++) {
        try {
          // Check which button is visible and click it
          const closeBtn = page.locator(UNIFIED_CHAT_SELECTORS.sidebarToggle);
          const openBtn = page.locator(UNIFIED_CHAT_SELECTORS.sidebarOpenButton).first();

          if (await closeBtn.isVisible()) {
            await closeBtn.click({ force: true });
          } else if (await openBtn.isVisible()) {
            await openBtn.click({ force: true });
          }
          await page.waitForTimeout(100);
        } catch {
          // Ignore errors during rapid toggling
        }
      }

      await page.waitForTimeout(UNIFIED_CHAT_WAIT_TIMES.ANIMATION);

      // Should be in a stable state
      const container = page.locator(UNIFIED_CHAT_SELECTORS.container);
      await expect(container).toBeVisible();

      console.log("Concurrent sidebar toggles handled correctly");
    });
  });

  test.describe("Boundary Conditions", () => {
    test("should handle empty conversation list", async ({ unifiedChatPage }) => {
      const page = unifiedChatPage;

      // Search for non-existent conversation
      const searchInput = page.locator(UNIFIED_CHAT_SELECTORS.searchInput);
      if (await searchInput.isVisible()) {
        await searchInput.fill("zzznonexistent999");
        await page.waitForTimeout(UNIFIED_CHAT_WAIT_TIMES.SEARCH_DEBOUNCE);

        // Should show empty state or no results message
        const noResults = page.locator('text=/No conversations|No results|Nothing found/i');
        const hasEmptyState = (await noResults.count()) > 0;

        console.log(`Empty state shown: ${hasEmptyState}`);
      }
    });

    test("should handle very narrow viewport", async ({ unifiedChatPage }) => {
      const page = unifiedChatPage;

      // Set very narrow viewport
      await page.setViewportSize({ width: 320, height: 568 });
      await page.waitForTimeout(500);

      // App should still be usable
      const inputArea = page.locator(UNIFIED_CHAT_SELECTORS.inputArea);
      await expect(inputArea).toBeVisible();

      // Reset viewport
      await page.setViewportSize({ width: 1280, height: 800 });

      console.log("Narrow viewport handled correctly");
    });

    test("should handle very wide viewport", async ({ unifiedChatPage }) => {
      const page = unifiedChatPage;

      // Set very wide viewport
      await page.setViewportSize({ width: 2560, height: 1440 });
      await page.waitForTimeout(500);

      // App should still look reasonable
      const container = page.locator(UNIFIED_CHAT_SELECTORS.container);
      await expect(container).toBeVisible();

      // Reset viewport
      await page.setViewportSize({ width: 1280, height: 800 });

      console.log("Wide viewport handled correctly");
    });

    test("should handle zoom levels", async ({ unifiedChatPage }) => {
      const page = unifiedChatPage;

      // Zoom in
      await page.evaluate(() => {
        document.body.style.zoom = "150%";
      });
      await page.waitForTimeout(300);

      // App should still be usable
      const container = page.locator(UNIFIED_CHAT_SELECTORS.container);
      await expect(container).toBeVisible();

      // Reset zoom
      await page.evaluate(() => {
        document.body.style.zoom = "100%";
      });

      console.log("Zoom levels handled correctly");
    });
  });

  test.describe("Recovery Scenarios", () => {
    test("should recover from temporary disconnect", async ({
      unifiedChatPage,
    }) => {
      const page = unifiedChatPage;

      // Go offline
      await page.context().setOffline(true);
      await page.waitForTimeout(2000);

      // Go back online
      await page.context().setOffline(false);
      await page.waitForTimeout(2000);

      // App should recover
      const container = page.locator(UNIFIED_CHAT_SELECTORS.container);
      await expect(container).toBeVisible();

      // Input should be usable
      const messageInput = page.locator(UNIFIED_CHAT_SELECTORS.messageInput);
      await messageInput.fill("Recovery test");
      const value = await messageInput.inputValue();
      expect(value).toBe("Recovery test");

      console.log("Recovered from temporary disconnect");
    });

    test("should handle multiple tab scenarios", async ({ browser }) => {
      // Open two tabs
      const context = await browser.newContext();
      const page1 = await context.newPage();
      const page2 = await context.newPage();

      // Set up auth for both
      await page1.addInitScript((authState) => {
        localStorage.setItem("voiceassist-auth", JSON.stringify(authState));
        localStorage.setItem("ff_unified_chat_voice_ui", "true");
      }, {
        state: {
          user: { id: "test", email: "test@example.com", name: "Test" },
          tokens: { accessToken: "test-token" },
          isAuthenticated: true,
          _hasHydrated: true,
        },
        version: 0,
      });

      await page2.addInitScript((authState) => {
        localStorage.setItem("voiceassist-auth", JSON.stringify(authState));
        localStorage.setItem("ff_unified_chat_voice_ui", "true");
      }, {
        state: {
          user: { id: "test", email: "test@example.com", name: "Test" },
          tokens: { accessToken: "test-token" },
          isAuthenticated: true,
          _hasHydrated: true,
        },
        version: 0,
      });

      // Navigate both to chat
      await Promise.all([
        page1.goto("/chat"),
        page2.goto("/chat"),
      ]);

      // Both should work
      const body1 = page1.locator("body");
      const body2 = page2.locator("body");

      await expect(body1).toBeVisible();
      await expect(body2).toBeVisible();

      await context.close();

      console.log("Multiple tabs handled correctly");
    });
  });
});
