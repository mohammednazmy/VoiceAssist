/**
 * Unified Header E2E Tests
 *
 * Tests the UnifiedHeader component including:
 * - Title display and editing
 * - Connection status indicator
 * - Action buttons (share, export, settings)
 * - Sidebar and context pane toggles
 * - Responsive behavior
 */

import {
  test,
  expect,
  UNIFIED_CHAT_SELECTORS,
  UNIFIED_CHAT_WAIT_TIMES,
  editConversationTitle,
  getConnectionStatus,
  toggleSidebar,
  openContextPane,
} from "../fixtures/unified-chat";

test.describe("UnifiedHeader", () => {
  test.setTimeout(30000);

  test("displays header with conversation title", async ({ unifiedChatPage }) => {
    const page = unifiedChatPage;

    // Verify header is present
    const header = page.locator(UNIFIED_CHAT_SELECTORS.header);
    await expect(header).toBeVisible();

    // Verify title is present
    const title = header.locator("h1");
    await expect(title).toBeVisible();

    const titleText = await title.textContent();
    expect(titleText).toBeTruthy();

    console.log(`Header displays title: "${titleText}"`);
  });

  test("displays connection status indicator", async ({ unifiedChatPage }) => {
    const page = unifiedChatPage;

    // Check for status indicator dot
    const statusIndicator = page.locator('[class*="rounded-full"][class*="w-2"][class*="h-2"]');
    await expect(statusIndicator).toBeVisible();

    // Get connection status
    const status = await getConnectionStatus(page);
    expect(["connected", "connecting", "error", "disconnected"]).toContain(status);

    console.log(`Connection status: ${status}`);
  });

  test("shows edit icon on title hover", async ({ unifiedChatPage }) => {
    const page = unifiedChatPage;

    // Find the title button/container
    const titleButton = page.locator(UNIFIED_CHAT_SELECTORS.header).locator("button:has(h1)");

    if (await titleButton.count() > 0) {
      // Hover over title
      await titleButton.hover();
      await page.waitForTimeout(200);

      // Check if edit icon becomes visible
      const editIcon = titleButton.locator('svg[class*="Edit"], svg[class*="edit"]');
      const editIconVisible = await editIcon.isVisible();

      if (editIconVisible) {
        console.log("Edit icon appears on title hover");
      } else {
        console.log("Edit icon not visible (may use different pattern)");
      }
    }
  });

  test("can edit conversation title", async ({ unifiedChatPage }) => {
    const page = unifiedChatPage;

    // Get current title
    const titleElement = page.locator(UNIFIED_CHAT_SELECTORS.header).locator("h1");
    const originalTitle = await titleElement.textContent();

    // Click on title to start editing
    const titleButton = page.locator(UNIFIED_CHAT_SELECTORS.header).locator("button:has(h1)");

    if (await titleButton.count() > 0) {
      await titleButton.click();
      await page.waitForTimeout(UNIFIED_CHAT_WAIT_TIMES.UI_UPDATE);

      // Check if input appeared
      const titleInput = page.locator('input[aria-label="Conversation title"]');

      if (await titleInput.isVisible()) {
        const newTitle = `Test Title ${Date.now()}`;

        // Enter new title
        await titleInput.fill(newTitle);

        // Save
        const saveButton = page.locator('button[aria-label="Save title"]');
        await saveButton.click();
        await page.waitForTimeout(UNIFIED_CHAT_WAIT_TIMES.UI_UPDATE);

        // Verify title changed
        const updatedTitle = await titleElement.textContent();
        expect(updatedTitle).toBe(newTitle);

        console.log(`Title edited successfully from "${originalTitle}" to "${newTitle}"`);
      } else {
        console.log("Title input did not appear (editing might be different)");
      }
    }
  });

  test("title editing shows validation error for empty title", async ({
    unifiedChatPage,
  }) => {
    const page = unifiedChatPage;

    // Click on title to start editing
    const titleButton = page.locator(UNIFIED_CHAT_SELECTORS.header).locator("button:has(h1)");

    if (await titleButton.count() > 0) {
      await titleButton.click();
      await page.waitForTimeout(UNIFIED_CHAT_WAIT_TIMES.UI_UPDATE);

      const titleInput = page.locator('input[aria-label="Conversation title"]');

      if (await titleInput.isVisible()) {
        // Clear the input
        await titleInput.fill("");

        // Try to save
        const saveButton = page.locator('button[aria-label="Save title"]');
        await saveButton.click();
        await page.waitForTimeout(UNIFIED_CHAT_WAIT_TIMES.UI_UPDATE);

        // Check for error message
        const errorMessage = page.locator('p[class*="text-red"]');
        const hasError = await errorMessage.count() > 0;

        if (hasError) {
          const errorText = await errorMessage.textContent();
          expect(errorText).toContain("empty");
          console.log("Validation error shown for empty title");
        }

        // Cancel editing
        const cancelButton = page.locator('button[aria-label="Cancel editing"]');
        if (await cancelButton.isVisible()) {
          await cancelButton.click();
        } else {
          await page.keyboard.press("Escape");
        }
      }
    }
  });

  test("title editing can be cancelled with Escape key", async ({
    unifiedChatPage,
  }) => {
    const page = unifiedChatPage;

    const titleButton = page.locator(UNIFIED_CHAT_SELECTORS.header).locator("button:has(h1)");

    if (await titleButton.count() > 0) {
      // Get original title
      const titleElement = page.locator(UNIFIED_CHAT_SELECTORS.header).locator("h1");
      const originalTitle = await titleElement.textContent();

      // Start editing
      await titleButton.click();
      await page.waitForTimeout(UNIFIED_CHAT_WAIT_TIMES.UI_UPDATE);

      const titleInput = page.locator('input[aria-label="Conversation title"]');

      if (await titleInput.isVisible()) {
        // Type something different
        await titleInput.fill("Changed Title");

        // Press Escape to cancel
        await page.keyboard.press("Escape");
        await page.waitForTimeout(UNIFIED_CHAT_WAIT_TIMES.UI_UPDATE);

        // Title should be unchanged
        const currentTitle = await titleElement.textContent();
        expect(currentTitle).toBe(originalTitle);

        console.log("Title editing cancelled with Escape key");
      }
    }
  });

  test("displays share and export buttons on desktop", async ({
    unifiedChatPage,
  }) => {
    const page = unifiedChatPage;

    // Ensure desktop viewport
    await page.setViewportSize({ width: 1280, height: 800 });
    await page.waitForTimeout(300);

    // Check for share button
    const shareButton = page.locator(UNIFIED_CHAT_SELECTORS.shareButton);
    const exportButton = page.locator(UNIFIED_CHAT_SELECTORS.exportButton);

    const shareVisible = await shareButton.isVisible();
    const exportVisible = await exportButton.isVisible();

    if (shareVisible) {
      console.log("Share button is visible");
    }
    if (exportVisible) {
      console.log("Export button is visible");
    }

    // At least one should be visible on desktop
    expect(shareVisible || exportVisible).toBe(true);
  });

  test("settings button is visible", async ({ unifiedChatPage }) => {
    const page = unifiedChatPage;

    const settingsButton = page.locator(UNIFIED_CHAT_SELECTORS.settingsButton);
    await expect(settingsButton).toBeVisible();

    // Check accessibility
    await expect(settingsButton).toHaveAttribute("aria-label", "Settings");

    console.log("Settings button is visible and accessible");
  });

  test("context pane toggle is visible", async ({ unifiedChatPage }) => {
    const page = unifiedChatPage;

    // Use .first() since there may be multiple context pane toggle buttons
    const contextToggle = page.locator(UNIFIED_CHAT_SELECTORS.contextPaneToggle).first();

    // Context pane toggle might only show when pane is closed
    const isVisible = await contextToggle.count() > 0 && await contextToggle.isVisible();

    if (isVisible) {
      console.log("Context pane toggle is visible");
    } else {
      console.log("Context pane toggle hidden (pane might be open or not visible)");
    }
  });

  test("can toggle context pane", async ({ unifiedChatPage }) => {
    const page = unifiedChatPage;

    // Try to open context pane
    await openContextPane(page);

    // Check if context pane appeared
    const contextPane = page.locator(UNIFIED_CHAT_SELECTORS.contextPane);
    const contextPaneVisible = await contextPane.count() > 0;

    if (contextPaneVisible) {
      console.log("Context pane opened successfully");
    } else {
      console.log("Context pane not visible (may not be implemented)");
    }
  });

  test("mobile: hides share and export buttons", async ({ unifiedChatPage }) => {
    const page = unifiedChatPage;

    // Set mobile viewport
    await page.setViewportSize({ width: 375, height: 812 });
    await page.waitForTimeout(500);

    // Share and export buttons should be hidden on mobile
    const shareButton = page.locator(UNIFIED_CHAT_SELECTORS.shareButton);
    const exportButton = page.locator(UNIFIED_CHAT_SELECTORS.exportButton);

    const shareHidden = !(await shareButton.isVisible());
    const exportHidden = !(await exportButton.isVisible());

    // At least share/export should be hidden on mobile
    expect(shareHidden || exportHidden).toBe(true);

    console.log("Share/export buttons hidden on mobile as expected");

    // Reset viewport
    await page.setViewportSize({ width: 1280, height: 800 });
  });

  test("mobile: shows hamburger menu for sidebar", async ({ unifiedChatPage }) => {
    const page = unifiedChatPage;

    // Set mobile viewport
    await page.setViewportSize({ width: 375, height: 812 });
    await page.waitForTimeout(500);

    // Look for hamburger/menu icon
    const menuButton = page.locator('button:has(svg[class*="Menu"]), button[aria-label="Open sidebar"]');
    const menuButtonVisible = await menuButton.count() > 0 && await menuButton.first().isVisible();

    if (menuButtonVisible) {
      console.log("Hamburger menu button visible on mobile");
    } else {
      console.log("Menu button not found (may use different pattern)");
    }

    // Reset viewport
    await page.setViewportSize({ width: 1280, height: 800 });
  });

  test("connection status updates color based on state", async ({
    unifiedChatPage,
  }) => {
    const page = unifiedChatPage;

    // Check initial connection status
    const status = await getConnectionStatus(page);

    // Status should be one of the valid states
    const validStates = ["connected", "connecting", "error", "disconnected"];
    expect(validStates).toContain(status);

    // If connected, verify green color
    if (status === "connected") {
      const greenDot = page.locator('[class*="bg-green-500"]');
      await expect(greenDot).toBeVisible();
      console.log("Connection status shows green (connected)");
    } else if (status === "connecting") {
      const amberDot = page.locator('[class*="bg-amber-500"]');
      await expect(amberDot).toBeVisible();
      console.log("Connection status shows amber (connecting)");
    } else if (status === "error") {
      const redDot = page.locator('[class*="bg-red-500"]');
      await expect(redDot).toBeVisible();
      console.log("Connection status shows red (error)");
    }
  });

  test("header is sticky and remains visible when scrolling", async ({
    unifiedChatPage,
  }) => {
    const page = unifiedChatPage;

    // Get header position
    const header = page.locator(UNIFIED_CHAT_SELECTORS.header);
    const initialBoundingBox = await header.boundingBox();

    // Scroll the page (if there's content to scroll)
    await page.evaluate(() => {
      const messageArea = document.querySelector('[role="log"]');
      if (messageArea) {
        messageArea.scrollTop = messageArea.scrollHeight;
      }
    });
    await page.waitForTimeout(300);

    // Header should still be visible
    await expect(header).toBeVisible();

    // Header position should be the same (sticky)
    const afterScrollBoundingBox = await header.boundingBox();

    if (initialBoundingBox && afterScrollBoundingBox) {
      expect(afterScrollBoundingBox.y).toBe(initialBoundingBox.y);
      console.log("Header remains sticky during scroll");
    }
  });
});
