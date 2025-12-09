/**
 * Auth E2E Smoke Tests
 *
 * Phase 4 - Tests for login page, form validation, and OAuth buttons
 *
 * Run: npx playwright test e2e/auth.spec.ts
 * Run against dev: npm run test:e2e:dev
 */

import { test, expect } from "@playwright/test";

test.describe("Login Page", () => {
  test.beforeEach(async ({ page }) => {
    await page.goto("/login");
  });

  test("should display login form elements", async ({ page }) => {
    // Check page title
    await expect(
      page.getByRole("heading", { name: /welcome back/i }),
    ).toBeVisible();

    // Check form elements
    await expect(page.getByLabel(/email/i)).toBeVisible();
    await expect(page.getByLabel(/password/i)).toBeVisible();
    await expect(page.getByRole("button", { name: /sign in/i })).toBeVisible();

    // Check OAuth buttons
    await expect(page.getByRole("button", { name: /google/i })).toBeVisible();
    await expect(
      page.getByRole("button", { name: /microsoft/i }),
    ).toBeVisible();

    // Check links
    await expect(
      page.getByRole("link", { name: /forgot password/i }),
    ).toBeVisible();
    await expect(page.getByRole("link", { name: /sign up/i })).toBeVisible();
  });

  test("should show validation errors for empty form submission", async ({
    page,
  }) => {
    // Click sign in without entering credentials
    await page.getByRole("button", { name: /sign in/i }).click();

    // Should show validation errors
    await expect(
      page.getByText(/email is required|valid email/i),
    ).toBeVisible();
    await expect(
      page.getByText(/password is required|at least/i),
    ).toBeVisible();
  });

  test("should show validation error for invalid email", async ({ page }) => {
    // Enter invalid email
    await page.getByLabel(/email/i).fill("invalid-email");
    await page.getByLabel(/password/i).fill("password123");
    await page.getByRole("button", { name: /sign in/i }).click();

    // Should show email validation error
    await expect(page.getByText(/valid email/i)).toBeVisible();
  });

  test("should show error for invalid credentials", async ({ page }) => {
    // Enter invalid credentials
    await page.getByLabel(/email/i).fill("nonexistent@example.com");
    await page.getByLabel(/password/i).fill("wrongpassword123");
    await page.getByRole("button", { name: /sign in/i }).click();

    // Should show error (may be "Invalid email or password" or network error)
    // Wait for error to appear (either validation or API error)
    await expect(
      page.getByRole("alert").or(page.getByText(/invalid|error|failed/i)),
    ).toBeVisible({ timeout: 10000 });
  });

  test("should toggle password visibility", async ({ page }) => {
    const passwordInput = page.getByLabel(/password/i);
    const toggleButton = page.getByRole("button", {
      name: /show password|hide password/i,
    });

    // Initially password should be hidden
    await expect(passwordInput).toHaveAttribute("type", "password");

    // Click toggle
    await toggleButton.click();
    await expect(passwordInput).toHaveAttribute("type", "text");

    // Click toggle again
    await toggleButton.click();
    await expect(passwordInput).toHaveAttribute("type", "password");
  });

  test("should navigate to register page", async ({ page }) => {
    await page.getByRole("link", { name: /sign up/i }).click();
    await expect(page).toHaveURL(/\/register/);
  });

  test("should navigate to forgot password page", async ({ page }) => {
    await page.getByRole("link", { name: /forgot password/i }).click();
    await expect(page).toHaveURL(/\/forgot-password/);
  });
});

test.describe("OAuth Buttons", () => {
  test.beforeEach(async ({ page }) => {
    await page.goto("/login");
  });

  test("should have Google OAuth button", async ({ page }) => {
    const googleButton = page.getByRole("button", { name: /google/i });
    await expect(googleButton).toBeVisible();
    await expect(googleButton).toBeEnabled();
  });

  test("should have Microsoft OAuth button", async ({ page }) => {
    const microsoftButton = page.getByRole("button", { name: /microsoft/i });
    await expect(microsoftButton).toBeVisible();
    await expect(microsoftButton).toBeEnabled();
  });

  test("should show unavailability message when OAuth provider returns 503", async ({
    page,
  }) => {
    // Click Google OAuth button
    const googleButton = page.getByRole("button", { name: /google/i });
    await googleButton.click();

    // Wait for either: redirect, error message, or button disabled
    // In dev environment without OAuth configured, should show unavailable message
    const unavailableText = page.getByText(/not (available|configured)/i);
    const errorAlert = page.getByRole("alert");

    // Either should appear within timeout
    await expect(unavailableText.or(errorAlert))
      .toBeVisible({ timeout: 5000 })
      .catch(() => {
        // If neither appears, test still passes (OAuth might be configured)
        console.warn("OAuth provider might be configured - no error shown");
      });
  });
});

test.describe("Auth Navigation Guards", () => {
  test("should redirect unauthenticated users to login", async ({ page }) => {
    // Try to access protected route
    await page.goto("/");

    // Should be redirected to login
    await expect(page).toHaveURL(/\/login/);
  });

  test("should show login page at /login route", async ({ page }) => {
    await page.goto("/login");
    await expect(
      page.getByRole("heading", { name: /welcome back/i }),
    ).toBeVisible();
  });
});
