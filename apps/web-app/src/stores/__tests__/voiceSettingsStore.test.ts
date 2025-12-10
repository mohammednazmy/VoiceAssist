/**
 * Voice Settings Store Unit Tests
 * Tests for voice settings state management
 */

import { describe, it, expect, beforeEach } from "vitest";
import { useVoiceSettingsStore } from "../voiceSettingsStore";

describe("voiceSettingsStore", () => {
  beforeEach(() => {
    // Reset store before each test
    useVoiceSettingsStore.setState({
      voice: "alloy",
      language: "en",
      vadSensitivity: 50,
      autoStartOnOpen: false,
      showStatusHints: true,
    });
    // Clear localStorage
    localStorage.clear();
  });

  describe("initial state", () => {
    it("should have correct default values", () => {
      const state = useVoiceSettingsStore.getState();

      expect(state.voice).toBe("alloy");
      expect(state.language).toBe("en");
      expect(state.vadSensitivity).toBe(50);
      expect(state.autoStartOnOpen).toBe(false);
      expect(state.showStatusHints).toBe(true);
    });
  });

  describe("setVoice", () => {
    it("should update voice setting", () => {
      useVoiceSettingsStore.getState().setVoice("nova");
      expect(useVoiceSettingsStore.getState().voice).toBe("nova");
    });

    it("should accept all valid voice options", () => {
      const voices = [
        "alloy",
        "echo",
        "fable",
        "onyx",
        "nova",
        "shimmer",
      ] as const;

      voices.forEach((voice) => {
        useVoiceSettingsStore.getState().setVoice(voice);
        expect(useVoiceSettingsStore.getState().voice).toBe(voice);
      });
    });
  });

  describe("setLanguage", () => {
    it("should update language setting", () => {
      useVoiceSettingsStore.getState().setLanguage("es");
      expect(useVoiceSettingsStore.getState().language).toBe("es");
    });

    it("should accept all valid language options", () => {
      const languages = ["en", "es", "fr", "de", "it", "pt"] as const;

      languages.forEach((lang) => {
        useVoiceSettingsStore.getState().setLanguage(lang);
        expect(useVoiceSettingsStore.getState().language).toBe(lang);
      });
    });
  });

  describe("setVadSensitivity", () => {
    it("should update VAD sensitivity", () => {
      useVoiceSettingsStore.getState().setVadSensitivity(75);
      expect(useVoiceSettingsStore.getState().vadSensitivity).toBe(75);
    });

    it("should clamp value above 100 to 100", () => {
      useVoiceSettingsStore.getState().setVadSensitivity(200);
      expect(useVoiceSettingsStore.getState().vadSensitivity).toBe(100);
    });

    it("should clamp value below 0 to 0", () => {
      useVoiceSettingsStore.getState().setVadSensitivity(-10);
      expect(useVoiceSettingsStore.getState().vadSensitivity).toBe(0);
    });

    it("should allow boundary values", () => {
      useVoiceSettingsStore.getState().setVadSensitivity(0);
      expect(useVoiceSettingsStore.getState().vadSensitivity).toBe(0);

      useVoiceSettingsStore.getState().setVadSensitivity(100);
      expect(useVoiceSettingsStore.getState().vadSensitivity).toBe(100);
    });
  });

  describe("setAutoStartOnOpen", () => {
    it("should enable auto-start", () => {
      useVoiceSettingsStore.getState().setAutoStartOnOpen(true);
      expect(useVoiceSettingsStore.getState().autoStartOnOpen).toBe(true);
    });

    it("should disable auto-start", () => {
      // First enable
      useVoiceSettingsStore.getState().setAutoStartOnOpen(true);
      expect(useVoiceSettingsStore.getState().autoStartOnOpen).toBe(true);

      // Then disable
      useVoiceSettingsStore.getState().setAutoStartOnOpen(false);
      expect(useVoiceSettingsStore.getState().autoStartOnOpen).toBe(false);
    });
  });

  describe("setShowStatusHints", () => {
    it("should disable status hints", () => {
      useVoiceSettingsStore.getState().setShowStatusHints(false);
      expect(useVoiceSettingsStore.getState().showStatusHints).toBe(false);
    });

    it("should enable status hints", () => {
      // First disable
      useVoiceSettingsStore.getState().setShowStatusHints(false);
      expect(useVoiceSettingsStore.getState().showStatusHints).toBe(false);

      // Then enable
      useVoiceSettingsStore.getState().setShowStatusHints(true);
      expect(useVoiceSettingsStore.getState().showStatusHints).toBe(true);
    });
  });

  describe("reset", () => {
    it("should reset all settings to defaults", () => {
      // Modify all settings
      useVoiceSettingsStore.getState().setVoice("shimmer");
      useVoiceSettingsStore.getState().setLanguage("fr");
      useVoiceSettingsStore.getState().setVadSensitivity(80);
      useVoiceSettingsStore.getState().setAutoStartOnOpen(true);
      useVoiceSettingsStore.getState().setShowStatusHints(false);

      // Verify changes
      const modifiedState = useVoiceSettingsStore.getState();
      expect(modifiedState.voice).toBe("shimmer");
      expect(modifiedState.language).toBe("fr");
      expect(modifiedState.vadSensitivity).toBe(80);
      expect(modifiedState.autoStartOnOpen).toBe(true);
      expect(modifiedState.showStatusHints).toBe(false);

      // Reset
      useVoiceSettingsStore.getState().reset();

      // Verify defaults
      const resetState = useVoiceSettingsStore.getState();
      expect(resetState.voice).toBe("alloy");
      expect(resetState.language).toBe("en");
      expect(resetState.vadSensitivity).toBe(50);
      expect(resetState.autoStartOnOpen).toBe(false);
      expect(resetState.showStatusHints).toBe(true);
    });
  });

  describe("persistence", () => {
    it("should persist settings to localStorage", () => {
      useVoiceSettingsStore.getState().setVoice("nova");
      useVoiceSettingsStore.getState().setLanguage("de");
      useVoiceSettingsStore.getState().setVadSensitivity(75);

      // Check localStorage
      const stored = localStorage.getItem("voiceassist-voice-settings");
      expect(stored).toBeTruthy();

      const parsed = JSON.parse(stored!);
      expect(parsed.state.voice).toBe("nova");
      expect(parsed.state.language).toBe("de");
      expect(parsed.state.vadSensitivity).toBe(75);
    });

    it("should persist boolean settings", () => {
      useVoiceSettingsStore.getState().setAutoStartOnOpen(true);
      useVoiceSettingsStore.getState().setShowStatusHints(false);

      const stored = localStorage.getItem("voiceassist-voice-settings");
      expect(stored).toBeTruthy();

      const parsed = JSON.parse(stored!);
      expect(parsed.state.autoStartOnOpen).toBe(true);
      expect(parsed.state.showStatusHints).toBe(false);
    });

    it("should have correct storage key", () => {
      useVoiceSettingsStore.getState().setVoice("echo");

      const stored = localStorage.getItem("voiceassist-voice-settings");
      expect(stored).toBeTruthy();
    });
  });
});
