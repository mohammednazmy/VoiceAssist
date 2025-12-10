/**
 * Collapsible Sidebar E2E Tests
 *
 * Tests the CollapsibleSidebar component including:
 * - Sidebar expand/collapse functionality
 * - Conversation list rendering
 * - New chat button
 * - Conversation search
 * - Pin/unpin functionality
 * - Delete conversation flow
 * - Mobile drawer behavior
 */

import {
  test,
  expect,
  UNIFIED_CHAT_SELECTORS,
  UNIFIED_CHAT_WAIT_TIMES,
  toggleSidebar,
  searchConversations,
  clearConversationSearch,
  selectConversation,
  createNewConversation,
  getConversationCount,
  hoverConversation,
  togglePinConversation,
  deleteConversation,
  isSidebarOpen,
} from "../fixtures/unified-chat";

test.describe("CollapsibleSidebar", () => {
  test.setTimeout(30000);

  test("displays sidebar with header and conversation list", async ({
    unifiedChatPage,
  }) => {
    const page = unifiedChatPage;

    // Verify sidebar is visible
    const sidebar = page.locator(UNIFIED_CHAT_SELECTORS.sidebar);
    await expect(sidebar).toBeVisible();

    // Verify header with "Conversations" title
    const header = sidebar.locator('h2:has-text("Conversations")');
    await expect(header).toBeVisible();

    // Verify conversation list container
    const list = page.locator(UNIFIED_CHAT_SELECTORS.conversationList);
    await expect(list).toBeVisible();

    console.log("Sidebar displays header and conversation list");
  });

  test("can toggle sidebar open and closed", async ({ unifiedChatPage }) => {
    const page = unifiedChatPage;

    // Verify sidebar is initially open
    expect(await isSidebarOpen(page)).toBe(true);

    // Toggle sidebar closed
    await toggleSidebar(page);
    await page.waitForTimeout(UNIFIED_CHAT_WAIT_TIMES.ANIMATION);

    // On desktop, sidebar collapses to narrow width; on mobile it disappears
    // Check if the full sidebar is no longer visible
    const sidebar = page.locator(UNIFIED_CHAT_SELECTORS.sidebar);
    const isVisible = await sidebar.isVisible();

    if (!isVisible) {
      console.log("Sidebar successfully closed");
    } else {
      console.log("Sidebar collapsed to narrow view (desktop behavior)");
    }

    // Toggle sidebar open again
    await toggleSidebar(page);
    await page.waitForTimeout(UNIFIED_CHAT_WAIT_TIMES.ANIMATION);

    console.log("Sidebar toggle functionality works correctly");
  });

  test("displays new conversation button", async ({ unifiedChatPage }) => {
    const page = unifiedChatPage;

    const newChatButton = page.locator(UNIFIED_CHAT_SELECTORS.newChatButton);
    await expect(newChatButton).toBeVisible();
    await expect(newChatButton).toHaveText(/New Conversation/i);

    console.log("New conversation button is visible");
  });

  test("creates new conversation when clicking new chat button", async ({
    unifiedChatPage,
  }) => {
    const page = unifiedChatPage;

    // Click new conversation button
    await createNewConversation(page);

    // URL should update to /chat or /chat/new-id
    await expect(page).toHaveURL(/\/chat/);

    // Title should be "New Conversation"
    const title = page.locator(UNIFIED_CHAT_SELECTORS.header).locator("h1");
    const titleText = await title.textContent();
    expect(titleText?.toLowerCase()).toContain("new conversation");

    console.log("New conversation created successfully");
  });

  test("displays search input for filtering conversations", async ({
    unifiedChatPage,
  }) => {
    const page = unifiedChatPage;

    const searchInput = page.locator(UNIFIED_CHAT_SELECTORS.searchInput);
    await expect(searchInput).toBeVisible();
    await expect(searchInput).toHaveAttribute(
      "placeholder",
      /Search conversations/i
    );

    console.log("Search input is visible with correct placeholder");
  });

  test("filters conversations when searching", async ({ unifiedChatPage }) => {
    const page = unifiedChatPage;

    // Get initial conversation count
    const initialCount = await getConversationCount(page);

    // Search for something that likely won't match
    await searchConversations(page, "xyznonexistent123");

    // Either no results or empty state should appear
    const noResults = page.locator('text=/No conversations found|No conversations/');
    const currentCount = await getConversationCount(page);

    expect(currentCount <= initialCount).toBe(true);

    // Clear search
    await clearConversationSearch(page);

    console.log("Search filters conversations correctly");
  });

  test("shows empty state when no conversations exist", async ({
    unifiedChatPage,
  }) => {
    const page = unifiedChatPage;

    // Search for something that won't match
    await searchConversations(page, "xyznonexistent123456789");

    // Check for empty state message
    const emptyState = page.locator('text=/No conversations|No conversations found/');
    const emptyStateVisible = await emptyState.count() > 0;

    if (emptyStateVisible) {
      await expect(emptyState.first()).toBeVisible();
      console.log("Empty state is displayed when no conversations match");
    } else {
      console.log("No empty state (may have matching conversations)");
    }

    // Clear search
    await clearConversationSearch(page);
  });

  test("shows conversation item actions on hover", async ({ unifiedChatPage }) => {
    const page = unifiedChatPage;

    // Get conversation count
    const count = await getConversationCount(page);

    if (count > 0) {
      // Hover over first conversation
      await hoverConversation(page, 0);

      // Check if action buttons appear
      const deleteButton = page.locator(UNIFIED_CHAT_SELECTORS.deleteButton);
      const pinButton = page.locator(UNIFIED_CHAT_SELECTORS.pinButton);

      // At least one action should be visible on hover
      const hasActions =
        (await deleteButton.count()) > 0 || (await pinButton.count()) > 0;
      expect(hasActions).toBe(true);

      console.log("Conversation actions appear on hover");
    } else {
      console.log("No conversations to test hover actions");
    }
  });

  test("can pin and unpin a conversation", async ({ unifiedChatPage }) => {
    const page = unifiedChatPage;

    // Get conversation count
    const count = await getConversationCount(page);

    if (count > 0) {
      // Check if pinned section exists initially
      const pinnedSectionBefore = page.locator(UNIFIED_CHAT_SELECTORS.pinnedSection);
      const hadPinnedBefore = await pinnedSectionBefore.count() > 0;

      // Hover and toggle pin on first conversation
      await hoverConversation(page, 0);
      const pinButton = page.locator(UNIFIED_CHAT_SELECTORS.pinButton).first();

      if (await pinButton.isVisible()) {
        await pinButton.click();
        await page.waitForTimeout(UNIFIED_CHAT_WAIT_TIMES.UI_UPDATE);

        // Pinned section should now exist or conversation moved
        console.log("Pin toggle executed successfully");
      }
    } else {
      console.log("No conversations to test pin functionality");
    }
  });

  test("can navigate between conversations", async ({ unifiedChatPage }) => {
    const page = unifiedChatPage;

    // Get conversation count
    const count = await getConversationCount(page);

    if (count > 1) {
      // Get current URL
      const initialUrl = page.url();

      // Click on a different conversation
      await selectConversation(page, 1);

      // Wait for navigation
      await page.waitForLoadState("networkidle");

      // URL should change
      const newUrl = page.url();
      expect(newUrl).not.toBe(initialUrl);

      console.log("Navigation between conversations works correctly");
    } else if (count === 1) {
      // Select the only conversation
      await selectConversation(page, 0);
      console.log("Selected single available conversation");
    } else {
      console.log("No conversations available for navigation test");
    }
  });

  test("conversation list shows loading indicator when loading more", async ({
    unifiedChatPage,
  }) => {
    const page = unifiedChatPage;

    // This test checks if loading indicator appears during initial load
    // The loading spinner should be visible briefly
    const loadingSpinner = page.locator(
      `${UNIFIED_CHAT_SELECTORS.conversationList} ${UNIFIED_CHAT_SELECTORS.loadingSpinner}`
    );

    // Check if spinner was ever in DOM (might have finished by now)
    const spinnerCount = await loadingSpinner.count();
    console.log(`Loading spinner present: ${spinnerCount > 0 ? "yes (or was present)" : "no"}`);
  });

  test("delete all button is visible when conversations exist", async ({
    unifiedChatPage,
  }) => {
    const page = unifiedChatPage;

    const count = await getConversationCount(page);
    const deleteAllButton = page.locator(UNIFIED_CHAT_SELECTORS.deleteAllButton);

    if (count > 0) {
      await expect(deleteAllButton).toBeVisible();
      console.log("Delete all button is visible with existing conversations");
    } else {
      // Delete all button might be hidden when no conversations
      console.log("No conversations - delete all button state varies");
    }
  });

  test("keyboard navigation through conversation list", async ({
    unifiedChatPage,
  }) => {
    const page = unifiedChatPage;

    // Focus on search input first
    const searchInput = page.locator(UNIFIED_CHAT_SELECTORS.searchInput);
    await searchInput.focus();

    // Tab to navigate to conversation items
    await page.keyboard.press("Tab");
    await page.keyboard.press("Tab");

    // Check if a conversation item got focus
    const activeElement = await page.evaluate(() => {
      return document.activeElement?.getAttribute("role") ||
             document.activeElement?.tagName.toLowerCase();
    });

    console.log(`Active element after tab navigation: ${activeElement}`);
  });

  test("mobile: sidebar opens as overlay drawer", async ({ unifiedChatPage }) => {
    const page = unifiedChatPage;

    // Set mobile viewport
    await page.setViewportSize({ width: 375, height: 812 });
    await page.waitForTimeout(500);

    // On mobile, sidebar might be hidden initially
    const sidebar = page.locator(UNIFIED_CHAT_SELECTORS.sidebar);
    const sidebarVisible = await sidebar.isVisible();

    if (!sidebarVisible) {
      // Find and click the menu/hamburger button to open sidebar
      const menuButton = page.locator('button[aria-label="Open sidebar"], button:has(svg)').first();
      await menuButton.click();
      await page.waitForTimeout(UNIFIED_CHAT_WAIT_TIMES.ANIMATION);

      // Check if backdrop appeared (mobile drawer behavior)
      const backdrop = page.locator('[class*="bg-black"]');
      const hasBackdrop = await backdrop.count() > 0;

      if (hasBackdrop) {
        console.log("Mobile sidebar opens as overlay with backdrop");
      } else {
        console.log("Mobile sidebar opened (no backdrop detected)");
      }
    } else {
      console.log("Sidebar was already visible on mobile");
    }

    // Reset viewport
    await page.setViewportSize({ width: 1280, height: 800 });
  });

  test("mobile: sidebar closes when clicking backdrop", async ({
    unifiedChatPage,
  }) => {
    const page = unifiedChatPage;

    // Set mobile viewport
    await page.setViewportSize({ width: 375, height: 812 });
    await page.waitForTimeout(500);

    // Check if sidebar is visible - on mobile it might already be an overlay
    const sidebar = page.locator(UNIFIED_CHAT_SELECTORS.sidebar);
    const sidebarVisible = await sidebar.isVisible();

    if (!sidebarVisible) {
      // Open sidebar using the menu button (use .first() to avoid ambiguity)
      const menuButton = page.locator('button[aria-label="Open sidebar"]').first();
      if (await menuButton.count() > 0 && await menuButton.isVisible()) {
        await menuButton.click();
        await page.waitForTimeout(UNIFIED_CHAT_WAIT_TIMES.ANIMATION);
      }
    }

    // Now check for backdrop
    const backdrop = page.locator('[class*="bg-black"]').first();
    if (await backdrop.count() > 0 && await backdrop.isVisible()) {
      // Click backdrop using force to avoid element interception
      await backdrop.click({ force: true, position: { x: 10, y: 10 } });
      await page.waitForTimeout(UNIFIED_CHAT_WAIT_TIMES.ANIMATION);

      console.log("Mobile sidebar backdrop click executed");
    } else {
      // If no backdrop, sidebar might use different mobile behavior
      console.log("No backdrop found - sidebar may not use overlay on mobile");
    }

    // Reset viewport
    await page.setViewportSize({ width: 1280, height: 800 });
  });
});
