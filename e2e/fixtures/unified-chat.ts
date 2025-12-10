/**
 * E2E Unified Chat Test Fixtures
 *
 * Provides unified chat-specific helpers and fixtures for Playwright tests.
 * Designed to test the unified conversation UI components.
 */

import { Page, expect } from "@playwright/test";
import { test as authTest } from "./auth";

/**
 * Wait times for unified chat operations
 */
export const UNIFIED_CHAT_WAIT_TIMES = {
  UI_UPDATE: 500,
  ANIMATION: 300,
  SIDEBAR_TOGGLE: 500,
  SEARCH_DEBOUNCE: 500,
  MESSAGE_SEND: 2000,
  LOAD_CONVERSATIONS: 5000,
};

/**
 * Unified chat selectors
 */
export const UNIFIED_CHAT_SELECTORS = {
  // Container
  container: '[data-testid="unified-chat-container"]',
  skeleton: '[data-testid="unified-chat-skeleton"]',
  error: '[data-testid="unified-chat-error"]',

  // Header
  header: '[data-testid="unified-header"]',
  headerTitle: 'h1',
  titleEditButton: 'button:has(svg[class*="Edit"])',
  titleInput: 'input[aria-label="Conversation title"]',
  titleSaveButton: 'button[aria-label="Save title"]',
  titleCancelButton: 'button[aria-label="Cancel editing"]',
  connectionStatus: '[class*="bg-green-500"], [class*="bg-amber-500"], [class*="bg-red-500"]',
  shareButton: 'button[aria-label="Share conversation"]',
  exportButton: 'button[aria-label="Export conversation"]',
  settingsButton: 'button[aria-label="Settings"]',
  contextPaneToggle: 'button[aria-label="Open context pane"]',

  // Sidebar
  sidebar: '[data-testid="collapsible-sidebar"]',
  sidebarToggle: '[data-testid="sidebar-toggle"]',
  sidebarOpenButton: 'button[aria-label="Open sidebar"]',
  conversationList: '[data-testid="conversation-list"]',
  conversationItem: 'li[class*="group"]',
  newChatButton: '[data-testid="new-chat-button"]',
  searchInput: '[data-testid="conversation-search"]',
  deleteAllButton: '[data-testid="delete-all-button"]',
  pinnedSection: 'h3:has-text("Pinned")',
  recentSection: 'h3:has-text("Recent")',

  // Conversation Item Actions
  pinButton: 'button[title="Pin"], button[title="Unpin"]',
  archiveButton: 'button[title="Archive"]',
  deleteButton: 'button[title="Delete"]',

  // Input Area
  inputArea: '[data-testid="unified-input-area"]',
  messageInput: '[data-testid="message-input"]',
  sendButton: '[data-testid="send-button"]',
  voiceModeToggle: '[data-testid="voice-mode-toggle"]',
  attachButton: 'button[aria-label="Attach file"]',
  characterCount: 'span[class*="text-neutral-400"]',

  // Context Pane
  contextPane: '[data-testid="context-pane"], [data-testid="collapsible-context-pane"]',
  contextPaneClose: 'button[aria-label="Close context pane"]',

  // Dialogs
  confirmDialog: '[role="dialog"]',
  confirmButton: 'button:has-text("Delete"), button:has-text("Confirm")',
  cancelButton: 'button:has-text("Cancel")',

  // Loading states
  loadingSpinner: '.animate-spin',
  loadingMore: 'div:has(.animate-spin)',

  // Empty states
  emptyState: 'div:has-text("No conversations")',
  noResults: 'div:has-text("No conversations found")',
};

/**
 * Helper to wait for unified chat container to be ready
 */
export async function waitForUnifiedChat(page: Page): Promise<void> {
  // Wait for the main container to be visible
  await page.waitForSelector(UNIFIED_CHAT_SELECTORS.container, { timeout: 10000 });

  // Wait for domcontentloaded instead of networkidle (WebSocket connections may keep network busy)
  await page.waitForLoadState("domcontentloaded");

  // Give React time to fully render
  await page.waitForTimeout(UNIFIED_CHAT_WAIT_TIMES.UI_UPDATE);
}

/**
 * Helper to toggle sidebar visibility
 */
