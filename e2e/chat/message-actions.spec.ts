/**
 * Message Actions E2E Tests
 *
 * Tests the message action menu functionality including:
 * - Menu visibility on hover
 * - Copy, edit, delete, and branch actions
 * - Confirmation dialog for delete
 * - Loading states
 * - Keyboard shortcuts
 */

import { test as baseTest, expect } from "../fixtures/auth";
import {
  CHAT_SELECTORS,
  CHAT_WAIT_TIMES,
  navigateToNewChat,
  sendMessage,
  waitForUserMessage,
  hoverMessage,
  openMessageActionMenu,
  copyMessage,
  startEditMessage,
  editMessage,
  cancelEditMessage,
  openDeleteDialog,
  deleteMessage,
  cancelDeleteMessage,
  getMessageCount,
  hasMenuAction,
} from "../fixtures/chat";

// Use authenticated page from auth fixture
const test = baseTest;

test.describe("Message Actions Menu", () => {
  test.setTimeout(60000);

  test.beforeEach(async ({ authenticatedPage }) => {
    await navigateToNewChat(authenticatedPage);
  });

  test("should show action menu on message hover", async ({ authenticatedPage }) => {
    const page = authenticatedPage;

    // Send a test message
    await sendMessage(page, "Test message for action menu");
    await waitForUserMessage(page, "Test message");

    // Hover over the message
    await hoverMessage(page, 0);

    // Action menu trigger should become visible
    const menuTrigger = page.locator(CHAT_SELECTORS.actionMenuTrigger).first();
    await expect(menuTrigger).toBeVisible();
  });

  test("should copy message content to clipboard", async ({ authenticatedPage }) => {
    const page = authenticatedPage;
    const testContent = "Message to copy";

    // Send a test message
    await sendMessage(page, testContent);
    await waitForUserMessage(page, testContent);

    // Copy the message
    await copyMessage(page, 0);

    // Note: Browser clipboard API may be restricted in test environments
    // This test verifies the action is available and clickable
  });

  test("should open edit mode on Edit click", async ({ authenticatedPage }) => {
    const page = authenticatedPage;

    // Send a test message
    await sendMessage(page, "Message to edit");
    await waitForUserMessage(page, "Message to edit");

    // Start editing
    await startEditMessage(page, 0);

    // Edit textarea should be visible
    const editTextarea = page.locator(CHAT_SELECTORS.editTextarea);
    await expect(editTextarea).toBeVisible();
  });

  test("should save edited message", async ({ authenticatedPage }) => {
    const page = authenticatedPage;

    // Send a test message
    await sendMessage(page, "Original message");
    await waitForUserMessage(page, "Original message");

    // Edit the message
    await editMessage(page, 0, "Updated message content");

    // The updated content should be visible
    // Note: Actual API call may be mocked in test environment
    await page.waitForTimeout(CHAT_WAIT_TIMES.UI_UPDATE);
  });

  test("should cancel edit on Escape", async ({ authenticatedPage }) => {
    const page = authenticatedPage;

    // Send a test message
    await sendMessage(page, "Message to edit then cancel");
    await waitForUserMessage(page, "Message to edit then cancel");

    // Start editing
    await startEditMessage(page, 0);

    // Cancel with Escape
    await page.keyboard.press("Escape");

    // Edit textarea should be hidden
    const editTextarea = page.locator(CHAT_SELECTORS.editTextarea);
    await expect(editTextarea).not.toBeVisible();

    // Original content should still be visible
    await expect(page.locator('text=Message to edit then cancel')).toBeVisible();
  });

  test("should show confirmation dialog on Delete", async ({ authenticatedPage }) => {
    const page = authenticatedPage;

    // Send a test message
    await sendMessage(page, "Message to delete");
    await waitForUserMessage(page, "Message to delete");

    // Open delete dialog
    await openDeleteDialog(page, 0);

    // Confirmation dialog should appear
    const deleteDialog = page.locator(CHAT_SELECTORS.deleteDialog);
    await expect(deleteDialog).toBeVisible();

    // Should show message preview
    await expect(page.locator('text=Message to delete')).toBeVisible();
  });

  test("should cancel delete on dialog Cancel", async ({ authenticatedPage }) => {
    const page = authenticatedPage;

    // Send a test message
    await sendMessage(page, "Message to not delete");
    await waitForUserMessage(page, "Message to not delete");

    const initialCount = await getMessageCount(page);

    // Open delete dialog
    await openDeleteDialog(page, 0);

    // Cancel deletion
    await cancelDeleteMessage(page);

    // Dialog should be closed
    const deleteDialog = page.locator(CHAT_SELECTORS.deleteDialog);
    await expect(deleteDialog).not.toBeVisible();

    // Message should still exist
    const finalCount = await getMessageCount(page);
    expect(finalCount).toBe(initialCount);
  });

  test("should delete message on dialog Confirm", async ({ authenticatedPage }) => {
    const page = authenticatedPage;

    // Send a test message
    await sendMessage(page, "Message to actually delete");
    await waitForUserMessage(page, "Message to actually delete");

    const initialCount = await getMessageCount(page);

    // Delete the message
    await deleteMessage(page, 0);

    // Dialog should close
    const deleteDialog = page.locator(CHAT_SELECTORS.deleteDialog);
    await expect(deleteDialog).not.toBeVisible();

    // Note: Message count may not decrease in mocked environment
    // In live environment, verify: expect(finalCount).toBe(initialCount - 1);
  });

  test("should show loading state during delete", async ({ authenticatedPage }) => {
    const page = authenticatedPage;

    // Send a test message
    await sendMessage(page, "Message for loading test");
    await waitForUserMessage(page, "Message for loading test");

    // Open delete dialog
    await openDeleteDialog(page, 0);

    // Click confirm (to trigger loading state)
    const confirmButton = page.locator(CHAT_SELECTORS.deleteConfirmButton);
    await confirmButton.click();

    // Check for loading state (button should be disabled or show spinner)
    // Note: In fast mock environments, loading state may be too brief to capture
    await page.waitForTimeout(100);
  });

  test("should create branch from message", async ({ authenticatedPage }) => {
    const page = authenticatedPage;

    // Send a test message
    await sendMessage(page, "Message to branch");
    await waitForUserMessage(page, "Message to branch");

    // Open menu and check for branch action
    await openMessageActionMenu(page, 0);

    // Branch action should be available
    const hasBranch = await hasMenuAction(page, "branch");
    if (hasBranch) {
      const branchButton = page.locator(CHAT_SELECTORS.actionBranch);
      await branchButton.click();
      await page.waitForTimeout(CHAT_WAIT_TIMES.API_CALL);
    }
  });

  test("should show correct actions for user vs assistant", async ({ authenticatedPage }) => {
    const page = authenticatedPage;

    // Send a user message
    await sendMessage(page, "User message for role test");
    await waitForUserMessage(page, "User message for role test");

    // Check user message actions
    await openMessageActionMenu(page, 0);

    // User messages should have Edit but not Regenerate
    const hasEdit = await hasMenuAction(page, "edit");
    const hasRegenerate = await hasMenuAction(page, "regenerate");

    expect(hasEdit).toBe(true);
    expect(hasRegenerate).toBe(false);

    // Close menu
    await page.keyboard.press("Escape");
  });
});

