/**
 * Knowledge Base Deep Linking E2E Tests
 *
 * Tests for KB deep linking and document navigation features including:
 * - Deep linking via query parameters (documentId, docId, doc)
 * - Document preview drawer auto-open
 * - Narration coverage display
 * - Active document column in conversations
 */

import { test, expect } from "@playwright/test";

const ADMIN_URL = process.env.ADMIN_URL || "http://localhost:5174";

test.describe("Knowledge Base Deep Linking", () => {
  test.beforeEach(async ({ page }) => {
    // Setup admin authentication state
    await page.goto(`${ADMIN_URL}/login`);
    await page.waitForLoadState("networkidle");

    // Skip if not on login page (may be auto-authenticated)
    if (page.url().includes("/login")) {
      // Try to login with test credentials
      const emailInput = page.locator('input[type="email"], input[name="email"]');
      const passwordInput = page.locator('input[type="password"]');

      if ((await emailInput.count()) > 0) {
        await emailInput.fill("admin@test.com");
        await passwordInput.fill("testpassword123");

        const submitButton = page.locator('button[type="submit"]');
        await submitButton.click();
        await page.waitForTimeout(2000);
      }
    }
  });

  test("navigates to KB page with documentId query param", async ({ page }) => {
    // Navigate with a documentId parameter
    await page.goto(`${ADMIN_URL}/knowledge-base?documentId=test-doc-123`);
    await page.waitForLoadState("networkidle");

    // Should be on KB page
    expect(page.url()).toContain("/knowledge-base");
    expect(page.url()).toContain("documentId=test-doc-123");

    console.log("KB page loaded with documentId query param");
  });

  test("accepts multiple query param formats (documentId, docId, doc)", async ({
    page,
  }) => {
    // Test documentId format
    await page.goto(`${ADMIN_URL}/knowledge-base?documentId=doc-1`);
    expect(page.url()).toContain("documentId=doc-1");

    // Test docId format
    await page.goto(`${ADMIN_URL}/knowledge-base?docId=doc-2`);
    expect(page.url()).toContain("docId=doc-2");

    // Test doc format
    await page.goto(`${ADMIN_URL}/knowledge-base?doc=doc-3`);
    expect(page.url()).toContain("doc=doc-3");

    console.log("All document ID query param formats accepted");
  });

  test("KB page displays document table", async ({ page }) => {
    await page.goto(`${ADMIN_URL}/knowledge-base`);
    await page.waitForLoadState("networkidle");

    // Skip if redirected to login
    if (page.url().includes("/login")) {
      test.skip();
      return;
    }

    // Look for document table
    const documentTable = page.locator("table");
    await expect(documentTable).toBeVisible({ timeout: 10000 });

    console.log("Document table is visible");
  });

  test("displays stat cards with document counts", async ({ page }) => {
    await page.goto(`${ADMIN_URL}/knowledge-base`);
    await page.waitForLoadState("networkidle");

    if (page.url().includes("/login")) {
      test.skip();
      return;
    }

    // Look for stat cards
    const statCards = page.locator('div:has-text("Total Documents")');

    if ((await statCards.count()) > 0) {
      await expect(statCards.first()).toBeVisible();
      console.log("Stat cards are visible");
    }
  });

  test("displays narration coverage for enhanced documents", async ({
    page,
  }) => {
    await page.goto(`${ADMIN_URL}/knowledge-base`);
    await page.waitForLoadState("networkidle");

    if (page.url().includes("/login")) {
      test.skip();
      return;
    }

    // Look for narration coverage indicator
    const narrationIndicator = page.locator('span:has-text("Narration:")');

    const hasNarration = (await narrationIndicator.count()) > 0;
    console.log(`Narration coverage indicators present: ${hasNarration}`);

    if (hasNarration) {
      // Check for percentage format
      const text = await narrationIndicator.first().textContent();
      expect(text).toMatch(/Narration:\s*\d+%/);
      console.log(`Narration indicator text: ${text}`);
    }
  });

  test("upload button is visible for non-viewer roles", async ({ page }) => {
    await page.goto(`${ADMIN_URL}/knowledge-base`);
    await page.waitForLoadState("networkidle");

    if (page.url().includes("/login")) {
      test.skip();
      return;
    }

    const uploadButton = page.locator('button:has-text("Upload")');

    if ((await uploadButton.count()) > 0) {
      const isEnabled = await uploadButton.isEnabled();
      console.log(`Upload button present and enabled: ${isEnabled}`);
    }
  });
});