export async function toggleSidebar(page: Page): Promise<void> {
  // Try the toggle button first (when sidebar is open)
  const toggleButton = page.locator(UNIFIED_CHAT_SELECTORS.sidebarToggle);
  // Use .first() since there may be multiple "Open sidebar" buttons (header + sidebar)
  const openButton = page.locator(UNIFIED_CHAT_SELECTORS.sidebarOpenButton).first();

  if (await toggleButton.count() > 0 && await toggleButton.isVisible()) {
    await toggleButton.click();
  } else if (await openButton.count() > 0 && await openButton.isVisible()) {
    await openButton.click();
  }

  await page.waitForTimeout(UNIFIED_CHAT_WAIT_TIMES.ANIMATION);
}

/**
 * Helper to search conversations in sidebar
 */
export async function searchConversations(page: Page, query: string): Promise<void> {
  const searchInput = page.locator(UNIFIED_CHAT_SELECTORS.searchInput);
  await searchInput.fill(query);
  await page.waitForTimeout(UNIFIED_CHAT_WAIT_TIMES.SEARCH_DEBOUNCE);
}

/**
 * Helper to clear conversation search
 */
export async function clearConversationSearch(page: Page): Promise<void> {
  const searchInput = page.locator(UNIFIED_CHAT_SELECTORS.searchInput);
  await searchInput.fill("");
  await page.waitForTimeout(UNIFIED_CHAT_WAIT_TIMES.SEARCH_DEBOUNCE);
}

/**
 * Helper to select a conversation by index
 */
export async function selectConversation(page: Page, index: number): Promise<void> {
  const items = page.locator(UNIFIED_CHAT_SELECTORS.conversationItem);
  await items.nth(index).click();
  await page.waitForLoadState("networkidle");
  await page.waitForTimeout(UNIFIED_CHAT_WAIT_TIMES.UI_UPDATE);
}

/**
 * Helper to create a new conversation
 */
export async function createNewConversation(page: Page): Promise<void> {
  const newChatButton = page.locator(UNIFIED_CHAT_SELECTORS.newChatButton);
  await newChatButton.click();
  await page.waitForLoadState("networkidle");
  await page.waitForTimeout(UNIFIED_CHAT_WAIT_TIMES.UI_UPDATE);
}

/**
 * Helper to get conversation count in sidebar
 */
export async function getConversationCount(page: Page): Promise<number> {
  const items = page.locator(UNIFIED_CHAT_SELECTORS.conversationItem);
  return await items.count();
}

/**
 * Helper to hover over a conversation to show actions
 */
export async function hoverConversation(page: Page, index: number): Promise<void> {
  const items = page.locator(UNIFIED_CHAT_SELECTORS.conversationItem);
  await items.nth(index).hover();
  await page.waitForTimeout(200);
}

/**
 * Helper to pin/unpin a conversation
 */
export async function togglePinConversation(page: Page, index: number): Promise<void> {
  await hoverConversation(page, index);
  const item = page.locator(UNIFIED_CHAT_SELECTORS.conversationItem).nth(index);
  const pinButton = item.locator(UNIFIED_CHAT_SELECTORS.pinButton);
  await pinButton.click();
  await page.waitForTimeout(UNIFIED_CHAT_WAIT_TIMES.UI_UPDATE);
}

/**
 * Helper to delete a conversation
 */
export async function deleteConversation(page: Page, index: number): Promise<void> {
  await hoverConversation(page, index);
  const item = page.locator(UNIFIED_CHAT_SELECTORS.conversationItem).nth(index);
  const deleteButton = item.locator(UNIFIED_CHAT_SELECTORS.deleteButton);
  await deleteButton.click();
  await page.waitForTimeout(UNIFIED_CHAT_WAIT_TIMES.UI_UPDATE);
}

/**
 * Helper to send a message in the unified chat
 */
export async function sendMessage(page: Page, content: string): Promise<void> {
  const input = page.locator(UNIFIED_CHAT_SELECTORS.messageInput);
  await input.fill(content);

  const sendButton = page.locator(UNIFIED_CHAT_SELECTORS.sendButton);
  if (await sendButton.isEnabled()) {
    await sendButton.click();
  } else {
    await input.press("Enter");
  }

  await page.waitForTimeout(UNIFIED_CHAT_WAIT_TIMES.MESSAGE_SEND);
}

