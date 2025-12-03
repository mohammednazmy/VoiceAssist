/**
 * Voice Settings Store Phase 7-10 Tests
 * Tests for Phase 7-10 voice settings (multilingual, calibration, offline, conversation intelligence)
 */

import { describe, it, expect, beforeEach } from "vitest";
import { useVoiceSettingsStore } from "../voiceSettingsStore";

describe("voiceSettingsStore Phase 7-10", () => {
  beforeEach(() => {
    // Reset store to defaults before each test
    useVoiceSettingsStore.getState().reset();
    localStorage.clear();
  });

  // ============================================================================
  // Phase 7: Multilingual Settings
  // ============================================================================

  describe("Phase 7: Multilingual Settings", () => {
    describe("accentProfileId", () => {
      it("should have null as default", () => {
        const state = useVoiceSettingsStore.getState();
        expect(state.accentProfileId).toBeNull();
      });

      it("should set accent profile ID", () => {
        useVoiceSettingsStore.getState().setAccentProfileId("en-us-midwest");
        expect(useVoiceSettingsStore.getState().accentProfileId).toBe(
          "en-us-midwest",
        );
      });

      it("should clear accent profile ID by setting null", () => {
        useVoiceSettingsStore.getState().setAccentProfileId("en-gb-london");
        useVoiceSettingsStore.getState().setAccentProfileId(null);
        expect(useVoiceSettingsStore.getState().accentProfileId).toBeNull();
      });
    });

    describe("autoLanguageDetection", () => {
      it("should be enabled by default", () => {
        const state = useVoiceSettingsStore.getState();
        expect(state.autoLanguageDetection).toBe(true);
      });

      it("should toggle auto language detection", () => {
        useVoiceSettingsStore.getState().setAutoLanguageDetection(false);
        expect(useVoiceSettingsStore.getState().autoLanguageDetection).toBe(
          false,
        );

        useVoiceSettingsStore.getState().setAutoLanguageDetection(true);
        expect(useVoiceSettingsStore.getState().autoLanguageDetection).toBe(
          true,
        );
      });
    });

    describe("languageSwitchConfidence", () => {
      it("should have 0.75 as default", () => {
        const state = useVoiceSettingsStore.getState();
        expect(state.languageSwitchConfidence).toBe(0.75);
      });

      it("should update language switch confidence", () => {
        useVoiceSettingsStore.getState().setLanguageSwitchConfidence(0.9);
        expect(useVoiceSettingsStore.getState().languageSwitchConfidence).toBe(
          0.9,
        );
      });

      it("should accept boundary values", () => {
        useVoiceSettingsStore.getState().setLanguageSwitchConfidence(0);
        expect(useVoiceSettingsStore.getState().languageSwitchConfidence).toBe(
          0,
        );

        useVoiceSettingsStore.getState().setLanguageSwitchConfidence(1);
        expect(useVoiceSettingsStore.getState().languageSwitchConfidence).toBe(
          1,
        );
      });
    });
  });

  // ============================================================================
  // Phase 8: Calibration Settings
  // ============================================================================

  describe("Phase 8: Calibration Settings", () => {
    describe("vadCalibrated", () => {
      it("should be false by default", () => {
        const state = useVoiceSettingsStore.getState();
        expect(state.vadCalibrated).toBe(false);
      });

      it("should set calibration status", () => {
        useVoiceSettingsStore.getState().setVadCalibrated(true);
        expect(useVoiceSettingsStore.getState().vadCalibrated).toBe(true);
      });
    });

    describe("lastCalibrationDate", () => {
      it("should be null by default", () => {
        const state = useVoiceSettingsStore.getState();
        expect(state.lastCalibrationDate).toBeNull();
      });

      it("should set calibration date", () => {
        const timestamp = Date.now();
        useVoiceSettingsStore.getState().setLastCalibrationDate(timestamp);
        expect(useVoiceSettingsStore.getState().lastCalibrationDate).toBe(
          timestamp,
        );
      });

      it("should clear calibration date", () => {
        useVoiceSettingsStore.getState().setLastCalibrationDate(Date.now());
        useVoiceSettingsStore.getState().setLastCalibrationDate(null);
        expect(useVoiceSettingsStore.getState().lastCalibrationDate).toBeNull();
      });
    });

    describe("personalizedVadThreshold", () => {
      it("should be null by default", () => {
        const state = useVoiceSettingsStore.getState();
        expect(state.personalizedVadThreshold).toBeNull();
      });

      it("should set personalized VAD threshold", () => {
        useVoiceSettingsStore.getState().setPersonalizedVadThreshold(0.65);
        expect(useVoiceSettingsStore.getState().personalizedVadThreshold).toBe(
          0.65,
        );
      });
    });

    describe("enableBehaviorLearning", () => {
      it("should be enabled by default", () => {
        const state = useVoiceSettingsStore.getState();
        expect(state.enableBehaviorLearning).toBe(true);
      });

      it("should toggle behavior learning", () => {
        useVoiceSettingsStore.getState().setEnableBehaviorLearning(false);
        expect(useVoiceSettingsStore.getState().enableBehaviorLearning).toBe(
          false,
        );
      });
    });
  });

  // ============================================================================
  // Phase 9: Offline Mode Settings
  // ============================================================================

  describe("Phase 9: Offline Mode Settings", () => {
    describe("enableOfflineFallback", () => {
      it("should be enabled by default", () => {
        const state = useVoiceSettingsStore.getState();
        expect(state.enableOfflineFallback).toBe(true);
      });

      it("should toggle offline fallback", () => {
        useVoiceSettingsStore.getState().setEnableOfflineFallback(false);
        expect(useVoiceSettingsStore.getState().enableOfflineFallback).toBe(
          false,
        );
      });
    });

    describe("preferOfflineVAD", () => {
      it("should be disabled by default", () => {
        const state = useVoiceSettingsStore.getState();
        expect(state.preferOfflineVAD).toBe(false);
      });

      it("should toggle prefer offline VAD", () => {
        useVoiceSettingsStore.getState().setPreferOfflineVAD(true);
        expect(useVoiceSettingsStore.getState().preferOfflineVAD).toBe(true);
      });
    });

    describe("ttsCacheEnabled", () => {
      it("should be enabled by default", () => {
        const state = useVoiceSettingsStore.getState();
        expect(state.ttsCacheEnabled).toBe(true);
      });

      it("should toggle TTS cache", () => {
        useVoiceSettingsStore.getState().setTtsCacheEnabled(false);
        expect(useVoiceSettingsStore.getState().ttsCacheEnabled).toBe(false);
      });
    });
  });

  // ============================================================================
  // Phase 10: Conversation Intelligence Settings
  // ============================================================================

  describe("Phase 10: Conversation Intelligence Settings", () => {
    describe("enableSentimentTracking", () => {
      it("should be enabled by default", () => {
        const state = useVoiceSettingsStore.getState();
        expect(state.enableSentimentTracking).toBe(true);
      });

      it("should toggle sentiment tracking", () => {
        useVoiceSettingsStore.getState().setEnableSentimentTracking(false);
        expect(useVoiceSettingsStore.getState().enableSentimentTracking).toBe(
          false,
        );
      });
    });

    describe("enableDiscourseAnalysis", () => {
      it("should be enabled by default", () => {
        const state = useVoiceSettingsStore.getState();
        expect(state.enableDiscourseAnalysis).toBe(true);
      });

      it("should toggle discourse analysis", () => {
        useVoiceSettingsStore.getState().setEnableDiscourseAnalysis(false);
        expect(useVoiceSettingsStore.getState().enableDiscourseAnalysis).toBe(
          false,
        );
      });
    });

    describe("enableResponseRecommendations", () => {
      it("should be enabled by default", () => {
        const state = useVoiceSettingsStore.getState();
        expect(state.enableResponseRecommendations).toBe(true);
      });

      it("should toggle response recommendations", () => {
        useVoiceSettingsStore
          .getState()
          .setEnableResponseRecommendations(false);
        expect(
          useVoiceSettingsStore.getState().enableResponseRecommendations,
        ).toBe(false);
      });
    });

    describe("showSuggestedFollowUps", () => {
      it("should be enabled by default", () => {
        const state = useVoiceSettingsStore.getState();
        expect(state.showSuggestedFollowUps).toBe(true);
      });

      it("should toggle suggested follow-ups", () => {
        useVoiceSettingsStore.getState().setShowSuggestedFollowUps(false);
        expect(useVoiceSettingsStore.getState().showSuggestedFollowUps).toBe(
          false,
        );
      });
    });
  });

  // ============================================================================
  // Privacy Settings
  // ============================================================================

  describe("Privacy Settings", () => {
    describe("storeTranscriptHistory", () => {
      it("should be enabled by default", () => {
        const state = useVoiceSettingsStore.getState();
        expect(state.storeTranscriptHistory).toBe(true);
      });

      it("should toggle transcript history", () => {
        useVoiceSettingsStore.getState().setStoreTranscriptHistory(false);
        expect(useVoiceSettingsStore.getState().storeTranscriptHistory).toBe(
          false,
        );
      });
    });

    describe("shareAnonymousAnalytics", () => {
      it("should be disabled by default", () => {
        const state = useVoiceSettingsStore.getState();
        expect(state.shareAnonymousAnalytics).toBe(false);
      });

      it("should toggle anonymous analytics", () => {
        useVoiceSettingsStore.getState().setShareAnonymousAnalytics(true);
        expect(useVoiceSettingsStore.getState().shareAnonymousAnalytics).toBe(
          true,
        );
      });
    });
  });

  // ============================================================================
  // Persistence
  // ============================================================================

  describe("Phase 7-10 Persistence", () => {
    it("should persist Phase 7 settings", () => {
      useVoiceSettingsStore.getState().setAutoLanguageDetection(false);
      useVoiceSettingsStore.getState().setLanguageSwitchConfidence(0.85);

      const stored = localStorage.getItem("voiceassist-voice-settings");
      expect(stored).toBeTruthy();

      const parsed = JSON.parse(stored!);
      expect(parsed.state.autoLanguageDetection).toBe(false);
      expect(parsed.state.languageSwitchConfidence).toBe(0.85);
    });

    it("should persist Phase 8 settings", () => {
      useVoiceSettingsStore.getState().setVadCalibrated(true);
      useVoiceSettingsStore.getState().setEnableBehaviorLearning(false);

      const stored = localStorage.getItem("voiceassist-voice-settings");
      expect(stored).toBeTruthy();

      const parsed = JSON.parse(stored!);
      expect(parsed.state.vadCalibrated).toBe(true);
      expect(parsed.state.enableBehaviorLearning).toBe(false);
    });

    it("should persist Phase 9 settings", () => {
      useVoiceSettingsStore.getState().setEnableOfflineFallback(false);
      useVoiceSettingsStore.getState().setTtsCacheEnabled(false);

      const stored = localStorage.getItem("voiceassist-voice-settings");
      expect(stored).toBeTruthy();

      const parsed = JSON.parse(stored!);
      expect(parsed.state.enableOfflineFallback).toBe(false);
      expect(parsed.state.ttsCacheEnabled).toBe(false);
    });

    it("should persist Phase 10 settings", () => {
      useVoiceSettingsStore.getState().setEnableSentimentTracking(false);
      useVoiceSettingsStore.getState().setShowSuggestedFollowUps(false);

      const stored = localStorage.getItem("voiceassist-voice-settings");
      expect(stored).toBeTruthy();

      const parsed = JSON.parse(stored!);
      expect(parsed.state.enableSentimentTracking).toBe(false);
      expect(parsed.state.showSuggestedFollowUps).toBe(false);
    });

    it("should persist privacy settings", () => {
      useVoiceSettingsStore.getState().setStoreTranscriptHistory(false);
      useVoiceSettingsStore.getState().setShareAnonymousAnalytics(true);

      const stored = localStorage.getItem("voiceassist-voice-settings");
      expect(stored).toBeTruthy();

      const parsed = JSON.parse(stored!);
      expect(parsed.state.storeTranscriptHistory).toBe(false);
      expect(parsed.state.shareAnonymousAnalytics).toBe(true);
    });
  });

  // ============================================================================
  // Reset
  // ============================================================================

  describe("Reset Phase 7-10 Settings", () => {
    it("should reset all Phase 7-10 settings to defaults", () => {
      // Modify all Phase 7-10 settings
      useVoiceSettingsStore.getState().setAutoLanguageDetection(false);
      useVoiceSettingsStore.getState().setLanguageSwitchConfidence(0.5);
      useVoiceSettingsStore.getState().setVadCalibrated(true);
      useVoiceSettingsStore.getState().setLastCalibrationDate(123456789);
      useVoiceSettingsStore.getState().setEnableOfflineFallback(false);
      useVoiceSettingsStore.getState().setPreferOfflineVAD(true);
      useVoiceSettingsStore.getState().setEnableSentimentTracking(false);
      useVoiceSettingsStore.getState().setShowSuggestedFollowUps(false);
      useVoiceSettingsStore.getState().setStoreTranscriptHistory(false);
      useVoiceSettingsStore.getState().setShareAnonymousAnalytics(true);

      // Reset
      useVoiceSettingsStore.getState().reset();

      // Verify defaults
      const state = useVoiceSettingsStore.getState();
      expect(state.autoLanguageDetection).toBe(true);
      expect(state.languageSwitchConfidence).toBe(0.75);
      expect(state.vadCalibrated).toBe(false);
      expect(state.lastCalibrationDate).toBeNull();
      expect(state.enableOfflineFallback).toBe(true);
      expect(state.preferOfflineVAD).toBe(false);
      expect(state.enableSentimentTracking).toBe(true);
      expect(state.showSuggestedFollowUps).toBe(true);
      expect(state.storeTranscriptHistory).toBe(true);
      expect(state.shareAnonymousAnalytics).toBe(false);
    });
  });
});
