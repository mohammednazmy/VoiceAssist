/**
 * VoiceModeSettings Component Tests
 * Tests for voice settings modal UI and interactions
 */

import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { render, screen, cleanup, fireEvent } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { VoiceModeSettings } from "../VoiceModeSettings";
import { useVoiceSettingsStore } from "../../../stores/voiceSettingsStore";

describe("VoiceModeSettings", () => {
  const mockOnClose = vi.fn();

  beforeEach(() => {
    // Reset store to defaults before each test
    useVoiceSettingsStore.setState({
      voice: "alloy",
      language: "en",
      vadSensitivity: 50,
      autoStartOnOpen: false,
      showStatusHints: true,
    });
    localStorage.clear();
    vi.clearAllMocks();
  });

  afterEach(() => {
    cleanup();
  });

  describe("visibility", () => {
    it("should render nothing when isOpen is false", () => {
      render(<VoiceModeSettings isOpen={false} onClose={mockOnClose} />);

      expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
      expect(
        screen.queryByTestId("voice-settings-modal"),
      ).not.toBeInTheDocument();
    });

    it("should render modal when isOpen is true", () => {
      render(<VoiceModeSettings isOpen={true} onClose={mockOnClose} />);

      expect(screen.getByRole("dialog")).toBeInTheDocument();
      expect(screen.getByTestId("voice-settings-modal")).toBeInTheDocument();
    });

    it("should have proper ARIA attributes when open", () => {
      render(<VoiceModeSettings isOpen={true} onClose={mockOnClose} />);

      const dialog = screen.getByRole("dialog");
      expect(dialog).toHaveAttribute("aria-modal", "true");
      expect(dialog).toHaveAttribute("aria-labelledby", "voice-settings-title");
    });
  });

  describe("display current settings", () => {
    it("should display current voice selection", () => {
      useVoiceSettingsStore.getState().setVoice("nova");

      render(<VoiceModeSettings isOpen={true} onClose={mockOnClose} />);

      const voiceSelect = screen.getByTestId("voice-select");
      expect(voiceSelect).toHaveValue("nova");
    });

    it("should display current language selection", () => {
      useVoiceSettingsStore.getState().setLanguage("es");

      render(<VoiceModeSettings isOpen={true} onClose={mockOnClose} />);

      const languageSelect = screen.getByTestId("language-select");
      expect(languageSelect).toHaveValue("es");
    });

    it("should display current VAD sensitivity", () => {
      useVoiceSettingsStore.getState().setVadSensitivity(75);

      render(<VoiceModeSettings isOpen={true} onClose={mockOnClose} />);

      const slider = screen.getByTestId("vad-sensitivity-slider");
      expect(slider).toHaveValue("75");
      // Check label contains sensitivity value
      expect(
        screen.getByText(/Voice Detection Sensitivity: 75%/),
      ).toBeInTheDocument();
    });

    it("should display current auto-start setting", () => {
      useVoiceSettingsStore.getState().setAutoStartOnOpen(true);

      render(<VoiceModeSettings isOpen={true} onClose={mockOnClose} />);

      const checkbox = screen.getByTestId("auto-start-checkbox");
      expect(checkbox).toBeChecked();
    });

    it("should display current show-hints setting", () => {
      useVoiceSettingsStore.getState().setShowStatusHints(false);

      render(<VoiceModeSettings isOpen={true} onClose={mockOnClose} />);

      const checkbox = screen.getByTestId("show-hints-checkbox");
      expect(checkbox).not.toBeChecked();
    });

    it("should display config summary with current settings", () => {
      useVoiceSettingsStore.setState({
        voice: "shimmer",
        language: "fr",
        vadSensitivity: 80,
        autoStartOnOpen: false,
        showStatusHints: true,
      });

      render(<VoiceModeSettings isOpen={true} onClose={mockOnClose} />);

      // Check config summary contains expected values
      // The summary is inside a <p> element with a <strong>Current:</strong>
      const summaryContainer = screen.getByText(/Current:/).closest("p");
      expect(summaryContainer).toBeInTheDocument();
      expect(summaryContainer?.textContent).toContain("Shimmer");
      expect(summaryContainer?.textContent).toContain("French");
      expect(summaryContainer?.textContent).toContain("80% sensitivity");
    });
  });

  describe("updating settings", () => {
    it("should update voice when selection changes", async () => {
      const user = userEvent.setup();
      render(<VoiceModeSettings isOpen={true} onClose={mockOnClose} />);

      const voiceSelect = screen.getByTestId("voice-select");
      await user.selectOptions(voiceSelect, "echo");

      expect(useVoiceSettingsStore.getState().voice).toBe("echo");
    });

    it("should update language when selection changes", async () => {
      const user = userEvent.setup();
      render(<VoiceModeSettings isOpen={true} onClose={mockOnClose} />);

      const languageSelect = screen.getByTestId("language-select");
      await user.selectOptions(languageSelect, "de");

      expect(useVoiceSettingsStore.getState().language).toBe("de");
    });

    it("should update VAD sensitivity when slider changes", () => {
      render(<VoiceModeSettings isOpen={true} onClose={mockOnClose} />);

      const slider = screen.getByTestId(
        "vad-sensitivity-slider",
      ) as HTMLInputElement;

      // Use fireEvent to simulate slider change
      fireEvent.change(slider, { target: { value: "85" } });

      // Verify store was updated
      expect(useVoiceSettingsStore.getState().vadSensitivity).toBe(85);
    });

    it("should toggle auto-start checkbox", async () => {
      const user = userEvent.setup();
      render(<VoiceModeSettings isOpen={true} onClose={mockOnClose} />);

      const checkbox = screen.getByTestId("auto-start-checkbox");
      expect(checkbox).not.toBeChecked();

      await user.click(checkbox);
      expect(useVoiceSettingsStore.getState().autoStartOnOpen).toBe(true);

      await user.click(checkbox);
      expect(useVoiceSettingsStore.getState().autoStartOnOpen).toBe(false);
    });

    it("should toggle show-hints checkbox", async () => {
      const user = userEvent.setup();
      render(<VoiceModeSettings isOpen={true} onClose={mockOnClose} />);

      const checkbox = screen.getByTestId("show-hints-checkbox");
      expect(checkbox).toBeChecked(); // Default is true

      await user.click(checkbox);
      expect(useVoiceSettingsStore.getState().showStatusHints).toBe(false);

      await user.click(checkbox);
      expect(useVoiceSettingsStore.getState().showStatusHints).toBe(true);
    });
  });

  describe("reset functionality", () => {
    it("should reset all settings to defaults when confirmed", async () => {
      const user = userEvent.setup();

      // Set non-default values
      useVoiceSettingsStore.setState({
        voice: "shimmer",
        language: "it",
        vadSensitivity: 90,
        autoStartOnOpen: true,
        showStatusHints: false,
      });

      // Mock window.confirm to return true
      vi.spyOn(window, "confirm").mockReturnValue(true);

      render(<VoiceModeSettings isOpen={true} onClose={mockOnClose} />);

      const resetButton = screen.getByTestId("reset-settings");
      await user.click(resetButton);

      expect(window.confirm).toHaveBeenCalledWith(
        "Reset all voice settings to defaults?",
      );

      // Verify reset to defaults
      const state = useVoiceSettingsStore.getState();
      expect(state.voice).toBe("alloy");
      expect(state.language).toBe("en");
      expect(state.vadSensitivity).toBe(50);
      expect(state.autoStartOnOpen).toBe(false);
      expect(state.showStatusHints).toBe(true);
    });

    it("should not reset settings when confirm is cancelled", async () => {
      const user = userEvent.setup();

      // Set non-default values
      useVoiceSettingsStore.setState({
        voice: "shimmer",
        language: "it",
        vadSensitivity: 90,
        autoStartOnOpen: true,
        showStatusHints: false,
      });

      // Mock window.confirm to return false
      vi.spyOn(window, "confirm").mockReturnValue(false);

      render(<VoiceModeSettings isOpen={true} onClose={mockOnClose} />);

      const resetButton = screen.getByTestId("reset-settings");
      await user.click(resetButton);

      // Verify settings unchanged
      const state = useVoiceSettingsStore.getState();
      expect(state.voice).toBe("shimmer");
      expect(state.language).toBe("it");
      expect(state.vadSensitivity).toBe(90);
    });
  });

  describe("closing behavior", () => {
    it("should call onClose when Done button is clicked", async () => {
      const user = userEvent.setup();
      render(<VoiceModeSettings isOpen={true} onClose={mockOnClose} />);

      const doneButton = screen.getByTestId("done-button");
      await user.click(doneButton);

      expect(mockOnClose).toHaveBeenCalledTimes(1);
    });

    it("should call onClose when close button is clicked", async () => {
      const user = userEvent.setup();
      render(<VoiceModeSettings isOpen={true} onClose={mockOnClose} />);

      const closeButton = screen.getByTestId("close-settings");
      await user.click(closeButton);

      expect(mockOnClose).toHaveBeenCalledTimes(1);
    });

    it("should call onClose when backdrop is clicked", async () => {
      const user = userEvent.setup();
      render(<VoiceModeSettings isOpen={true} onClose={mockOnClose} />);

      const backdrop = screen.getByTestId("voice-settings-modal");
      await user.click(backdrop);

      expect(mockOnClose).toHaveBeenCalledTimes(1);
    });

    it("should not close when clicking inside modal content", async () => {
      const user = userEvent.setup();
      render(<VoiceModeSettings isOpen={true} onClose={mockOnClose} />);

      // Click on the modal title (inside modal content)
      const title = screen.getByText("Voice Mode Settings");
      await user.click(title);

      expect(mockOnClose).not.toHaveBeenCalled();
    });
  });

  describe("accessibility", () => {
    it("should have proper labels for all form controls", () => {
      render(<VoiceModeSettings isOpen={true} onClose={mockOnClose} />);

      // Use more specific selectors to avoid multiple matches
      expect(
        screen.getByRole("combobox", { name: /^voice$/i }),
      ).toBeInTheDocument();
      expect(
        screen.getByRole("combobox", { name: /language/i }),
      ).toBeInTheDocument();
      expect(
        screen.getByRole("slider", { name: /voice detection sensitivity/i }),
      ).toBeInTheDocument();
      expect(
        screen.getByRole("checkbox", { name: /auto-start voice mode/i }),
      ).toBeInTheDocument();
      expect(
        screen.getByRole("checkbox", { name: /show status hints/i }),
      ).toBeInTheDocument();
    });

    it("should have close button with aria-label", () => {
      render(<VoiceModeSettings isOpen={true} onClose={mockOnClose} />);

      const closeButton = screen.getByLabelText(/close settings/i);
      expect(closeButton).toBeInTheDocument();
    });
  });

  describe("form controls", () => {
    it("should display all voice options", () => {
      render(<VoiceModeSettings isOpen={true} onClose={mockOnClose} />);

      const voiceSelect = screen.getByTestId("voice-select");
      const options = voiceSelect.querySelectorAll("option");

      expect(options).toHaveLength(6);
      expect(screen.getByRole("option", { name: "Alloy" })).toBeInTheDocument();
      expect(screen.getByRole("option", { name: "Echo" })).toBeInTheDocument();
      expect(screen.getByRole("option", { name: "Fable" })).toBeInTheDocument();
      expect(screen.getByRole("option", { name: "Onyx" })).toBeInTheDocument();
      expect(screen.getByRole("option", { name: "Nova" })).toBeInTheDocument();
      expect(
        screen.getByRole("option", { name: "Shimmer" }),
      ).toBeInTheDocument();
    });

    it("should display all language options", () => {
      render(<VoiceModeSettings isOpen={true} onClose={mockOnClose} />);

      const languageSelect = screen.getByTestId("language-select");
      const options = languageSelect.querySelectorAll("option");

      expect(options).toHaveLength(6);
      expect(
        screen.getByRole("option", { name: "English" }),
      ).toBeInTheDocument();
      expect(
        screen.getByRole("option", { name: "Spanish" }),
      ).toBeInTheDocument();
      expect(
        screen.getByRole("option", { name: "French" }),
      ).toBeInTheDocument();
      expect(
        screen.getByRole("option", { name: "German" }),
      ).toBeInTheDocument();
      expect(
        screen.getByRole("option", { name: "Italian" }),
      ).toBeInTheDocument();
      expect(
        screen.getByRole("option", { name: "Portuguese" }),
      ).toBeInTheDocument();
    });

    it("should have slider with correct range attributes", () => {
      render(<VoiceModeSettings isOpen={true} onClose={mockOnClose} />);

      const slider = screen.getByTestId("vad-sensitivity-slider");
      expect(slider).toHaveAttribute("min", "0");
      expect(slider).toHaveAttribute("max", "100");
    });
  });
});
