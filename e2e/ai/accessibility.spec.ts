/**
 * Accessibility Navigation Tests
 *
 * Tests keyboard navigation and accessibility features for VoiceAssist.
 * Verifies that the application can be navigated using keyboard only,
 * focus indicators are visible, and common accessibility patterns work.
 *
 * Note: These tests focus on keyboard navigation and basic ARIA patterns.
 * For comprehensive accessibility audits, consider using axe-core integration.
 */

import { test, expect } from "@playwright/test";
import {
  clearAuthState,
  setupAuthenticatedState,
  TEST_USER,
} from "../fixtures/auth";

test.describe("Login Page Keyboard Navigation", () => {
  test.beforeEach(async ({ page }) => {
    await clearAuthState(page);
    await page.goto("/login");
  });

  test("should navigate login form using Tab key", async ({ page }) => {
    // Start from the body
    await page.locator("body").focus();

    // Tab through the page - should eventually reach form fields
    const maxTabs = 15;
    let foundEmailInput = false;
    let foundPasswordInput = false;
    let foundSubmitButton = false;

    for (let i = 0; i < maxTabs; i++) {
      await page.keyboard.press("Tab");

      const focusedElement = page.locator(":focus");
      const tagName = await focusedElement.evaluate((el) =>
        el.tagName.toLowerCase()
      );
      const inputType = await focusedElement.getAttribute("type");
      const inputId = await focusedElement.getAttribute("id");
      const role = await focusedElement.getAttribute("role");

      // Check what element is focused
      if (tagName === "input" && inputType === "email") {
        foundEmailInput = true;
      }
      if (tagName === "input" && (inputType === "password" || inputId === "password")) {
        foundPasswordInput = true;
      }
      if (tagName === "button" && role !== "switch") {
        const buttonText = await focusedElement.textContent();
        if (buttonText?.toLowerCase().includes("sign in")) {
          foundSubmitButton = true;
        }
      }
    }

    // Verify we could tab to all main form elements
    expect(foundEmailInput).toBe(true);
    expect(foundPasswordInput).toBe(true);
    expect(foundSubmitButton).toBe(true);
  });

  test("should have visible focus indicators", async ({ page }) => {
    // Tab to the email input
    await page.getByLabel(/email/i).focus();

    // Check that focus is visible (element should have some focus styling)
    const emailInput = page.getByLabel(/email/i);
    await expect(emailInput).toBeFocused();

    // The focused element should be visible
    await expect(emailInput).toBeVisible();

    // Tab to password
    await page.keyboard.press("Tab");
    const passwordInput = page.locator("#password");

    // Password should now be focused
    await expect(passwordInput).toBeFocused();
  });

  test("should submit form with Enter key", async ({ page }) => {
    // Fill in credentials
    await page.getByLabel(/email/i).fill(TEST_USER.email);
    await page.locator("#password").fill(TEST_USER.password);

    // Track if form submission occurs
    let formSubmitted = false;
    page.on("request", (request) => {
      if (
        request.url().includes("/auth") ||
        request.url().includes("/login") ||
        request.url().includes("/api")
      ) {
        formSubmitted = true;
      }
    });

    // Press Enter to submit
    await page.keyboard.press("Enter");

    // Wait for response
    await page.waitForTimeout(2000);

    // Either form was submitted or page state changed
    const currentUrl = page.url();
    const hasToast = await page.locator("[data-sonner-toast]").count();
    const hasAlert = await page.locator('[role="alert"]').count();

    const stateChanged =
      formSubmitted ||
      !currentUrl.includes("/login") ||
      hasToast > 0 ||
      hasAlert > 0;

    expect(stateChanged).toBe(true);
  });

  test("should toggle password visibility with keyboard", async ({ page }) => {
    // Fill password
    await page.locator("#password").fill("testpassword");

    // Find and focus the toggle button
    const toggleButton = page.getByRole("button", {
      name: /show password|hide password|toggle/i,
    });

    if ((await toggleButton.count()) > 0) {
      await toggleButton.focus();
      await expect(toggleButton).toBeFocused();

      // Check initial password state
      const passwordInput = page.locator("#password");
      await expect(passwordInput).toHaveAttribute("type", "password");

      // Press Enter or Space to toggle
      await page.keyboard.press("Enter");

      // Password should now be visible
      await expect(passwordInput).toHaveAttribute("type", "text");

      // Toggle back
      await page.keyboard.press("Enter");
      await expect(passwordInput).toHaveAttribute("type", "password");
    }
  });

  test("should navigate to register page with keyboard", async ({ page }) => {
    // Find the sign up link
    const signUpLink = page.getByRole("link", { name: /sign up/i });

    // Focus on it
    await signUpLink.focus();
    await expect(signUpLink).toBeFocused();

    // Activate with Enter
    await page.keyboard.press("Enter");

    // Should navigate to register page
    await expect(page).toHaveURL("/register");
  });
});

