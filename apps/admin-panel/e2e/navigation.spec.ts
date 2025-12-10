import { test, expect } from "@playwright/test";

/**
 * E2E Tests for Admin Panel Navigation
 * Sprint 5: Navigation and Layout Tests
 */

test.describe("Admin Panel Navigation", () => {
  test.beforeEach(async ({ page }) => {
    // Navigate to dashboard (assumes authenticated or public access for testing)
    await page.goto("/dashboard");
  });

  test("should display dashboard page", async ({ page }) => {
    await expect(page.locator("h1")).toContainText("Dashboard");
  });

  test("should navigate to Users page", async ({ page }) => {
    await page.click('a[href="/users"], button:has-text("Users")');
    await expect(page).toHaveURL(/users/);
    await expect(page.locator("h1")).toContainText("User");
  });

  test("should navigate to Knowledge Base page", async ({ page }) => {
    await page.click('a[href="/knowledge-base"], button:has-text("Knowledge")');
    await expect(page).toHaveURL(/knowledge-base/);
  });

  test("should navigate to Voice Monitor page", async ({ page }) => {
    await page.click('a[href="/voice"], button:has-text("Voice")');
    await expect(page).toHaveURL(/voice/);
    await expect(page.locator("h1")).toContainText("Voice");
  });

  test("should navigate to Integrations page", async ({ page }) => {
    await page.click('a[href="/integrations"], button:has-text("Integration")');
    await expect(page).toHaveURL(/integrations/);
    await expect(page.locator("h1")).toContainText("Integration");
  });

  test("should navigate to Security page", async ({ page }) => {
    await page.click('a[href="/security"], button:has-text("Security")');
    await expect(page).toHaveURL(/security/);
    await expect(page.locator("h1")).toContainText("Security");
  });

  test("should navigate to Analytics page", async ({ page }) => {
    await page.click('a[href="/analytics"], button:has-text("Analytics")');
    await expect(page).toHaveURL(/analytics/);
    await expect(page.locator("h1")).toContainText("Analytics");
  });

  test("should navigate to System page", async ({ page }) => {
    await page.click('a[href="/system"], button:has-text("System")');
    await expect(page).toHaveURL(/system/);
    await expect(page.locator("h1")).toContainText("System");
  });
});

test.describe("Responsive Navigation", () => {
  test("should show mobile menu on small screens", async ({ page }) => {
    // Set mobile viewport
    await page.setViewportSize({ width: 375, height: 667 });
    await page.goto("/dashboard");

    // Look for hamburger menu or mobile navigation
    const mobileMenuButton = page.locator(
      '[data-testid="mobile-menu"], button[aria-label*="menu"]',
    );
    if (await mobileMenuButton.isVisible()) {
      await mobileMenuButton.click();
      // Should show navigation links
      await expect(page.locator('nav, [role="navigation"]')).toBeVisible();
    }
  });

  test("should display content properly on mobile", async ({ page }) => {
    await page.setViewportSize({ width: 375, height: 667 });
    await page.goto("/dashboard");

    // Dashboard should still be readable
    await expect(page.locator("h1")).toBeVisible();
  });
});
