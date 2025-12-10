import { test, expect } from "@playwright/test";

/**
 * E2E Tests for Dashboard Page
 * Sprint 5: Dashboard functionality tests
 */

test.describe("Dashboard Page", () => {
  test.beforeEach(async ({ page }) => {
    await page.goto("/dashboard");
  });

  test("should display dashboard title", async ({ page }) => {
    await expect(page.locator("h1")).toContainText("Dashboard");
  });

  test("should display user metrics section", async ({ page }) => {
    await expect(
      page.locator("text=User Metrics, text=Total Users"),
    ).toBeVisible();
  });

  test("should display service health section", async ({ page }) => {
    await expect(page.locator("text=Service Health")).toBeVisible();
  });

  test("should display integrations widget", async ({ page }) => {
    await expect(
      page.locator("text=External Integrations, text=Integrations"),
    ).toBeVisible();
  });

  test("should show last updated timestamp", async ({ page }) => {
    await expect(
      page.locator("text=Last updated, text=Awaiting"),
    ).toBeVisible();
  });

  test("should have refresh button", async ({ page }) => {
    const refreshButton = page.locator(
      'button:has-text("refresh"), button:has-text("Refresh")',
    );
    await expect(refreshButton).toBeVisible();
  });

  test("should show connection status indicator", async ({ page }) => {
    const statusIndicator = page.locator("text=Live, text=Offline");
    await expect(statusIndicator).toBeVisible();
  });
});

test.describe("Dashboard Metrics Cards", () => {
  test.beforeEach(async ({ page }) => {
    await page.goto("/dashboard");
  });

  test("should display Total Users metric", async ({ page }) => {
    await expect(page.locator("text=Total Users")).toBeVisible();
  });

  test("should display Active Users metric", async ({ page }) => {
    await expect(page.locator("text=Active Users")).toBeVisible();
  });

  test("should display Admin Users metric", async ({ page }) => {
    await expect(page.locator("text=Admin Users")).toBeVisible();
  });
});

test.describe("Dashboard Service Health", () => {
  test.beforeEach(async ({ page }) => {
    await page.goto("/dashboard");
  });

  test("should display PostgreSQL status", async ({ page }) => {
    await expect(page.locator("text=PostgreSQL")).toBeVisible();
  });

  test("should display Redis status", async ({ page }) => {
    await expect(page.locator("text=Redis")).toBeVisible();
  });

  test("should display Qdrant status", async ({ page }) => {
    await expect(page.locator("text=Qdrant")).toBeVisible();
  });

  test("should show online/offline status badges", async ({ page }) => {
    // Should show either Online or Offline status
    const onlineBadge = page.locator("text=Online");
    const offlineBadge = page.locator("text=Offline");
    const hasStatus =
      (await onlineBadge.isVisible()) || (await offlineBadge.isVisible());
    expect(hasStatus).toBeTruthy();
  });
});