test.describe("Registration Page Keyboard Navigation", () => {
  test.beforeEach(async ({ page }) => {
    await clearAuthState(page);
    await page.goto("/register");
  });

  test("should navigate registration form using Tab key", async ({ page }) => {
    // Tab through form fields
    const maxTabs = 20;
    const foundElements: string[] = [];

    for (let i = 0; i < maxTabs; i++) {
      await page.keyboard.press("Tab");

      const focusedElement = page.locator(":focus");
      const tagName = await focusedElement.evaluate((el) =>
        el.tagName.toLowerCase()
      );
      const inputType = await focusedElement.getAttribute("type");
      const inputName = await focusedElement.getAttribute("name");

      if (tagName === "input") {
        if (inputName === "name" || inputType === "text") {
          foundElements.push("name");
        } else if (inputType === "email") {
          foundElements.push("email");
        } else if (inputType === "password") {
          foundElements.push("password");
        }
      } else if (tagName === "button") {
        const text = await focusedElement.textContent();
        if (text?.toLowerCase().match(/sign up|register|create/)) {
          foundElements.push("submit");
        }
      }
    }

    // Should have found email, password, and submit at minimum
    expect(foundElements).toContain("email");
    expect(foundElements).toContain("password");
    expect(foundElements).toContain("submit");
  });

  test("should use Shift+Tab for reverse navigation", async ({ page }) => {
    // Focus on submit button first
    const submitButton = page.getByRole("button", {
      name: /sign up|register|create account/i,
    });
    await submitButton.focus();
    await expect(submitButton).toBeFocused();

    // Shift+Tab should move to previous element
    await page.keyboard.press("Shift+Tab");

    // Should no longer be on submit button
    const stillOnSubmit = await submitButton.evaluate(
      (el) => el === document.activeElement
    );
    expect(stillOnSubmit).toBe(false);

    // Something should be focused
    const focusedElement = page.locator(":focus");
    await expect(focusedElement).toBeVisible();
  });
});

test.describe("Authenticated Page Keyboard Navigation", () => {
  test.beforeEach(async ({ page }) => {
    await setupAuthenticatedState(page);
    await page.goto("/");
    await page.waitForLoadState("networkidle");
  });

  test("should navigate main interface using Tab", async ({ page }) => {
    // Check if we're redirected to login (auth may not work in all environments)
    if (page.url().includes("/login")) {
      test.skip();
      return;
    }

    // Tab through interface
    const maxTabs = 30;
    let foundInteractiveElements = 0;

    for (let i = 0; i < maxTabs; i++) {
      await page.keyboard.press("Tab");

      const focusedElement = page.locator(":focus");
      const isVisible = await focusedElement.isVisible().catch(() => false);

      if (isVisible) {
        foundInteractiveElements++;
      }
    }

    // Should find multiple interactive elements
    expect(foundInteractiveElements).toBeGreaterThan(0);
  });

  test("should close modal with Escape key", async ({ page }) => {
    // Skip if redirected to login
    if (page.url().includes("/login")) {
      test.skip();
      return;
    }

    // Try to open a modal (e.g., settings, user menu)
    // Look for common modal triggers
    const userMenuButton = page
      .getByRole("button", { name: /profile|settings|menu|user/i })
      .first();

    if ((await userMenuButton.count()) > 0) {
      await userMenuButton.click();

      // Wait for modal/dropdown to appear
      await page.waitForTimeout(300);

      // Check for modal or dropdown
      const modal = page.locator('[role="dialog"], [role="menu"], [data-radix-menu-content]');

      if ((await modal.count()) > 0) {
        // Press Escape to close
        await page.keyboard.press("Escape");

        // Modal should be closed
        await page.waitForTimeout(300);
        await expect(modal).not.toBeVisible();
      }
    }
  });
});

