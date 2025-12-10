import { test, expect } from "@playwright/test";

/**
 * E2E Tests for Analytics Page
 * Sprint 5: Analytics functionality tests
 */

test.describe("Analytics Page", () => {
  test.beforeEach(async ({ page }) => {
    await page.goto("/analytics");
  });

  test("should display analytics page title", async ({ page }) => {
    await expect(page.locator("h1")).toContainText("Analytics");
  });

  test("should display tab navigation", async ({ page }) => {
    await expect(
      page.locator(
        'button:has-text("Overview"), [role="tab"]:has-text("Overview")',
      ),
    ).toBeVisible();
    await expect(
      page.locator(
        'button:has-text("AI Models"), [role="tab"]:has-text("Models")',
      ),
    ).toBeVisible();
    await expect(
      page.locator(
        'button:has-text("Search"), [role="tab"]:has-text("Search")',
      ),
    ).toBeVisible();
    await expect(
      page.locator('button:has-text("Cost"), [role="tab"]:has-text("Cost")'),
    ).toBeVisible();
  });

  test("should switch tabs when clicked", async ({ page }) => {
    // Click on AI Models tab
    await page.click(
      'button:has-text("AI Models"), [role="tab"]:has-text("Models")',
    );

    // Verify models content is visible
    await expect(page.locator("text=Context, text=Model")).toBeVisible();
  });

  test("should display metrics when available", async ({ page }) => {
    // Should show some metrics - requests, tokens, or costs
    const hasMetrics = await page
      .locator("text=Requests, text=Tokens, text=Cost")
      .first()
      .isVisible();
    expect(hasMetrics).toBeTruthy();
  });
});

test.describe("Analytics Overview Tab", () => {
  test.beforeEach(async ({ page }) => {
    await page.goto("/analytics");
  });

  test("should display key metrics", async ({ page }) => {
    // Overview should show summary stats
    await expect(page.locator("text=24h, text=Total")).toBeVisible();
  });
});

test.describe("Analytics AI Models Tab", () => {
  test.beforeEach(async ({ page }) => {
    await page.goto("/analytics");
    await page.click(
      'button:has-text("AI Models"), [role="tab"]:has-text("Models")',
    );
  });

  test("should display model cards", async ({ page }) => {
    // Should show model information
    const modelContent = page.locator("text=Context, text=GPT, text=Provider");
    await expect(modelContent.first()).toBeVisible({ timeout: 10000 });
  });
});

test.describe("Analytics Search Tab", () => {
  test.beforeEach(async ({ page }) => {
    await page.goto("/analytics");
    await page.click(
      'button:has-text("Search"), [role="tab"]:has-text("Search")',
    );
  });

  test("should display search analytics", async ({ page }) => {
    // Should show search-related metrics
    await expect(
      page.locator("text=Search, text=Queries, text=Latency"),
    ).toBeVisible();
  });
});

test.describe("Analytics Cost Tab", () => {
  test.beforeEach(async ({ page }) => {
    await page.goto("/analytics");
    await page.click('button:has-text("Cost"), [role="tab"]:has-text("Cost")');
  });

  test("should display cost tracking", async ({ page }) => {
    // Should show cost information
    await expect(page.locator("text=Cost, text=$")).toBeVisible();
  });
});
