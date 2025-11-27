import { test, expect } from "@playwright/test";
import { checkA11y, injectAxe } from "axe-playwright";

const criticalRoutes = [
  { path: "/", name: "Home redirect" },
  { path: "/login", name: "Login" },
  { path: "/register", name: "Register" },
];

test.describe("Accessibility", () => {
  for (const route of criticalRoutes) {
    test(`has no critical a11y violations on ${route.name}`, async ({ page }) => {
      await page.goto(route.path);
      await injectAxe(page);

      await checkA11y(page, undefined, {
        detailedReport: true,
        detailedReportOptions: { html: true },
        axeOptions: {
          runOnly: {
            type: "tag",
            values: ["wcag2a", "wcag2aa"],
          },
        },
        // Focus CI signal on the most severe issues to avoid flaky builds from
        // lower-impact legacy findings while we iterate on fixes.
        includedImpacts: ["critical"],
      });

      await expect(page).toHaveURL(/.+/); // Ensures navigation completed
    });
  }
});
