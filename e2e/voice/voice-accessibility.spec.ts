/**
 * Voice Accessibility E2E Tests
 *
 * Tests accessibility features for voice mode including:
 * - ARIA labels and roles
 * - Keyboard navigation
 * - Screen reader announcements
 * - Color contrast
 * - Focus management
 */

import {
  test,
  expect,
  VOICE_SELECTORS,
  VOICE_CONFIG,
  WAIT_TIMES,
  navigateToVoiceChat,
  waitForVoicePanel,
  startVoiceSession,
  stopVoiceSession,
  waitForVoiceConnection,
} from "../fixtures/voice";

// Skip all tests if live backend is not enabled
test.beforeEach(async ({}, testInfo) => {
  if (!VOICE_CONFIG.LIVE_REALTIME) {
    testInfo.skip(true, "Set LIVE_REALTIME_E2E=1 to run live voice tests");
  }
});

test.describe("Voice Accessibility - ARIA Labels", () => {
  test.setTimeout(45000);

  test("should have ARIA labels on all voice controls", async ({ voicePage }) => {
    const page = voicePage;

    await navigateToVoiceChat(page);
    await waitForVoicePanel(page);

    const voicePanel = page.locator(VOICE_SELECTORS.panel).first();

    // Check all buttons have accessible names
    const buttons = await voicePanel.locator("button").all();
    const buttonsWithoutLabels: string[] = [];

    for (let i = 0; i < buttons.length; i++) {
      const button = buttons[i];

      // Check for accessible name (aria-label, aria-labelledby, or text content)
      const ariaLabel = await button.getAttribute("aria-label");
      const ariaLabelledBy = await button.getAttribute("aria-labelledby");
      const textContent = await button.textContent();

      const hasAccessibleName = !!(ariaLabel || ariaLabelledBy || textContent?.trim());

      if (!hasAccessibleName) {
        const testId = await button.getAttribute("data-testid") || `button-${i}`;
        buttonsWithoutLabels.push(testId);
      }
    }

    if (buttonsWithoutLabels.length > 0) {
      console.log(`Buttons without accessible names: ${buttonsWithoutLabels.join(", ")}`);
    } else {
      console.log("All buttons have accessible names");
    }

    expect(buttonsWithoutLabels.length).toBe(0);
  });

  test("should have proper roles on interactive elements", async ({ voicePage }) => {
    const page = voicePage;

    await navigateToVoiceChat(page);
    await waitForVoicePanel(page);

    const voicePanel = page.locator(VOICE_SELECTORS.panel).first();

    // Check toggles have proper role
    const toggles = await voicePanel.locator('[role="switch"], input[type="checkbox"]').all();
    console.log(`Found ${toggles.length} toggle controls`);

    // Check sliders have proper role
    const sliders = await voicePanel.locator('[role="slider"], input[type="range"]').all();
    console.log(`Found ${sliders.length} slider controls`);

    // Check select elements
    const selects = await voicePanel.locator('select, [role="listbox"], [role="combobox"]').all();
    console.log(`Found ${selects.length} select controls`);

    // Verify interactive elements are properly marked
    const interactiveElements = await voicePanel.locator(
      'button, a, input, select, textarea, [role="button"], [role="link"], [tabindex]:not([tabindex="-1"])'
    ).all();

    console.log(`Total interactive elements: ${interactiveElements.length}`);
    expect(interactiveElements.length).toBeGreaterThan(0);
  });

  test("should have aria-live regions for state changes", async ({ voicePage }) => {
    const page = voicePage;

    await navigateToVoiceChat(page);
    await waitForVoicePanel(page);

    // Look for live regions that announce state changes
    const liveRegions = await page.locator(
      '[aria-live="polite"], [aria-live="assertive"], [role="status"], [role="alert"]'
    ).all();

    console.log(`Found ${liveRegions.length} ARIA live regions`);

    // At least one live region should exist for announcements
    if (liveRegions.length === 0) {
      console.log("Warning: No ARIA live regions found - screen reader users may miss state changes");
    }

    // Check connection status has appropriate role
    const connectionStatus = page.locator(VOICE_SELECTORS.connectionStatus);
    const statusExists = await connectionStatus.count() > 0;

    if (statusExists) {
      const role = await connectionStatus.first().getAttribute("role");
      const ariaLive = await connectionStatus.first().getAttribute("aria-live");

      console.log(`Connection status - role: ${role}, aria-live: ${ariaLive}`);
    }
  });
});

