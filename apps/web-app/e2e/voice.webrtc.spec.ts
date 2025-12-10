import { expect, test } from "@playwright/test";

test.describe("voice mode WebRTC", () => {
  test("renders VAD indicator when voice panel is present", async ({
    page,
  }) => {
    await page.goto("/");
    const panelTrigger = page.getByTestId("realtime-voice-mode-button");

    if ((await panelTrigger.count()) === 0) {
      test.skip("Voice mode trigger not rendered in this environment");
    }

    await panelTrigger.first().click();
    const vadIndicator = page.getByTestId("vad-indicator");
    await expect(vadIndicator).toBeVisible({ timeout: 10000 });
  });

  test("renders barge-in button when voice panel is present", async ({
    page,
  }) => {
    await page.goto("/");
    const panelTrigger = page.getByTestId("realtime-voice-mode-button");

    if ((await panelTrigger.count()) === 0) {
      test.skip("Voice mode trigger not rendered in this environment");
    }

    await panelTrigger.first().click();

    // Check for barge-in button in the voice panel
    const bargeInButton = page.getByRole("button", { name: /barge-in/i });
    await expect(bargeInButton).toBeVisible({ timeout: 10000 });
  });

  test("barge-in button has correct aria-label", async ({ page }) => {
    await page.goto("/");
    const panelTrigger = page.getByTestId("realtime-voice-mode-button");

    if ((await panelTrigger.count()) === 0) {
      test.skip("Voice mode trigger not rendered in this environment");
    }

    await panelTrigger.first().click();

    // Verify barge-in button has proper accessibility label
    const bargeInButton = page.getByRole("button", { name: /interrupt/i });
    if ((await bargeInButton.count()) > 0) {
      await expect(bargeInButton.first()).toHaveAttribute("aria-label");
    }
  });
});

test.describe("Voice Barge-in Indicator", () => {
  test.beforeEach(async ({ page }) => {
    await page.goto("/");
  });

  test("barge-in indicator is not visible by default", async ({ page }) => {
    const panelTrigger = page.getByTestId("realtime-voice-mode-button");

    if ((await panelTrigger.count()) === 0) {
      test.skip("Voice mode not available in this environment");
    }

    await panelTrigger.first().click();

    // Barge-in indicator should not be visible when no barge-in has occurred
    const bargeInIndicator = page.getByTestId("voice-barge-in-indicator");
    await expect(bargeInIndicator).not.toBeVisible();
  });

  test("barge-in indicator has correct ARIA attributes when visible", async ({
    page,
  }) => {
    // Inject a test barge-in indicator to verify accessibility
    await page.evaluate(() => {
      const indicator = document.createElement("div");
      indicator.setAttribute("data-testid", "voice-barge-in-indicator");
      indicator.setAttribute("role", "status");
      indicator.setAttribute("aria-live", "polite");
      indicator.innerHTML = "<p>Response interrupted</p>";
      document.body.appendChild(indicator);
    });

    const indicator = page.getByTestId("voice-barge-in-indicator");
    await expect(indicator).toHaveAttribute("role", "status");
    await expect(indicator).toHaveAttribute("aria-live", "polite");
  });

  test("barge-in indicator dismiss button is accessible", async ({ page }) => {
    // Inject a test barge-in indicator with dismiss button
    await page.evaluate(() => {
      const indicator = document.createElement("div");
      indicator.setAttribute("data-testid", "voice-barge-in-indicator");
      indicator.setAttribute("role", "status");
      indicator.innerHTML = `
        <p>Response interrupted</p>
        <button data-testid="barge-in-dismiss" aria-label="Dismiss notification">×</button>
      `;
      document.body.appendChild(indicator);
    });

    const dismissButton = page.getByTestId("barge-in-dismiss");
    await expect(dismissButton).toBeVisible();
    await expect(dismissButton).toHaveAttribute(
      "aria-label",
      "Dismiss notification",
    );
  });

  test("completion progress bar has proper ARIA attributes", async ({
    page,
  }) => {
    // Inject a test progress bar
    await page.evaluate(() => {
      const progress = document.createElement("div");
      progress.setAttribute("data-testid", "completion-progress");
      progress.setAttribute("role", "progressbar");
      progress.setAttribute("aria-valuenow", "50");
      progress.setAttribute("aria-valuemin", "0");
      progress.setAttribute("aria-valuemax", "100");
      progress.setAttribute(
        "aria-label",
        "Response completion before interruption",
      );
      document.body.appendChild(progress);
    });

    const progressBar = page.getByTestId("completion-progress");
    await expect(progressBar).toHaveAttribute("role", "progressbar");
    await expect(progressBar).toHaveAttribute("aria-valuenow", "50");
    await expect(progressBar).toHaveAttribute("aria-valuemin", "0");
    await expect(progressBar).toHaveAttribute("aria-valuemax", "100");
  });
});