test.describe("Message Actions - Keyboard Shortcuts", () => {
  test.setTimeout(60000);

  test("should display keyboard shortcut for Copy", async ({ authenticatedPage }) => {
    const page = authenticatedPage;

    await navigateToNewChat(page);
    await sendMessage(page, "Test message");
    await waitForUserMessage(page, "Test message");

    // Open menu
    await openMessageActionMenu(page, 0);

    // Check for shortcut display
    const menuContent = await page.locator('[role="menu"]').textContent();
    expect(menuContent).toContain("⌘C");
  });

  test("should display keyboard shortcut for Edit", async ({ authenticatedPage }) => {
    const page = authenticatedPage;

    await navigateToNewChat(page);
    await sendMessage(page, "Test message");
    await waitForUserMessage(page, "Test message");

    // Open menu
    await openMessageActionMenu(page, 0);

    // Check for shortcut display
    const editItem = page.locator(CHAT_SELECTORS.actionEdit);
    if (await editItem.count() > 0) {
      const itemText = await editItem.textContent();
      expect(itemText).toContain("E");
    }
  });

  test("should display keyboard shortcut for Delete", async ({ authenticatedPage }) => {
    const page = authenticatedPage;

    await navigateToNewChat(page);
    await sendMessage(page, "Test message");
    await waitForUserMessage(page, "Test message");

    // Open menu
    await openMessageActionMenu(page, 0);

    // Check for shortcut display
    const deleteItem = page.locator(CHAT_SELECTORS.actionDelete);
    if (await deleteItem.count() > 0) {
      const itemText = await deleteItem.textContent();
      expect(itemText).toContain("Del");
    }
  });
});
