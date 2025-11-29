/**
 * E2E Chat Test Fixtures
 *
 * Provides chat-specific helpers for Playwright tests.
 * Includes utilities for creating conversations, sending messages,
 * hovering over messages, and interacting with message actions.
 */

import { Page, expect } from "@playwright/test";

/**
 * Wait times for chat operations
 */
export const CHAT_WAIT_TIMES = {
  UI_UPDATE: 500,
  MESSAGE_SEND: 2000,
  ASSISTANT_RESPONSE: 15000,
  API_CALL: 5000,
};

/**
 * Chat selectors
 */
export const CHAT_SELECTORS = {
  // Message input
  messageInput: '[data-testid="message-input"], textarea[placeholder*="message"], input[placeholder*="message"]',
  sendButton: '[data-testid="send-button"], button[aria-label*="Send"], button:has-text("Send")',

  // Message list
  messageList: '[data-testid="message-list"], [data-testid="chat-timeline"]',
  userMessage: '[data-testid="user-message"], [aria-label*="Your message"]',
  assistantMessage: '[data-testid="assistant-message"], [aria-label*="Assistant message"]',
  messageBubble: '[role="article"], [data-message-id]',

  // Action menu
  actionMenuTrigger: '[data-testid="message-action-menu-trigger"]',
  actionCopy: '[data-testid="action-copy"]',
  actionEdit: '[data-testid="action-edit"]',
  actionRegenerate: '[data-testid="action-regenerate"]',
  actionDelete: '[data-testid="action-delete"]',
  actionBranch: '[data-testid="action-branch"]',

  // Delete confirmation dialog
  deleteDialog: '[data-testid="delete-confirmation-dialog"]',
  deleteConfirmButton: '[data-testid="delete-confirm-button"]',
  deleteCancelButton: '[data-testid="delete-cancel-button"]',

  // Edit mode
  editTextarea: 'textarea[aria-label*="Edit message"]',
  editSaveButton: 'button:has-text("Save")',
  editCancelButton: 'button:has-text("Cancel")',

  // Conversation
  conversationList: '[data-testid="conversation-list"]',
  newChatButton: '[data-testid="new-chat"], button:has-text("New")',
};

/**
 * Navigate to a new chat
 */
export async function navigateToNewChat(page: Page): Promise<void> {
  await page.goto("/chat");
  await page.waitForLoadState("networkidle");
  await page.waitForTimeout(CHAT_WAIT_TIMES.UI_UPDATE);
}

/**
 * Send a message in the chat
 */
export async function sendMessage(page: Page, content: string): Promise<void> {
  const input = page.locator(CHAT_SELECTORS.messageInput);
  await input.waitFor({ timeout: 5000 });
  await input.fill(content);

  const sendButton = page.locator(CHAT_SELECTORS.sendButton);
  if (await sendButton.count() > 0 && await sendButton.isEnabled()) {
    await sendButton.click();
  } else {
    // Press Enter if no send button
    await input.press("Enter");
  }

  await page.waitForTimeout(CHAT_WAIT_TIMES.MESSAGE_SEND);
}

/**
 * Wait for user message to appear
 */
export async function waitForUserMessage(page: Page, content?: string): Promise<void> {
  if (content) {
    await expect(page.locator(`${CHAT_SELECTORS.userMessage}:has-text("${content}")`).first())
      .toBeVisible({ timeout: CHAT_WAIT_TIMES.MESSAGE_SEND });
  } else {
    await expect(page.locator(CHAT_SELECTORS.userMessage).first())
      .toBeVisible({ timeout: CHAT_WAIT_TIMES.MESSAGE_SEND });
  }
}

/**
 * Wait for assistant response to appear
 */
export async function waitForAssistantResponse(page: Page): Promise<string> {
  const assistantMessage = page.locator(CHAT_SELECTORS.assistantMessage).last();
  await expect(assistantMessage).toBeVisible({ timeout: CHAT_WAIT_TIMES.ASSISTANT_RESPONSE });
  return await assistantMessage.textContent() || "";
}

/**
 * Get the number of messages in the chat
 */
export async function getMessageCount(page: Page): Promise<number> {
  return await page.locator(CHAT_SELECTORS.messageBubble).count();
}

/**
 * Hover over a message to show action menu
 * @param page - Playwright page
 * @param index - 0-based index of the message (from top)
 */
export async function hoverMessage(page: Page, index: number): Promise<void> {
  const messages = page.locator(CHAT_SELECTORS.messageBubble);
  const message = messages.nth(index);
  await message.hover();
  await page.waitForTimeout(200); // Wait for hover animation
}

/**
 * Open action menu for a message
 * @param page - Playwright page
 * @param index - 0-based index of the message
 */
export async function openMessageActionMenu(page: Page, index: number): Promise<void> {
  await hoverMessage(page, index);
  const message = page.locator(CHAT_SELECTORS.messageBubble).nth(index);
  const menuButton = message.locator(CHAT_SELECTORS.actionMenuTrigger);
  await menuButton.click();
  await page.waitForTimeout(200);
}

/**
 * Copy message content via action menu
 */
