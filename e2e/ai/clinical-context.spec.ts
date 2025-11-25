/**
 * Clinical Context Integration
 *
 * STATUS: TEMPLATE - SKIPPED BY DEFAULT
 * Description: User sets up clinical context for personalized responses
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

test.describe.skip("Clinical Context Integration (template)", () => {
  test.beforeEach(async ({ page }) => {
    // Navigate to the starting page
    await page.goto('/');
  });

  test('User sets up clinical context for personalized responses', async ({ page }) => {
    // TODO: Step 1: Navigate to /login and authenticate
    // await page...;

    // TODO: Step 2: Navigate to /clinical-context page
    // await page...;

    // TODO: Step 3: Verify clinical context form is visible
    // await page...;

    // TODO: Step 4: Fill in patient age field with "45"
    // await page...;

    // TODO: Step 5: Fill in relevant medical history
    // await page...;

    // TODO: Step 6: Click Save clinical context button
    // await page...;

    // TODO: Step 7: Verify save confirmation
    // await page...;

    // TODO: Step 8: Navigate to /chat
    // await page...;

    // TODO: Step 9: Ask a question about medication dosing
    // await page...;

    // TODO: Step 10: Verify the response considers patient age context
    // await page...;
  });
});
