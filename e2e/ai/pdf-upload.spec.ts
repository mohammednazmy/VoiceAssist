/**
 * PDF Upload to Knowledge Base
 *
 * STATUS: TEMPLATE - SKIPPED BY DEFAULT
 * Description: Upload a PDF and see it in the knowledge base
 *
 * This is a template test with TODO placeholders. It is skipped by default
 * to avoid false positives in CI. To promote this to a real test:
 * 1. Implement all TODO steps with actual Playwright code
 * 2. Add meaningful assertions
 * 3. Remove .skip from test.describe.skip below
 *
 * @see docs/TESTING_GUIDE.md for template promotion process
 */

import { test, expect } from "@playwright/test";

test.describe.skip("PDF Upload to Knowledge Base (template)", () => {
  test.beforeEach(async ({ page }) => {
    // Navigate to the starting page
    await page.goto('/');
  });

  test('Upload a PDF and see it in the knowledge base', async ({ page }) => {
    // TODO: Step 1: Navigate to /login and authenticate
    // await page...;

    // TODO: Step 2: Navigate to /documents or knowledge base page
    // await page...;

    // TODO: Step 3: Click the Upload button or drag-and-drop area
    // await page...;

    // TODO: Step 4: Select a PDF file for upload
    // await page...;

    // TODO: Step 5: Verify upload progress indicator appears
    // await page...;

    // TODO: Step 6: Wait for upload to complete
    // await page...;

    // TODO: Step 7: Verify the uploaded document appears in the list
    // await page...;

    // TODO: Step 8: Click on the uploaded document to view details
    // await page...;

    // TODO: Step 9: Verify document metadata is displayed correctly
    // await page...;
  });
});