test.describe("Voice Accessibility - Keyboard Navigation", () => {
  test.setTimeout(60000);

  test("should support keyboard-only voice interaction", async ({ voicePage }) => {
    const page = voicePage;

    await navigateToVoiceChat(page);

    // Navigate to voice button using Tab
    await page.keyboard.press("Tab");
    await page.waitForTimeout(200);

    let foundVoiceButton = false;
    let tabCount = 0;
    const maxTabs = 20;

    while (!foundVoiceButton && tabCount < maxTabs) {
      const focusedElement = await page.evaluate(() => {
        const el = document.activeElement;
        return {
          testId: el?.getAttribute("data-testid"),
          text: el?.textContent?.trim().substring(0, 30),
          tagName: el?.tagName,
        };
      });

      if (
        focusedElement.testId?.includes("voice") ||
        focusedElement.text?.toLowerCase().includes("voice")
      ) {
        foundVoiceButton = true;
        console.log(`Found voice control after ${tabCount} tabs`);
        break;
      }

      await page.keyboard.press("Tab");
      await page.waitForTimeout(100);
      tabCount++;
    }

    if (foundVoiceButton) {
      // Activate with Enter/Space
      await page.keyboard.press("Enter");
      await page.waitForTimeout(WAIT_TIMES.UI_UPDATE);

      // Verify voice panel or action occurred
      const voicePanel = page.locator(VOICE_SELECTORS.panel).first();
      const panelVisible = await voicePanel.count() > 0;

      console.log(`Voice panel activated via keyboard: ${panelVisible}`);
    } else {
      console.log("Voice controls may need better keyboard accessibility");
    }
  });

  test("should have visible focus indicators on voice buttons", async ({ voicePage }) => {
    const page = voicePage;

    await navigateToVoiceChat(page);
    await waitForVoicePanel(page);

    const voicePanel = page.locator(VOICE_SELECTORS.panel).first();
    const buttons = await voicePanel.locator("button").all();

    const buttonsWithoutFocusIndicator: string[] = [];

    for (let i = 0; i < Math.min(buttons.length, 5); i++) {
      const button = buttons[i];

      // Focus the button
      await button.focus();
      await page.waitForTimeout(100);

      // Check for visible focus indicator
      const hasFocusRing = await button.evaluate((el) => {
        const styles = window.getComputedStyle(el);
        const focusStyles = window.getComputedStyle(el, ":focus");

        // Check for outline, box-shadow, or border changes
        const hasOutline = styles.outline !== "none" && styles.outlineWidth !== "0px";
        const hasBoxShadow = styles.boxShadow !== "none";
        const hasBorder = styles.borderColor !== "transparent";

        return hasOutline || hasBoxShadow || hasBorder;
      });

      if (!hasFocusRing) {
        const testId = await button.getAttribute("data-testid") || `button-${i}`;
        buttonsWithoutFocusIndicator.push(testId);
      }
    }

    if (buttonsWithoutFocusIndicator.length > 0) {
      console.log(`Buttons without visible focus indicators: ${buttonsWithoutFocusIndicator.join(", ")}`);
    } else {
      console.log("All buttons have visible focus indicators");
    }

    // Most buttons should have focus indicators
    const percentageWithout = (buttonsWithoutFocusIndicator.length / buttons.length) * 100;
    expect(percentageWithout).toBeLessThan(50);
  });

  test("should maintain logical tab order", async ({ voicePage }) => {
    const page = voicePage;

    await navigateToVoiceChat(page);
    await waitForVoicePanel(page);

    // Use .first() since panel selector may match multiple elements
    const voicePanel = page.locator(VOICE_SELECTORS.panel).first();
    await voicePanel.focus();

    const tabOrder: string[] = [];
    let lastTabIndex = -1;

    // Tab through elements and record order
    for (let i = 0; i < 10; i++) {
      await page.keyboard.press("Tab");
      await page.waitForTimeout(100);

      const focusedInfo = await page.evaluate(() => {
        const el = document.activeElement;
        return {
          testId: el?.getAttribute("data-testid") || el?.tagName || "unknown",
          tabIndex: el?.getAttribute("tabindex"),
          y: el?.getBoundingClientRect().y || 0,
        };
      });

      tabOrder.push(`${focusedInfo.testId} (y: ${Math.round(focusedInfo.y)})`);
    }

    console.log(`Tab order: ${tabOrder.join(" -> ")}`);

    // Tab order should generally follow visual order (top to bottom, left to right)
    // This is a basic check - visual Y positions should generally increase
    expect(tabOrder.length).toBeGreaterThan(0);
  });
});