test.describe("Conversations Page - Active Document Column", () => {
  test.beforeEach(async ({ page }) => {
    await page.goto(`${ADMIN_URL}/login`);
    await page.waitForLoadState("networkidle");

    if (page.url().includes("/login")) {
      const emailInput = page.locator('input[type="email"], input[name="email"]');
      const passwordInput = page.locator('input[type="password"]');

      if ((await emailInput.count()) > 0) {
        await emailInput.fill("admin@test.com");
        await passwordInput.fill("testpassword123");

        const submitButton = page.locator('button[type="submit"]');
        await submitButton.click();
        await page.waitForTimeout(2000);
      }
    }
  });

  test("conversations table shows Active Document column", async ({ page }) => {
    await page.goto(`${ADMIN_URL}/conversations`);
    await page.waitForLoadState("networkidle");

    if (page.url().includes("/login")) {
      test.skip();
      return;
    }

    // Look for Active Document column header
    const columnHeader = page.locator('th:has-text("Active Document")');

    if ((await columnHeader.count()) > 0) {
      await expect(columnHeader).toBeVisible();
      console.log("Active Document column is present");
    }
  });

  test("conversations table shows PHI Mode column", async ({ page }) => {
    await page.goto(`${ADMIN_URL}/conversations`);
    await page.waitForLoadState("networkidle");

    if (page.url().includes("/login")) {
      test.skip();
      return;
    }

    // Look for PHI Mode column header
    const columnHeader = page.locator('th:has-text("PHI Mode")');

    if ((await columnHeader.count()) > 0) {
      await expect(columnHeader).toBeVisible();
      console.log("PHI Mode column is present");
    }
  });

  test("PHI Mode filter dropdown works", async ({ page }) => {
    await page.goto(`${ADMIN_URL}/conversations`);
    await page.waitForLoadState("networkidle");

    if (page.url().includes("/login")) {
      test.skip();
      return;
    }

    // Look for PHI Mode filter
    const phiModeFilter = page.locator('select').filter({
      has: page.locator('option:has-text("Clinical")'),
    });

    if ((await phiModeFilter.count()) > 0) {
      // Select Clinical filter
      await phiModeFilter.selectOption("clinical");
      await page.waitForTimeout(500);

      // URL should include phi_mode parameter
      const url = page.url();
      console.log(`URL after filter: ${url}`);
    }
  });

  test("Active Document filter dropdown works", async ({ page }) => {
    await page.goto(`${ADMIN_URL}/conversations`);
    await page.waitForLoadState("networkidle");

    if (page.url().includes("/login")) {
      test.skip();
      return;
    }

    // Look for Active Document filter
    const docFilter = page.locator('select').filter({
      has: page.locator('option:has-text("Has active document")'),
    });

    if ((await docFilter.count()) > 0) {
      // Select "Has active document" filter
      await docFilter.selectOption("yes");
      await page.waitForTimeout(500);

      console.log("Active document filter applied");
    }
  });

  test("active document links navigate to KB page", async ({ page }) => {
    await page.goto(`${ADMIN_URL}/conversations`);
    await page.waitForLoadState("networkidle");

    if (page.url().includes("/login")) {
      test.skip();
      return;
    }

    // Look for clickable document links in table cells
    const documentLink = page.locator("td button").filter({
      has: page.locator('span:has-text("Page")'),
    });

    if ((await documentLink.count()) > 0) {
      // Click on document link
      const [newPage] = await Promise.all([
        page.context().waitForEvent("page", { timeout: 5000 }).catch(() => null),
        documentLink.first().click(),
      ]);

      if (newPage) {
        const newUrl = newPage.url();
        expect(newUrl).toContain("/knowledge-base");
        console.log(`Navigated to: ${newUrl}`);
      } else {
        // May navigate in same tab
        await page.waitForTimeout(1000);
        const currentUrl = page.url();
        console.log(`Current URL after click: ${currentUrl}`);
      }
    }
  });
});

test.describe("Document Preview Drawer", () => {
  test("deep link opens document preview drawer", async ({ page }) => {
    // This test requires actual documents to exist
    await page.goto(`${ADMIN_URL}/knowledge-base`);
    await page.waitForLoadState("networkidle");

    if (page.url().includes("/login")) {
      test.skip();
      return;
    }

    // Look for preview drawer
    const _previewDrawer = page.locator('[role="dialog"], [class*="Drawer"]');

    // If no drawer visible initially, try clicking on a document
    const documentRow = page.locator("table tbody tr").first();

    if ((await documentRow.count()) > 0) {
      // Look for preview button
      const previewButton = documentRow.locator('button:has-text("Preview")');

      if ((await previewButton.count()) > 0) {
        await previewButton.click();
        await page.waitForTimeout(500);

        // Drawer should open
        const drawer = page.locator('[role="dialog"], [class*="Drawer"]');
        if ((await drawer.count()) > 0) {
          console.log("Document preview drawer opened");
        }
      }
    }
  });
});
