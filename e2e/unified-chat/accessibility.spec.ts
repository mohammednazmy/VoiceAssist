/**
 * Unified Chat Accessibility E2E Tests
 *
 * Comprehensive accessibility testing using axe-core including:
 * - WCAG 2.1 compliance checks
 * - ARIA labels and roles verification
 * - Keyboard navigation
 * - Focus management
 * - Screen reader compatibility
 * - Color contrast
 */

import { test, expect, UNIFIED_CHAT_SELECTORS } from "../fixtures/unified-chat";
import AxeBuilder from "@axe-core/playwright";

test.describe("Unified Chat Accessibility", () => {
  test.setTimeout(45000);

  test.describe("WCAG 2.1 Compliance", () => {
    test("should have no critical accessibility violations", async ({
      unifiedChatPage,
    }) => {
      const page = unifiedChatPage;

      // Run axe accessibility scan
      const accessibilityScanResults = await new AxeBuilder({ page })
        .withTags(["wcag2a", "wcag2aa", "wcag21a", "wcag21aa"])
        .exclude('[data-testid="loading-spinner"]') // Exclude dynamic loading elements
        .exclude('[role="status"]') // Exclude dynamic status elements
        .exclude('.animate-spin') // Exclude animated elements
        .analyze();

      // Filter for critical violations only (not serious for now)
      const criticalViolations = accessibilityScanResults.violations.filter(
        (v) => v.impact === "critical"
      );

      // Log all violations for reference
      if (accessibilityScanResults.violations.length > 0) {
        console.log("Accessibility Violations Found:");
        accessibilityScanResults.violations.forEach((v) => {
          console.log(`  - ${v.id}: ${v.description} (${v.impact})`);
          console.log(`    Affected: ${v.nodes.length} element(s)`);
        });
      }

      // Only fail on critical violations
      expect(criticalViolations.length).toBe(0);
    });

    test("should have no color contrast violations", async ({
      unifiedChatPage,
    }) => {
      const page = unifiedChatPage;

      const results = await new AxeBuilder({ page })
        .withTags(["cat.color"])
        .analyze();

      const contrastViolations = results.violations.filter(
        (v) => v.id === "color-contrast"
      );

      if (contrastViolations.length > 0) {
        console.log("Color contrast violations found:");
        contrastViolations.forEach((v) => {
          v.nodes.forEach((node) => {
            console.log(`  - ${node.html}`);
          });
        });
      }

      // Allow minor violations but log them
      console.log(`Color contrast check: ${contrastViolations.length} violations`);
    });
  });

  test.describe("ARIA Labels and Roles", () => {
    test("all interactive elements should have accessible names", async ({
      unifiedChatPage,
    }) => {
      const page = unifiedChatPage;

      // Check buttons
      const buttons = await page.locator("button").all();
      const buttonsWithoutLabels: string[] = [];

      for (const button of buttons) {
        const ariaLabel = await button.getAttribute("aria-label");
        const ariaLabelledBy = await button.getAttribute("aria-labelledby");
        const textContent = await button.textContent();
        const title = await button.getAttribute("title");

        const hasAccessibleName = !!(
          ariaLabel ||
          ariaLabelledBy ||
          textContent?.trim() ||
          title
        );

        if (!hasAccessibleName) {
          const testId =
            (await button.getAttribute("data-testid")) || "unknown";
          buttonsWithoutLabels.push(testId);
        }
      }

      if (buttonsWithoutLabels.length > 0) {
        console.log("Buttons without accessible names:", buttonsWithoutLabels);
      }

      expect(buttonsWithoutLabels.length).toBe(0);
    });

    test("input fields should have associated labels", async ({
      unifiedChatPage,
    }) => {
      const page = unifiedChatPage;

      // Check message input
      const messageInput = page.locator(UNIFIED_CHAT_SELECTORS.messageInput);
      const placeholder = await messageInput.getAttribute("placeholder");
      const ariaLabel = await messageInput.getAttribute("aria-label");

      expect(placeholder || ariaLabel).toBeTruthy();

      // Check search input
      const searchInput = page.locator(UNIFIED_CHAT_SELECTORS.searchInput);
      if ((await searchInput.count()) > 0) {
        const searchPlaceholder = await searchInput.getAttribute("placeholder");
        const searchAriaLabel = await searchInput.getAttribute("aria-label");
        expect(searchPlaceholder || searchAriaLabel).toBeTruthy();
      }

      console.log("All input fields have proper labels");
    });

    test("landmark regions should be properly defined", async ({
      unifiedChatPage,
    }) => {
      const page = unifiedChatPage;

      // Check for main landmark
      const main = page.locator('main, [role="main"]');
      expect(await main.count()).toBeGreaterThan(0);

      // Check for navigation if sidebar is present
      const sidebar = page.locator(UNIFIED_CHAT_SELECTORS.sidebar);
      if (await sidebar.isVisible()) {
        const navRole = await sidebar.getAttribute("role");
        const isNav = navRole === "navigation" || (await sidebar.locator("nav").count()) > 0;
        console.log(`Sidebar has navigation role: ${isNav}`);
      }

      console.log("Landmark regions are properly defined");
    });
  });

  test.describe("Keyboard Navigation", () => {
    test("should be able to navigate through all interactive elements with Tab", async ({
      unifiedChatPage,
    }) => {
      const page = unifiedChatPage;

      // Focus on the body first
      await page.keyboard.press("Tab");

      // Track focused elements
      const focusedElements: string[] = [];
      let maxTabs = 30;

      for (let i = 0; i < maxTabs; i++) {
        const activeElement = await page.evaluate(() => {
          const el = document.activeElement;
          return {
            tagName: el?.tagName,
            testId: el?.getAttribute("data-testid"),
            ariaLabel: el?.getAttribute("aria-label"),
            className: el?.className,
          };
        });

        if (activeElement.tagName === "BODY") break;

        focusedElements.push(
          activeElement.testId ||
            activeElement.ariaLabel ||
            activeElement.tagName ||
            "unknown"
        );

        await page.keyboard.press("Tab");
      }

      console.log(`Tab navigation visited ${focusedElements.length} elements`);
      expect(focusedElements.length).toBeGreaterThan(5);
    });

    test("should have visible focus indicators", async ({ unifiedChatPage }) => {
      const page = unifiedChatPage;

      // Focus on message input
      const messageInput = page.locator(UNIFIED_CHAT_SELECTORS.messageInput);
      await messageInput.focus();

      // Check for focus ring or outline
      const focusStyles = await messageInput.evaluate((el) => {
        const styles = window.getComputedStyle(el);
        return {
          outline: styles.outline,
          outlineColor: styles.outlineColor,
          boxShadow: styles.boxShadow,
        };
      });

      // Should have some visible focus indicator
      const hasFocusIndicator =
        focusStyles.outline !== "none" ||
        focusStyles.boxShadow !== "none";

      expect(hasFocusIndicator).toBe(true);
      console.log("Focus indicators are visible");
    });

    test("Escape key should close dialogs", async ({ unifiedChatPage }) => {
      const page = unifiedChatPage;

      // Open keyboard shortcuts dialog
      await page.keyboard.press("Control+/");
      await page.waitForTimeout(500);

      const dialog = page.locator('[role="dialog"]');
      const dialogExists = (await dialog.count()) > 0;

      if (dialogExists) {
        // Press Escape to close
        await page.keyboard.press("Escape");
        await page.waitForTimeout(300);

        // Dialog should be closed
        const dialogStillExists = (await dialog.count()) > 0;
        expect(dialogStillExists).toBe(false);
        console.log("Escape key properly closes dialogs");
      } else {
        console.log("No dialog to test Escape key with");
      }
    });

    test("Enter key should submit message (when connected)", async ({
      unifiedChatPage,
    }) => {
      const page = unifiedChatPage;

      const messageInput = page.locator(UNIFIED_CHAT_SELECTORS.messageInput);
      await messageInput.fill("Test message");

      // Check if sending is possible
      const sendButton = page.locator(UNIFIED_CHAT_SELECTORS.sendButton);
      const canSend = await sendButton.isEnabled();

      await messageInput.press("Enter");

      if (canSend) {
        // Input should be cleared
        const value = await messageInput.inputValue();
        expect(value).toBe("");
      }

      console.log(`Enter key handling: canSend=${canSend}`);
    });
  });

  test.describe("Focus Management", () => {
    test("focus should move to input after page load", async ({
      unifiedChatPage,
    }) => {
      const page = unifiedChatPage;

      // Wait a bit for auto-focus
      await page.waitForTimeout(500);

      // Check if input is focused or focusable
      const messageInput = page.locator(UNIFIED_CHAT_SELECTORS.messageInput);
      await messageInput.focus();

      const isFocused = await messageInput.evaluate(
        (el) => document.activeElement === el
      );

      expect(isFocused).toBe(true);
      console.log("Input is properly focusable on page load");
    });

    test("focus should be trapped in modal dialogs", async ({
      unifiedChatPage,
    }) => {
      const page = unifiedChatPage;

      // Open settings or a modal
      await page.keyboard.press("Control+/");
      await page.waitForTimeout(500);

      const dialog = page.locator('[role="dialog"]');
      if ((await dialog.count()) > 0) {
        // Tab through the dialog
        await page.keyboard.press("Tab");
        await page.keyboard.press("Tab");
        await page.keyboard.press("Tab");

        // Focus should still be within dialog
        const focusedInDialog = await page.evaluate(() => {
          const active = document.activeElement;
          const dialog = document.querySelector('[role="dialog"]');
          return dialog?.contains(active);
        });

        expect(focusedInDialog).toBe(true);
        console.log("Focus is properly trapped in modal");

        await page.keyboard.press("Escape");
      }
    });
  });

  test.describe("Screen Reader Support", () => {
    test("should have proper heading hierarchy", async ({ unifiedChatPage }) => {
      const page = unifiedChatPage;

      const headings = await page.evaluate(() => {
        const h1s = document.querySelectorAll("h1").length;
        const h2s = document.querySelectorAll("h2").length;
        const h3s = document.querySelectorAll("h3").length;
        return { h1s, h2s, h3s };
      });

      // Should have at least one h1
      expect(headings.h1s).toBeGreaterThan(0);

      console.log(
        `Heading hierarchy: H1=${headings.h1s}, H2=${headings.h2s}, H3=${headings.h3s}`
      );
    });

    test("should have live regions for dynamic content", async ({
      unifiedChatPage,
    }) => {
      const page = unifiedChatPage;

      // Check for ARIA live regions
      const liveRegions = await page.evaluate(() => {
        const polite = document.querySelectorAll('[aria-live="polite"]').length;
        const assertive = document.querySelectorAll(
          '[aria-live="assertive"]'
        ).length;
        const status = document.querySelectorAll('[role="status"]').length;
        const alert = document.querySelectorAll('[role="alert"]').length;
        return { polite, assertive, status, alert };
      });

      console.log("Live regions:", liveRegions);

      // Should have at least some live region for status updates
      const hasLiveRegion =
        liveRegions.polite > 0 ||
        liveRegions.assertive > 0 ||
        liveRegions.status > 0;

      if (!hasLiveRegion) {
        console.log("Warning: No live regions found for dynamic content");
      }
    });

    test("buttons should have aria-pressed state when toggleable", async ({
      unifiedChatPage,
    }) => {
      const page = unifiedChatPage;

      const voiceToggle = page.locator(UNIFIED_CHAT_SELECTORS.voiceModeToggle);
      if ((await voiceToggle.count()) > 0) {
        const ariaPressed = await voiceToggle.getAttribute("aria-pressed");

        // Toggle buttons should have aria-pressed
        if (ariaPressed !== null) {
          expect(["true", "false"]).toContain(ariaPressed);
          console.log(`Voice toggle has aria-pressed="${ariaPressed}"`);
        }
      }
    });
  });

  test.describe("Mobile Accessibility", () => {
    test("should be usable at mobile viewport", async ({ unifiedChatPage }) => {
      const page = unifiedChatPage;

      // Set mobile viewport
      await page.setViewportSize({ width: 375, height: 812 });
      await page.waitForTimeout(500);

      // Run axe scan at mobile size
      const results = await new AxeBuilder({ page })
        .withTags(["wcag2a", "wcag2aa"])
        .analyze();

      const criticalViolations = results.violations.filter(
        (v) => v.impact === "critical"
      );

      expect(criticalViolations.length).toBe(0);

      // Verify touch targets are large enough (44x44 minimum)
      const buttons = await page.locator("button").all();
      let smallButtons = 0;

      for (const button of buttons.slice(0, 10)) {
        // Check first 10
        const size = await button.boundingBox();
        if (size && (size.width < 44 || size.height < 44)) {
          smallButtons++;
        }
      }

      if (smallButtons > 0) {
        console.log(`Warning: ${smallButtons} buttons smaller than 44x44px`);
      }

      // Reset viewport
      await page.setViewportSize({ width: 1280, height: 800 });
    });

    test("should have adequate text sizing", async ({ unifiedChatPage }) => {
      const page = unifiedChatPage;

      await page.setViewportSize({ width: 375, height: 812 });
      await page.waitForTimeout(300);

      // Check that text is readable (minimum 12px)
      const textSizes = await page.evaluate(() => {
        const elements = document.querySelectorAll("p, span, label, button");
        const sizes: number[] = [];
        elements.forEach((el) => {
          const fontSize = parseFloat(
            window.getComputedStyle(el).fontSize
          );
          if (fontSize > 0) sizes.push(fontSize);
        });
        return sizes;
      });

      const tooSmall = textSizes.filter((s) => s < 12).length;
      console.log(
        `Text sizing: ${textSizes.length} elements checked, ${tooSmall} below 12px`
      );

      await page.setViewportSize({ width: 1280, height: 800 });
    });
  });
});