/**
 * Helper to toggle voice mode
 */
export async function toggleVoiceMode(page: Page): Promise<void> {
  const voiceToggle = page.locator(UNIFIED_CHAT_SELECTORS.voiceModeToggle);
  await voiceToggle.click();
  await page.waitForTimeout(UNIFIED_CHAT_WAIT_TIMES.ANIMATION);
}

/**
 * Helper to edit conversation title
 */
export async function editConversationTitle(page: Page, newTitle: string): Promise<void> {
  // Click title to enter edit mode
  const titleButton = page.locator(UNIFIED_CHAT_SELECTORS.titleEditButton);
  await titleButton.click();

  // Wait for input to appear
  const titleInput = page.locator(UNIFIED_CHAT_SELECTORS.titleInput);
  await titleInput.waitFor({ timeout: 2000 });

  // Clear and type new title
  await titleInput.fill(newTitle);

  // Save
  const saveButton = page.locator(UNIFIED_CHAT_SELECTORS.titleSaveButton);
  await saveButton.click();

  await page.waitForTimeout(UNIFIED_CHAT_WAIT_TIMES.UI_UPDATE);
}

/**
 * Helper to check if sidebar is open
 */
export async function isSidebarOpen(page: Page): Promise<boolean> {
  const sidebar = page.locator(UNIFIED_CHAT_SELECTORS.sidebar);
  return await sidebar.isVisible();
}

/**
 * Helper to check if voice mode is active
 */
export async function isVoiceModeActive(page: Page): Promise<boolean> {
  const voiceToggle = page.locator(UNIFIED_CHAT_SELECTORS.voiceModeToggle);
  const className = await voiceToggle.getAttribute("class");
  return className?.includes("primary-100") || className?.includes("primary-500") || false;
}

/**
 * Helper to open context pane
 */
export async function openContextPane(page: Page): Promise<void> {
  // Use .first() since there may be multiple context pane toggle buttons
  const toggleButton = page.locator(UNIFIED_CHAT_SELECTORS.contextPaneToggle).first();
  if (await toggleButton.count() > 0 && await toggleButton.isVisible()) {
    await toggleButton.click();
    await page.waitForTimeout(UNIFIED_CHAT_WAIT_TIMES.ANIMATION);
  }
}

/**
 * Helper to check connection status
 */
export async function getConnectionStatus(page: Page): Promise<"connected" | "connecting" | "error" | "disconnected"> {
  const greenDot = page.locator('[class*="bg-green-500"]');
  const amberDot = page.locator('[class*="bg-amber-500"]');
  const redDot = page.locator('[class*="bg-red-500"]');

  if (await greenDot.count() > 0) return "connected";
  if (await amberDot.count() > 0) return "connecting";
  if (await redDot.count() > 0) return "error";
  return "disconnected";
}

/**
 * Helper to enable the unified chat UI feature flag
 * Uses addInitScript to set localStorage BEFORE page scripts run
 */
export async function enableUnifiedChatFeatureFlag(page: Page): Promise<void> {
  // Use addInitScript to ensure the flag is set before React/ExperimentService runs
  // This runs on every new document load (including navigations)
  await page.addInitScript(() => {
    localStorage.setItem("ff_unified_chat_voice_ui", "true");
  });

  // Also set it immediately for the current page context
  await page.evaluate(() => {
    localStorage.setItem("ff_unified_chat_voice_ui", "true");
  });
}

/**
 * Extended test fixture with unified chat page
 * Automatically enables the unified_chat_voice_ui feature flag
 */
export const test = authTest.extend<{
  unifiedChatPage: Page;
}>({
  unifiedChatPage: async ({ authenticatedPage }, use) => {
    // Enable the unified chat feature flag via addInitScript
    // This ensures the flag is set BEFORE React runs on the /chat page
    await enableUnifiedChatFeatureFlag(authenticatedPage);

    // Navigate to chat page - addInitScript will run before page scripts
    await authenticatedPage.goto("/chat");

    // Wait for unified chat to be ready
    await waitForUnifiedChat(authenticatedPage);

    await use(authenticatedPage);
  },
});

export { expect } from "@playwright/test";
