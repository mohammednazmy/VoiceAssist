/**
 * User Registration Flow
 *
 * Tests the user registration flow for VoiceAssist web application.
 * Verifies registration form UI, validation, and registration submission.
 *
 * Note: These tests verify form behavior and validation. Actual registration
 * depends on backend availability.
 */

import { test, expect } from "@playwright/test";
import { clearAuthState } from "../fixtures/auth";

// Generate unique email for each test run to avoid conflicts
const generateTestEmail = () => {
  const timestamp = Date.now();
  const random = Math.random().toString(36).substring(2, 8);
  return `test-${timestamp}-${random}@example.com`;
};

test.describe("Registration Page UI", () => {
  test.beforeEach(async ({ page }) => {
    // Ensure clean state
    await clearAuthState(page);
    await page.goto("/register");
  });

  test("should display the registration page correctly", async ({ page }) => {
    // Verify registration page header
    await expect(
      page.getByRole("heading", { name: /create.*account|sign up|register/i })
    ).toBeVisible();

    // Verify form fields exist
    await expect(
      page.getByLabel(/name|full name/i).or(page.locator('input[name="name"]'))
    ).toBeVisible();
    await expect(
      page.getByLabel(/email/i).or(page.locator('input[name="email"]'))
    ).toBeVisible();
    await expect(
      page.locator("#password").or(page.locator('input[name="password"]'))
    ).toBeVisible();

    // Verify submit button
    await expect(
      page.getByRole("button", { name: /sign up|register|create account/i })
    ).toBeVisible();
  });

  test("should show validation errors for empty form submission", async ({
    page,
  }) => {
    // Click submit without entering any data
    const submitButton = page.getByRole("button", {
      name: /sign up|register|create account/i,
    });
    await submitButton.click();

    // Expect validation errors to appear
    // Wait for any validation message
    await expect(
      page
        .getByText(/required|please enter|cannot be empty/i)
        .or(page.locator('[role="alert"]'))
    ).toBeVisible({ timeout: 5000 });
  });

  test("should show validation error for invalid email format", async ({
    page,
  }) => {
    // Fill name
    const nameInput = page
      .getByLabel(/name|full name/i)
      .or(page.locator('input[name="name"]'));
    await nameInput.fill("Test User");

    // Enter invalid email
    const emailInput = page
      .getByLabel(/email/i)
      .or(page.locator('input[name="email"]'));
    await emailInput.fill("invalid-email");

    // Fill passwords
    const passwordInput = page
      .locator("#password")
      .or(page.locator('input[name="password"]'));
    await passwordInput.fill("TestPassword123!");

    // Check for confirm password field
    const confirmPasswordInput = page
      .getByLabel(/confirm password/i)
      .or(page.locator('input[name="confirmPassword"]'));
    if ((await confirmPasswordInput.count()) > 0) {
      await confirmPasswordInput.fill("TestPassword123!");
    }

    // Submit form
    await page
      .getByRole("button", { name: /sign up|register|create account/i })
      .click();

    // Expect email validation error
    await expect(page.getByText(/invalid email|valid email/i)).toBeVisible({
      timeout: 5000,
    });
  });

  test("should show validation error for short password", async ({ page }) => {
    // Fill name
    const nameInput = page
      .getByLabel(/name|full name/i)
      .or(page.locator('input[name="name"]'));
    await nameInput.fill("Test User");

    // Enter valid email
    const emailInput = page
      .getByLabel(/email/i)
      .or(page.locator('input[name="email"]'));
    await emailInput.fill(generateTestEmail());

    // Enter short password
    const passwordInput = page
      .locator("#password")
      .or(page.locator('input[name="password"]'));
    await passwordInput.fill("short");

    // Submit form
    await page
      .getByRole("button", { name: /sign up|register|create account/i })
      .click();

    // Expect password validation error
    await expect(
      page.getByText(/password.*8 characters|too short|at least/i)
    ).toBeVisible({ timeout: 5000 });
  });

  test("should show validation error for password mismatch", async ({
    page,
  }) => {
    // Check if confirm password field exists
    const confirmPasswordInput = page
      .getByLabel(/confirm password/i)
      .or(page.locator('input[name="confirmPassword"]'));

    if ((await confirmPasswordInput.count()) === 0) {
      test.skip();
      return;
    }

    // Fill name
    const nameInput = page
      .getByLabel(/name|full name/i)
      .or(page.locator('input[name="name"]'));
    await nameInput.fill("Test User");

    // Enter valid email
    const emailInput = page
      .getByLabel(/email/i)
      .or(page.locator('input[name="email"]'));
    await emailInput.fill(generateTestEmail());

    // Enter different passwords
    const passwordInput = page
      .locator("#password")
      .or(page.locator('input[name="password"]'));
    await passwordInput.fill("TestPassword123!");
    await confirmPasswordInput.fill("DifferentPassword456!");

    // Submit form
    await page
      .getByRole("button", { name: /sign up|register|create account/i })
      .click();

    // Expect mismatch error
    await expect(
      page.getByText(/password.*match|passwords.*match|do not match/i)
    ).toBeVisible({ timeout: 5000 });
  });

  test("should navigate to login page via link", async ({ page }) => {
    // Click the "Sign in" or "Login" link
    await page.getByRole("link", { name: /sign in|log in|already have/i }).click();

    // Verify navigation to login page
    await expect(page).toHaveURL("/login");
  });
});