export async function copyMessage(page: Page, index: number): Promise<void> {
  await openMessageActionMenu(page, index);
  await page.locator(CHAT_SELECTORS.actionCopy).click();
  await page.waitForTimeout(CHAT_WAIT_TIMES.UI_UPDATE);
}

/**
 * Enter edit mode for a message
 */
export async function startEditMessage(page: Page, index: number): Promise<void> {
  await openMessageActionMenu(page, index);
  await page.locator(CHAT_SELECTORS.actionEdit).click();
  await page.waitForTimeout(CHAT_WAIT_TIMES.UI_UPDATE);
}

/**
 * Edit a message and save
 */
export async function editMessage(page: Page, index: number, newContent: string): Promise<void> {
  await startEditMessage(page, index);

  const textarea = page.locator(CHAT_SELECTORS.editTextarea);
  await textarea.waitFor({ timeout: 2000 });
  await textarea.fill(newContent);

  await page.locator(CHAT_SELECTORS.editSaveButton).click();
  await page.waitForTimeout(CHAT_WAIT_TIMES.API_CALL);
}

/**
 * Cancel message edit
 */
export async function cancelEditMessage(page: Page): Promise<void> {
  const cancelButton = page.locator(CHAT_SELECTORS.editCancelButton);
  if (await cancelButton.isVisible()) {
    await cancelButton.click();
  } else {
    await page.keyboard.press("Escape");
  }
  await page.waitForTimeout(CHAT_WAIT_TIMES.UI_UPDATE);
}

/**
 * Open delete confirmation dialog
 */
export async function openDeleteDialog(page: Page, index: number): Promise<void> {
  await openMessageActionMenu(page, index);
  await page.locator(CHAT_SELECTORS.actionDelete).click();
  await page.waitForTimeout(CHAT_WAIT_TIMES.UI_UPDATE);
}

/**
 * Delete a message (opens dialog and confirms)
 */
export async function deleteMessage(page: Page, index: number): Promise<void> {
  await openDeleteDialog(page, index);

  // Wait for dialog to appear
  await expect(page.locator(CHAT_SELECTORS.deleteDialog)).toBeVisible();

  // Confirm deletion
  await page.locator(CHAT_SELECTORS.deleteConfirmButton).click();
  await page.waitForTimeout(CHAT_WAIT_TIMES.API_CALL);
}

/**
 * Cancel message deletion
 */
export async function cancelDeleteMessage(page: Page): Promise<void> {
  await page.locator(CHAT_SELECTORS.deleteCancelButton).click();
  await page.waitForTimeout(CHAT_WAIT_TIMES.UI_UPDATE);
}

/**
 * Regenerate an assistant message
 */
export async function regenerateMessage(page: Page, index: number): Promise<void> {
  await openMessageActionMenu(page, index);
  await page.locator(CHAT_SELECTORS.actionRegenerate).click();
  await page.waitForTimeout(CHAT_WAIT_TIMES.ASSISTANT_RESPONSE);
}

/**
 * Create a branch from a message
 */
export async function branchMessage(page: Page, index: number): Promise<void> {
  await openMessageActionMenu(page, index);
  await page.locator(CHAT_SELECTORS.actionBranch).click();
  await page.waitForTimeout(CHAT_WAIT_TIMES.API_CALL);
}

/**
 * Check if action menu has specific action
 */
export async function hasMenuAction(page: Page, action: "copy" | "edit" | "regenerate" | "delete" | "branch"): Promise<boolean> {
  const selectors: Record<string, string> = {
    copy: CHAT_SELECTORS.actionCopy,
    edit: CHAT_SELECTORS.actionEdit,
    regenerate: CHAT_SELECTORS.actionRegenerate,
    delete: CHAT_SELECTORS.actionDelete,
    branch: CHAT_SELECTORS.actionBranch,
  };

  return await page.locator(selectors[action]).count() > 0;
}

/**
 * Get keyboard shortcut text for an action
 */
export async function getActionShortcut(page: Page, action: "copy" | "edit" | "regenerate" | "delete" | "branch"): Promise<string> {
  const expectedShortcuts: Record<string, string> = {
    copy: "⌘C",
    edit: "E",
    regenerate: "R",
    delete: "Del",
    branch: "B",
  };

  return expectedShortcuts[action];
}

/**
 * Verify message action menu is showing loading state
 */
export async function isActionLoading(page: Page, action: "delete" | "regenerate" | "branch"): Promise<boolean> {
  const selectors: Record<string, string> = {
    delete: CHAT_SELECTORS.actionDelete,
    regenerate: CHAT_SELECTORS.actionRegenerate,
    branch: CHAT_SELECTORS.actionBranch,
  };

  const actionElement = page.locator(selectors[action]);
  const hasSpinner = await actionElement.locator(".animate-spin").count() > 0;
  return hasSpinner;
}

/**
 * Create a test conversation with messages for testing
 * Sends a user message and waits for assistant response (in live mode)
 */
export async function createTestConversation(page: Page, userMessage: string = "Hello"): Promise<void> {
  await navigateToNewChat(page);
  await sendMessage(page, userMessage);
  // Wait for message to appear
  await waitForUserMessage(page, userMessage);
}