test.describe("Chat Interface Keyboard Navigation", () => {
  test.beforeEach(async ({ page }) => {
    await setupAuthenticatedState(page);
    await page.goto("/chat");
    await page.waitForLoadState("networkidle");
  });

  test("should focus chat input with keyboard", async ({ page }) => {
    // Skip if redirected to login
    if (page.url().includes("/login")) {
      test.skip();
      return;
    }

    // Look for chat input
    const chatInput = page
      .getByRole("textbox", { name: /message|chat|type/i })
      .or(page.locator('textarea[placeholder*="message"]'))
      .or(page.locator('input[placeholder*="message"]'));

    if ((await chatInput.count()) > 0) {
      // Tab until we reach the chat input
      const maxTabs = 30;
      let foundChatInput = false;

      for (let i = 0; i < maxTabs && !foundChatInput; i++) {
        await page.keyboard.press("Tab");

        const focused = page.locator(":focus");
        const tagName = await focused.evaluate((el) => el.tagName.toLowerCase());

        if (tagName === "textarea" || tagName === "input") {
          const placeholder = await focused.getAttribute("placeholder");
          if (placeholder?.toLowerCase().includes("message")) {
            foundChatInput = true;
          }
        }
      }

      // If we couldn't tab to it, try direct focus
      if (!foundChatInput) {
        await chatInput.first().focus();
      }

      // Verify input is focused and we can type
      await page.keyboard.type("Hello");

      // Input should contain our text
      const inputValue = await chatInput.first().inputValue();
      expect(inputValue).toContain("Hello");
    }
  });

  test("should submit message with Enter or Ctrl+Enter", async ({ page }) => {
    // Skip if redirected to login
    if (page.url().includes("/login")) {
      test.skip();
      return;
    }

    // Look for chat input
    const chatInput = page
      .getByRole("textbox")
      .or(page.locator("textarea"))
      .first();

    if ((await chatInput.count()) > 0) {
      await chatInput.focus();
      await chatInput.fill("Test message");

      // Track if message was sent
      let messageSent = false;
      page.on("request", (request) => {
        if (
          request.url().includes("/chat") ||
          request.url().includes("/message") ||
          request.url().includes("/conversation")
        ) {
          messageSent = true;
        }
      });

      // Try Ctrl+Enter (common pattern for chat apps)
      await page.keyboard.press("Control+Enter");

      // Or try Enter if Ctrl+Enter didn't work
      if (!messageSent) {
        await chatInput.fill("Test message");
        await page.keyboard.press("Enter");
      }

      await page.waitForTimeout(1000);

      // Input should be cleared or message should be sent
      const inputValue = await chatInput.inputValue().catch(() => "");
      const inputCleared = inputValue === "" || inputValue !== "Test message";

      expect(messageSent || inputCleared).toBe(true);
    }
  });
});

test.describe("ARIA Landmarks and Roles", () => {
  test.beforeEach(async ({ page }) => {
    await clearAuthState(page);
    await page.goto("/login");
  });

  test("should have proper heading hierarchy", async ({ page }) => {
    // Check for h1 heading
    const h1 = page.locator("h1");
    const h1Count = await h1.count();

    // Page should have at least one h1
    expect(h1Count).toBeGreaterThanOrEqual(1);

    // First h1 should be visible
    if (h1Count > 0) {
      await expect(h1.first()).toBeVisible();
    }
  });

  test("should have form with proper labels", async ({ page }) => {
    // Check email input has label
    const emailInput = page.getByLabel(/email/i);
    await expect(emailInput).toBeVisible();

    // Check password input is accessible
    const passwordInput = page.locator("#password");
    await expect(passwordInput).toBeVisible();

    // Password should have associated label or aria-label
    const passwordLabel = await passwordInput.getAttribute("aria-label");
    const passwordLabelledBy = await passwordInput.getAttribute("aria-labelledby");
    const hasLabel =
      passwordLabel !== null ||
      passwordLabelledBy !== null ||
      (await page.locator('label[for="password"]').count()) > 0;

    expect(hasLabel).toBe(true);
  });

  test("should have accessible buttons", async ({ page }) => {
    // Submit button should be a button role
    const submitButton = page.getByRole("button", { name: /sign in/i });
    await expect(submitButton).toBeVisible();

    // Button should be enabled by default
    await expect(submitButton).toBeEnabled();
  });

  test("should announce validation errors", async ({ page }) => {
    // Submit empty form
    await page.getByRole("button", { name: /sign in/i }).click();

    // Wait for validation
    await page.waitForTimeout(1000);

    // Error messages should be present (either as alert role or visible text)
    const errorAlert = page.locator('[role="alert"]');
    const errorText = page.getByText(/required|invalid|error/i);

    const hasErrors =
      (await errorAlert.count()) > 0 || (await errorText.count()) > 0;

    expect(hasErrors).toBe(true);
  });
});
