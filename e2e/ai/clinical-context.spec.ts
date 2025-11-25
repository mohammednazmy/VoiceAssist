/**
 * Clinical Context Integration
 *
 * STATUS: IMPLEMENTED - ACTIVE TEST
 * Description: User sets up clinical context for personalized responses
 *
 * This test validates the complete clinical context flow:
 * - Navigating to the clinical context page
 * - Filling in patient demographics
 * - Adding problems and medications
 * - Verifying context summary appears
 * - Navigating to chat with context
 */

import { test, expect, Page } from "@playwright/test";
import { setupAndHydrateAuth } from "../fixtures/auth";

/**
 * Navigate to clinical context page and wait for it to load
 */
async function navigateToClinicalContext(page: Page): Promise<void> {
  await page.goto("/clinical-context");
  // Wait for page to be ready - look for the heading or form
  await page.waitForSelector('h1:has-text("Clinical Context")', {
    timeout: 10000,
  });
}

/**
 * Fill in demographics tab fields
 */
async function fillDemographics(
  page: Page,
  options: {
    age?: string;
    gender?: string;
    weight?: string;
    height?: string;
    chiefComplaint?: string;
  }
): Promise<void> {
  // Demographics is the default tab, but click it to be sure
  const demographicsTab = page.locator('button:has-text("Demographics")');
  if (await demographicsTab.isVisible()) {
    await demographicsTab.click();
  }

  if (options.age) {
    await page.locator("#age").fill(options.age);
  }

  if (options.gender) {
    await page.locator("#gender").selectOption(options.gender);
  }

  if (options.weight) {
    await page.locator("#weight").fill(options.weight);
  }

  if (options.height) {
    await page.locator("#height").fill(options.height);
  }

  if (options.chiefComplaint) {
    await page.locator("#chiefComplaint").fill(options.chiefComplaint);
  }
}

/**
 * Add an item to a list section (Problems, Medications)
 */
async function addListItem(
  page: Page,
  tabName: string,
  value: string
): Promise<void> {
  // Click the tab
  await page.locator(`button:has-text("${tabName}")`).click();

  // Find the input in the current section and fill it
  const input = page.locator(
    'input[placeholder*="e.g."], input[placeholder*="Type"]'
  );
  await input.fill(value);

  // Click Add button
  await page.locator('button:has-text("Add")').click();

  // Wait for the item to appear in the list (use first match to avoid strict mode)
  await expect(page.locator(`text="${value}"`).first()).toBeVisible({
    timeout: 5000,
  });
}