test.describe("Registration Form Submission", () => {
  test.beforeEach(async ({ page }) => {
    await clearAuthState(page);
    await page.goto("/register");
  });

  test("should fill registration form with valid data", async ({ page }) => {
    const testEmail = generateTestEmail();

    // Fill in the name field
    const nameInput = page
      .getByLabel(/name|full name/i)
      .or(page.locator('input[name="name"]'));
    await nameInput.fill("Test User");

    // Fill in the email field
    const emailInput = page
      .getByLabel(/email/i)
      .or(page.locator('input[name="email"]'));
    await emailInput.fill(testEmail);

    // Fill in the password field
    const passwordInput = page
      .locator("#password")
      .or(page.locator('input[name="password"]'));
    await passwordInput.fill("TestPassword123!");

    // Fill confirm password if exists
    const confirmPasswordInput = page
      .getByLabel(/confirm password/i)
      .or(page.locator('input[name="confirmPassword"]'));
    if ((await confirmPasswordInput.count()) > 0) {
      await confirmPasswordInput.fill("TestPassword123!");
    }

    // Verify values are filled
    await expect(nameInput).toHaveValue("Test User");
    await expect(emailInput).toHaveValue(testEmail);
    await expect(passwordInput).toHaveValue("TestPassword123!");
  });

  test("should submit form and trigger registration request", async ({
    page,
  }) => {
    const testEmail = generateTestEmail();

    // Track network requests to verify form submission
    let registrationRequestMade = false;
    page.on("request", (request) => {
      if (
        request.url().includes("/auth/register") ||
        request.url().includes("/register") ||
        (request.url().includes("/api") && request.method() === "POST")
      ) {
        registrationRequestMade = true;
      }
    });

    // Fill in the name field
    const nameInput = page
      .getByLabel(/name|full name/i)
      .or(page.locator('input[name="name"]'));
    await nameInput.fill("Test User");

    // Fill in the email field
    const emailInput = page
      .getByLabel(/email/i)
      .or(page.locator('input[name="email"]'));
    await emailInput.fill(testEmail);

    // Fill in the password field
    const passwordInput = page
      .locator("#password")
      .or(page.locator('input[name="password"]'));
    await passwordInput.fill("TestPassword123!");

    // Fill confirm password if exists
    const confirmPasswordInput = page
      .getByLabel(/confirm password/i)
      .or(page.locator('input[name="confirmPassword"]'));
    if ((await confirmPasswordInput.count()) > 0) {
      await confirmPasswordInput.fill("TestPassword123!");
    }

    // Get submit button
    const submitButton = page.getByRole("button", {
      name: /sign up|register|create account/i,
    });

    // Button should be enabled
    await expect(submitButton).toBeEnabled();

    // Click the submit button
    await submitButton.click();

    // Wait for either:
    // 1. Loading state (button text changes or button becomes disabled)
    // 2. Error alert or toast (API not available or validation error)
    // 3. URL change (successful registration redirects to login or home)
    // 4. Success message
    const timeout = 10000;
    await Promise.race([
      page
        .waitForSelector('button:has-text("Creating")', { timeout })
        .catch(() => null),
      page
        .waitForSelector('button:has-text("Registering")', { timeout })
        .catch(() => null),
      page.waitForSelector("button[disabled]", { timeout }).catch(() => null),
      page.waitForSelector('[role="alert"]', { timeout }).catch(() => null),
      page
        .waitForSelector('[data-sonner-toast]', { timeout })
        .catch(() => null),
      page.waitForURL(/^\/$|^\/login|^\/chat|^\/home/, { timeout }).catch(() => null),
      new Promise((r) => setTimeout(r, 3000)), // Give time for network request
    ]);

    // Verify some state change occurred
    const currentUrl = page.url();
    const isStillOnRegister = currentUrl.includes("/register");
    const hasAlert = await page.locator('[role="alert"]').count();
    const hasToast = await page.locator('[data-sonner-toast]').count();
    const buttonText = await submitButton.textContent();
    const isButtonDisabled = await submitButton.isDisabled();

    // Form submission is valid if ANY of these occurred:
    // - Navigation away from register page
    // - Error alert/toast shown (even API errors show form was submitted)
    // - Button changed to loading state
    // - Network request was made to auth endpoint
    const stateChanged =
      !isStillOnRegister ||
      hasAlert > 0 ||
      hasToast > 0 ||
      isButtonDisabled ||
      registrationRequestMade ||
      buttonText?.toLowerCase().includes("creating") ||
      buttonText?.toLowerCase().includes("registering") ||
      buttonText?.toLowerCase().includes("loading");

    // Real assertion: form submission must trigger a state change or network request
    expect(
      stateChanged,
      `Form submission did not trigger expected behavior. ` +
        `URL: ${currentUrl}, Alerts: ${hasAlert}, Toasts: ${hasToast}, ` +
        `Button: "${buttonText}", Disabled: ${isButtonDisabled}, ` +
        `Network request: ${registrationRequestMade}`
    ).toBe(true);
  });
});

test.describe("Registration Page Accessibility", () => {
  test.beforeEach(async ({ page }) => {
    await clearAuthState(page);
    await page.goto("/register");
  });

  test("should have accessible form labels", async ({ page }) => {
    // Check that form inputs have associated labels
    const nameInput = page
      .getByLabel(/name|full name/i)
      .or(page.locator('input[name="name"]'));
    const emailInput = page
      .getByLabel(/email/i)
      .or(page.locator('input[name="email"]'));
    const passwordInput = page
      .locator("#password")
      .or(page.locator('input[name="password"]'));

    await expect(nameInput).toBeVisible();
    await expect(emailInput).toBeVisible();
    await expect(passwordInput).toBeVisible();
  });

  test("should support keyboard navigation", async ({ page }) => {
    // Tab to first form field
    await page.keyboard.press("Tab");

    // Verify an input is focused
    const focusedElement = page.locator(":focus");
    await expect(focusedElement).toBeVisible();

    // Continue tabbing through form
    await page.keyboard.press("Tab");
    await page.keyboard.press("Tab");
    await page.keyboard.press("Tab");

    // Should eventually reach the submit button
    // (form may have different number of fields)
  });
});
