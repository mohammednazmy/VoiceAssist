import { test, expect } from "@playwright/test";

/**
 * E2E Tests for System Page
 * Sprint 5: System management functionality tests
 */

test.describe("System Page", () => {
  test.beforeEach(async ({ page }) => {
    await page.goto("/system");
  });

  test("should display system page title", async ({ page }) => {
    await expect(page.locator("h1")).toContainText("System");
  });

  test("should display tab navigation", async ({ page }) => {
    await expect(
      page.locator(
        'button:has-text("Overview"), [role="tab"]:has-text("Overview")',
      ),
    ).toBeVisible();
    await expect(
      page.locator(
        'button:has-text("Backup"), [role="tab"]:has-text("Backup")',
      ),
    ).toBeVisible();
    await expect(
      page.locator(
        'button:has-text("Maintenance"), [role="tab"]:has-text("Maintenance")',
      ),
    ).toBeVisible();
    await expect(
      page.locator('button:has-text("Cache"), [role="tab"]:has-text("Cache")'),
    ).toBeVisible();
  });
});

test.describe("System Overview Tab", () => {
  test.beforeEach(async ({ page }) => {
    await page.goto("/system");
  });

  test("should display system health status", async ({ page }) => {
    await expect(page.locator("text=Health, text=Status")).toBeVisible();
  });

  test("should display resource metrics", async ({ page }) => {
    // Should show disk, memory, CPU metrics
    await expect(
      page.locator("text=Disk, text=Memory, text=CPU"),
    ).toBeVisible();
  });
});

test.describe("System Backups Tab", () => {
  test.beforeEach(async ({ page }) => {
    await page.goto("/system");
    await page.click(
      'button:has-text("Backup"), [role="tab"]:has-text("Backup")',
    );
  });

  test("should display backup status", async ({ page }) => {
    await expect(page.locator("text=Backup, text=Last")).toBeVisible();
  });

  test("should display backup history", async ({ page }) => {
    await expect(page.locator("text=History, text=Backup")).toBeVisible();
  });

  test("should have trigger backup button", async ({ page }) => {
    const triggerButton = page.locator(
      'button:has-text("Trigger"), button:has-text("Backup")',
    );
    await expect(triggerButton).toBeVisible();
  });
});

test.describe("System Maintenance Tab", () => {
  test.beforeEach(async ({ page }) => {
    await page.goto("/system");
    await page.click(
      'button:has-text("Maintenance"), [role="tab"]:has-text("Maintenance")',
    );
  });

  test("should display maintenance mode status", async ({ page }) => {
    await expect(page.locator("text=Maintenance")).toBeVisible();
  });

  test("should have enable/disable maintenance button", async ({ page }) => {
    const maintenanceButton = page.locator(
      'button:has-text("Enable"), button:has-text("Disable")',
    );
    await expect(maintenanceButton).toBeVisible();
  });
});

test.describe("System Cache Tab", () => {
  test.beforeEach(async ({ page }) => {
    await page.goto("/system");
    await page.click(
      'button:has-text("Cache"), [role="tab"]:has-text("Cache")',
    );
  });

  test("should display cache namespaces", async ({ page }) => {
    await expect(page.locator("text=Cache, text=Namespace")).toBeVisible();
  });

  test("should have invalidate button", async ({ page }) => {
    const invalidateButton = page.locator(
      'button:has-text("Invalidate"), button:has-text("Clear")',
    );
    await expect(invalidateButton).toBeVisible();
  });
});

test.describe("System Configuration Tab", () => {
  test.beforeEach(async ({ page }) => {
    await page.goto("/system");
    await page.click(
      'button:has-text("Configuration"), button:has-text("Config"), [role="tab"]:has-text("Config")',
    );
  });

  test("should display configuration options", async ({ page }) => {
    await expect(
      page.locator("text=Configuration, text=Config, text=Settings"),
    ).toBeVisible();
  });
});