test.describe("Clinical Context Integration", () => {
  test.beforeEach(async ({ page }) => {
    await setupAndHydrateAuth(page);
  });

  test("should display clinical context page correctly", async ({ page }) => {
    await navigateToClinicalContext(page);

    // Verify page title
    await expect(page.locator('h1:has-text("Clinical Context")')).toBeVisible();

    // Verify description
    await expect(
      page.locator("text=Provide patient information for more relevant AI assistance")
    ).toBeVisible();

    // Verify Start Consultation button
    await expect(
      page.locator('button:has-text("Start Consultation")')
    ).toBeVisible();

    // Verify tabs are visible
    await expect(page.locator('button:has-text("Demographics")')).toBeVisible();
    await expect(page.locator('button:has-text("Problems")')).toBeVisible();
    await expect(page.locator('button:has-text("Medications")')).toBeVisible();
    await expect(page.locator('button:has-text("Vitals")')).toBeVisible();

    // Verify disclaimer is visible
    await expect(page.locator("text=Important Disclaimer")).toBeVisible();
  });

  test("should fill demographics and show context summary", async ({
    page,
  }) => {
    await navigateToClinicalContext(page);

    // Fill demographics
    await fillDemographics(page, {
      age: "45",
      gender: "male",
      chiefComplaint: "Persistent headache for 3 days",
    });

    // Context summary should appear after filling data
    await expect(page.locator("text=Context Summary")).toBeVisible({
      timeout: 5000,
    });

    // Verify the summary contains our data (use specific selectors to avoid strict mode)
    // The summary shows "Age: X years old, gender"
    await expect(page.getByText("Age: 45 years old, male")).toBeVisible();
    // Chief complaint appears in summary section, use .first() to avoid matching textarea too
    await expect(
      page.getByText("Persistent headache for 3 days").first()
    ).toBeVisible();
  });

  test("should add problems and medications", async ({ page }) => {
    await navigateToClinicalContext(page);

    // Add a problem
    await addListItem(page, "Problems", "Type 2 Diabetes");

    // Verify problem appears in summary
    await expect(page.locator("text=Context Summary")).toBeVisible({
      timeout: 5000,
    });
    // Use .first() to avoid strict mode violation (text appears in both list and summary)
    await expect(page.getByText("Type 2 Diabetes").first()).toBeVisible();

    // Add a medication
    await addListItem(page, "Medications", "Metformin 500mg BID");

    // Verify medication appears (use .first() for same reason)
    await expect(page.getByText("Metformin 500mg BID").first()).toBeVisible();
  });

  test("should navigate to chat after setting context", async ({ page }) => {
    await navigateToClinicalContext(page);

    // Fill some basic context
    await fillDemographics(page, {
      age: "65",
      chiefComplaint: "Annual checkup questions",
    });

    // Wait for context to be saved
    await expect(page.locator("text=Context Summary")).toBeVisible({
      timeout: 5000,
    });

    // Click Start Consultation
    await page.locator('button:has-text("Start Consultation")').click();

    // Should navigate to chat
    await page.waitForURL(/\/chat/, { timeout: 10000 });

    // Verify we're on the chat page
    expect(page.url()).toContain("/chat");
  });

  test("should clear all context when Clear All is clicked", async ({
    page,
  }) => {
    await navigateToClinicalContext(page);

    // Fill some context
    await fillDemographics(page, {
      age: "30",
      gender: "female",
    });

    // Wait for context to appear
    await expect(page.locator("text=Context Summary")).toBeVisible({
      timeout: 5000,
    });

    // Handle confirmation dialog
    page.on("dialog", async (dialog) => {
      await dialog.accept();
    });

    // Click Clear All
    await page.locator('button:has-text("Clear All")').click();

    // Context Summary should disappear
    await expect(page.locator("text=Context Summary")).not.toBeVisible({
      timeout: 5000,
    });

    // Age input should be empty
    const ageInput = page.locator("#age");
    await expect(ageInput).toHaveValue("");
  });

  test("should fill vitals data", async ({ page }) => {
    await navigateToClinicalContext(page);

    // Switch to Vitals tab
    await page.locator('button:has-text("Vitals")').click();

    // Fill vitals
    await page.locator("#temperature").fill("37.5");
    await page.locator("#heartRate").fill("72");
    await page.locator("#bloodPressure").fill("120/80");
    await page.locator("#oxygenSaturation").fill("98");

    // Verify context summary shows vitals
    await expect(page.locator("text=Context Summary")).toBeVisible({
      timeout: 5000,
    });
    await expect(page.locator("text=Temp: 37.5")).toBeVisible();
    await expect(page.locator("text=HR: 72 bpm")).toBeVisible();
    await expect(page.locator("text=BP: 120/80")).toBeVisible();
    await expect(page.locator("text=SpO")).toBeVisible(); // SpO₂: 98%
  });

  test("should persist context in localStorage", async ({ page }) => {
    await navigateToClinicalContext(page);

    // Fill context
    await fillDemographics(page, {
      age: "50",
      chiefComplaint: "Testing persistence",
    });

    // Wait for context summary
    await expect(page.locator("text=Context Summary")).toBeVisible({
      timeout: 5000,
    });

    // Reload page
    await page.reload();

    // Wait for page to load
    await page.waitForSelector('h1:has-text("Clinical Context")', {
      timeout: 10000,
    });

    // Context should still be there
    await expect(page.locator("text=Context Summary")).toBeVisible({
      timeout: 5000,
    });
    await expect(page.locator("text=Age: 50 years old")).toBeVisible();
  });
});