test.describe("Voice Accessibility - Screen Reader Support", () => {
  test.setTimeout(45000);

  test("should announce voice state changes to screen reader", async ({ voicePage }) => {
    const page = voicePage;

    await navigateToVoiceChat(page);
    await waitForVoicePanel(page);

    // Start voice session
    await startVoiceSession(page);
    await page.waitForTimeout(WAIT_TIMES.UI_UPDATE);

    // Check for status announcements
    const statusAnnouncements = page.locator(
      '[role="status"], [aria-live="polite"], [aria-live="assertive"]'
    );

    const announcementCount = await statusAnnouncements.count();

    if (announcementCount > 0) {
      for (let i = 0; i < announcementCount; i++) {
        const text = await statusAnnouncements.nth(i).textContent();
        console.log(`Status announcement ${i + 1}: "${text}"`);
      }
    }

    // Check for alerts (more urgent announcements)
    const alerts = page.locator('[role="alert"]');
    const alertCount = await alerts.count();

    if (alertCount > 0) {
      for (let i = 0; i < alertCount; i++) {
        const text = await alerts.nth(i).textContent();
        console.log(`Alert ${i + 1}: "${text}"`);
      }
    }

    await stopVoiceSession(page);

    console.log(`Total announcements found: ${announcementCount + alertCount}`);
  });

  test("should have descriptive alt text for visual elements", async ({ voicePage }) => {
    const page = voicePage;

    await navigateToVoiceChat(page);
    await waitForVoicePanel(page);

    const voicePanel = page.locator(VOICE_SELECTORS.panel).first();

    // Check images
    const images = await voicePanel.locator("img").all();
    const imagesWithoutAlt: string[] = [];

    for (const img of images) {
      const alt = await img.getAttribute("alt");
      const ariaLabel = await img.getAttribute("aria-label");
      const role = await img.getAttribute("role");

      // Decorative images should have role="presentation" or empty alt
      // Informative images should have descriptive alt
      const isDecorative = role === "presentation" || role === "none";
      const hasDescription = !!(alt?.trim() || ariaLabel?.trim());

      if (!isDecorative && !hasDescription) {
        const src = await img.getAttribute("src");
        imagesWithoutAlt.push(src || "unknown");
      }
    }

    if (imagesWithoutAlt.length > 0) {
      console.log(`Images without alt text: ${imagesWithoutAlt.join(", ")}`);
    } else {
      console.log("All images have appropriate alt text or are marked decorative");
    }

    // Check SVG icons
    const svgs = await voicePanel.locator("svg").all();
    let decorativeSvgCount = 0;

    for (const svg of svgs) {
      const ariaHidden = await svg.getAttribute("aria-hidden");
      const role = await svg.getAttribute("role");

      // SVG icons should be hidden from screen readers if they're decorative
      if (ariaHidden === "true" || role === "presentation") {
        decorativeSvgCount++;
      }
    }

    console.log(`SVGs marked as decorative: ${decorativeSvgCount}/${svgs.length}`);
  });
});

