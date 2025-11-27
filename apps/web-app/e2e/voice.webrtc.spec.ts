import { expect, test } from "@playwright/test";

test.describe("voice mode WebRTC", () => {
  test("renders VAD indicator when voice panel is present", async ({ page }) => {
    await page.goto("/");
    const panelTrigger = page.getByTestId("realtime-voice-mode-button");

    if ((await panelTrigger.count()) === 0) {
      test.skip("Voice mode trigger not rendered in this environment");
    }

    await panelTrigger.first().click();
    const vadIndicator = page.getByTestId("vad-indicator");
    await expect(vadIndicator).toBeVisible({ timeout: 10000 });
  });
});

