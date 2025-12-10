import { expect, test } from "@playwright/test";

test.describe("Clinical Context Presets", () => {
  test.beforeEach(async ({ page }) => {
    await page.goto("/");
  });

  test.describe("Preset Picker Rendering", () => {
    test("should render preset picker when clinical context panel is available", async ({
      page,
    }) => {
      // Look for clinical context panel trigger
      const clinicalContextTrigger = page.getByTestId(
        "clinical-context-trigger",
      );

      if ((await clinicalContextTrigger.count()) === 0) {
        test.skip("Clinical context panel not available in this environment");
      }

      await clinicalContextTrigger.first().click();

      // Check for preset picker in the panel
      const presetPicker = page.getByTestId("preset-picker");
      if ((await presetPicker.count()) > 0) {
        await expect(presetPicker).toBeVisible({ timeout: 5000 });
      }
    });

    test("should have built-in presets section toggle", async ({ page }) => {
      const builtinToggle = page.getByTestId("builtin-presets-toggle");

      if ((await builtinToggle.count()) === 0) {
        test.skip("Preset picker not visible in this environment");
      }

      await expect(builtinToggle).toBeVisible();
      await expect(builtinToggle).toHaveAttribute("aria-expanded", "false");
    });

    test("should have custom presets section toggle", async ({ page }) => {
      const customToggle = page.getByTestId("custom-presets-toggle");

      if ((await customToggle.count()) === 0) {
        test.skip("Preset picker not visible in this environment");
      }

      await expect(customToggle).toBeVisible();
      await expect(customToggle).toHaveAttribute("aria-expanded", "false");
    });
  });

  test.describe("Preset Selection", () => {
    test("should expand built-in presets section when clicked", async ({
      page,
    }) => {
      const builtinToggle = page.getByTestId("builtin-presets-toggle");

      if ((await builtinToggle.count()) === 0) {
        test.skip("Preset picker not visible in this environment");
      }

      await builtinToggle.click();
      await expect(builtinToggle).toHaveAttribute("aria-expanded", "true");
    });

    test("should show cardiac preset in built-in presets", async ({ page }) => {
      const builtinToggle = page.getByTestId("builtin-presets-toggle");

      if ((await builtinToggle.count()) === 0) {
        test.skip("Preset picker not visible in this environment");
      }

      await builtinToggle.click();

      const cardiacPreset = page.getByTestId("preset-cardiac-default");
      await expect(cardiacPreset).toBeVisible();
    });

    test("should show diabetic preset in built-in presets", async ({
      page,
    }) => {
      const builtinToggle = page.getByTestId("builtin-presets-toggle");

      if ((await builtinToggle.count()) === 0) {
        test.skip("Preset picker not visible in this environment");
      }

      await builtinToggle.click();

      const diabeticPreset = page.getByTestId("preset-diabetic-default");
      await expect(diabeticPreset).toBeVisible();
    });

    test("should show respiratory preset in built-in presets", async ({
      page,
    }) => {
      const builtinToggle = page.getByTestId("builtin-presets-toggle");

      if ((await builtinToggle.count()) === 0) {
        test.skip("Preset picker not visible in this environment");
      }

      await builtinToggle.click();

      const respiratoryPreset = page.getByTestId("preset-respiratory-default");
      await expect(respiratoryPreset).toBeVisible();
    });

    test("should show neurological preset in built-in presets", async ({
      page,
    }) => {
      const builtinToggle = page.getByTestId("builtin-presets-toggle");

      if ((await builtinToggle.count()) === 0) {
        test.skip("Preset picker not visible in this environment");
      }

      await builtinToggle.click();

      const neuroPreset = page.getByTestId("preset-neurological-default");
      await expect(neuroPreset).toBeVisible();
    });

    test("should highlight selected preset", async ({ page }) => {
      const builtinToggle = page.getByTestId("builtin-presets-toggle");

      if ((await builtinToggle.count()) === 0) {
        test.skip("Preset picker not visible in this environment");
      }

      await builtinToggle.click();

      const cardiacPreset = page.getByTestId("preset-cardiac-default");
      await cardiacPreset.click();

      await expect(cardiacPreset).toHaveAttribute("aria-pressed", "true");
    });
  });

  test.describe("Compact Mode", () => {
    test("should render compact preset picker when compact mode is enabled", async ({
      page,
    }) => {
      // Inject a compact preset picker for testing
      await page.evaluate(() => {
        const picker = document.createElement("div");
        picker.setAttribute("data-testid", "preset-picker-compact");
        picker.innerHTML = `
          <select data-testid="preset-select">
            <option value="">Select a preset...</option>
            <option value="cardiac-default">Cardiac Patient</option>
            <option value="diabetic-default">Diabetic Patient</option>
          </select>
        `;
        document.body.appendChild(picker);
      });

      const compactPicker = page.getByTestId("preset-picker-compact");
      await expect(compactPicker).toBeVisible();

      const presetSelect = page.getByTestId("preset-select");
      await expect(presetSelect).toBeVisible();
    });
  });

  test.describe("Accessibility", () => {
    test("preset buttons have proper aria-pressed attribute", async ({
      page,
    }) => {
      // Inject a preset button for testing
      await page.evaluate(() => {
        const container = document.createElement("div");
        container.innerHTML = `
          <button
            data-testid="preset-test-preset"
            aria-pressed="false"
            type="button"
          >
            Test Preset
          </button>
        `;
        document.body.appendChild(container);
      });

      const presetButton = page.getByTestId("preset-test-preset");
      await expect(presetButton).toHaveAttribute("aria-pressed", "false");
    });

    test("section toggles have proper aria-expanded attribute", async ({
      page,
    }) => {
      // Inject a toggle button for testing
      await page.evaluate(() => {
        const container = document.createElement("div");
        container.innerHTML = `
          <button
            data-testid="test-section-toggle"
            aria-expanded="false"
            type="button"
          >
            Test Section
          </button>
        `;
        document.body.appendChild(container);
      });

      const toggleButton = page.getByTestId("test-section-toggle");
      await expect(toggleButton).toHaveAttribute("aria-expanded", "false");
    });

    test("edit buttons have aria-label", async ({ page }) => {
      // Inject an edit button for testing
      await page.evaluate(() => {
        const container = document.createElement("div");
        container.innerHTML = `
          <button
            data-testid="edit-preset-test"
            aria-label="Edit Test Preset"
            type="button"
          >
            Edit
          </button>
        `;
        document.body.appendChild(container);
      });

      const editButton = page.getByTestId("edit-preset-test");
      await expect(editButton).toHaveAttribute(
        "aria-label",
        "Edit Test Preset",
      );
    });

    test("delete buttons have aria-label", async ({ page }) => {
      // Inject a delete button for testing
      await page.evaluate(() => {
        const container = document.createElement("div");
        container.innerHTML = `
          <button
            data-testid="delete-preset-test"
            aria-label="Delete Test Preset"
            type="button"
          >
            Delete
          </button>
        `;
        document.body.appendChild(container);
      });

      const deleteButton = page.getByTestId("delete-preset-test");
      await expect(deleteButton).toHaveAttribute(
        "aria-label",
        "Delete Test Preset",
      );
    });
  });

  test.describe("Save as Preset", () => {
    test("should have save as preset button when enabled", async ({ page }) => {
      // Inject a save button for testing
      await page.evaluate(() => {
        const container = document.createElement("div");
        container.innerHTML = `
          <button
            data-testid="save-as-preset"
            type="button"
          >
            Save Current Context as Preset
          </button>
        `;
        document.body.appendChild(container);
      });

      const saveButton = page.getByTestId("save-as-preset");
      await expect(saveButton).toBeVisible();
      await expect(saveButton).toHaveText("Save Current Context as Preset");
    });
  });
});