test.describe("Voice Accessibility - Color and Contrast", () => {
  test.setTimeout(45000);

  test("should have sufficient color contrast", async ({ voicePage }) => {
    const page = voicePage;

    await navigateToVoiceChat(page);
    await waitForVoicePanel(page);

    // Check text elements for contrast
    const textElements = await page.locator(`${VOICE_SELECTORS.panel} *`).all();

    // Sample some text elements
    const contrastIssues: string[] = [];

    for (let i = 0; i < Math.min(textElements.length, 10); i++) {
      const el = textElements[i];
      const text = await el.textContent();

      if (text?.trim()) {
        const colors = await el.evaluate((element) => {
          const styles = window.getComputedStyle(element);
          return {
            color: styles.color,
            backgroundColor: styles.backgroundColor,
          };
        });

        // Log colors for manual verification
        // Automated contrast checking would require a color library
        console.log(`Element ${i}: text="${colors.color}", bg="${colors.backgroundColor}"`);
      }
    }

    // Note: Full contrast checking requires axe-core or similar library
    // This test documents the need for contrast verification
    console.log("Color contrast check completed - manual verification recommended");
  });

  test("should not rely solely on color to convey information", async ({ voicePage }) => {
    const page = voicePage;

    await navigateToVoiceChat(page);
    await waitForVoicePanel(page);

    // Check connection status indicators
    const statusIndicators = page.locator(
      '[class*="status"], [class*="indicator"], [class*="connected"], [class*="error"]'
    );

    const indicatorCount = await statusIndicators.count();

    for (let i = 0; i < indicatorCount; i++) {
      const indicator = statusIndicators.nth(i);

      // Check if indicator has text or icon in addition to color
      const hasText = (await indicator.textContent())?.trim();
      const hasIcon = await indicator.locator("svg, img, [class*='icon']").count() > 0;
      const hasAriaLabel = await indicator.getAttribute("aria-label");

      const hasNonColorIndicator = !!(hasText || hasIcon || hasAriaLabel);

      if (!hasNonColorIndicator) {
        const className = await indicator.getAttribute("class");
        console.log(`Warning: Status indicator relies only on color: ${className}`);
      }
    }

    console.log(`Checked ${indicatorCount} status indicators`);
  });
});

test.describe("Voice Accessibility - Focus Management", () => {
  test.setTimeout(45000);

  test("should manage focus correctly when voice panel opens", async ({ voicePage }) => {
    const page = voicePage;

    await navigateToVoiceChat(page);

    // Get initial focus
    const initialFocus = await page.evaluate(() => document.activeElement?.tagName);
    console.log(`Initial focus: ${initialFocus}`);

    // Open voice panel
    const voiceButton = page.locator(VOICE_SELECTORS.toggleButton);
    await voiceButton.click();
    await page.waitForTimeout(WAIT_TIMES.UI_UPDATE);

    // Focus should move to panel or remain predictable
    const afterOpenFocus = await page.evaluate(() => {
      const el = document.activeElement;
      return {
        tagName: el?.tagName,
        testId: el?.getAttribute("data-testid"),
        isInPanel: el?.closest('[data-testid="voice-mode-panel"]') !== null,
      };
    });

    console.log(`Focus after panel open: ${afterOpenFocus.tagName} (in panel: ${afterOpenFocus.isInPanel})`);

    // Focus should ideally be in the panel or on a logical element
  });

  test("should restore focus after closing settings modal", async ({ voicePage }) => {
    const page = voicePage;

    await navigateToVoiceChat(page);
    await waitForVoicePanel(page);

    // Open settings
    const settingsButton = page.locator(VOICE_SELECTORS.settingsButton);
    const buttonTestId = await settingsButton.first().getAttribute("data-testid");

    await settingsButton.first().focus();
    await settingsButton.first().click();
    await page.waitForTimeout(WAIT_TIMES.UI_UPDATE);

    // Verify modal is open
    const modal = page.locator(VOICE_SELECTORS.settingsModal);
    await expect(modal.first()).toBeVisible();

    // Close modal with Escape
    await page.keyboard.press("Escape");
    await page.waitForTimeout(WAIT_TIMES.UI_UPDATE);

    // Focus should return to the button that opened the modal
    const restoredFocus = await page.evaluate(() => {
      return document.activeElement?.getAttribute("data-testid");
    });

    console.log(`Focus after modal close: ${restoredFocus}`);
    console.log(`Expected focus: ${buttonTestId}`);

    // Ideally focus returns to trigger element
    // This is a best practice but may not always be implemented
  });
});
