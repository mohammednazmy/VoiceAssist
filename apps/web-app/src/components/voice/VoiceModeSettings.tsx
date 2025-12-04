/**
 * Voice Mode Settings Modal
 * Allows users to configure voice settings including voice selection,
 * language, VAD sensitivity, and behavior preferences.
 *
 * Phase 9.3: Added audio device, playback speed, keyboard shortcuts
 * Phase 7-10: Added multilingual, calibration, offline, conversation intelligence settings
 */

import { useCallback, useState, useMemo } from "react";
import {
  useVoiceSettingsStore,
  LANGUAGE_OPTIONS,
  PLAYBACK_SPEED_OPTIONS,
  ELEVENLABS_VOICE_OPTIONS,
  QUALITY_PRESET_OPTIONS,
  type LanguageOption,
  type QualityPreset,
} from "../../stores/voiceSettingsStore";
import { AudioDeviceSelector } from "./AudioDeviceSelector";
import { PlaybackSpeedControl } from "./PlaybackSpeedControl";
import { CalibrationDialog } from "./CalibrationDialog";

export interface VoiceModeSettingsProps {
  isOpen: boolean;
  onClose: () => void;
}

export function VoiceModeSettings({ isOpen, onClose }: VoiceModeSettingsProps) {
  // Calibration dialog state
  const [showCalibration, setShowCalibration] = useState(false);

  const {
    language,
    vadSensitivity,
    autoStartOnOpen,
    showStatusHints,
    // Phase 9.3 additions
    selectedAudioDeviceId,
    playbackSpeed,
    keyboardShortcutsEnabled,
    showFrequencySpectrum,
    // ElevenLabs voice
    elevenlabsVoiceId,
    // Quality preset (Phase: Talker Enhancement)
    qualityPreset,

    // Phase 7: Multilingual settings
    autoLanguageDetection,
    languageSwitchConfidence,

    // Phase 8: Calibration settings
    vadCalibrated,
    lastCalibrationDate,
    personalizedVadThreshold,
    enableBehaviorLearning,

    // Phase 9: Offline mode settings
    enableOfflineFallback,
    preferOfflineVAD,
    ttsCacheEnabled,

    // Phase 10: Conversation management settings
    enableSentimentTracking,
    enableDiscourseAnalysis,
    enableResponseRecommendations,
    showSuggestedFollowUps,

    // Privacy settings
    storeTranscriptHistory,
    shareAnonymousAnalytics,

    // Actions
    setLanguage,
    setVadSensitivity,
    setAutoStartOnOpen,
    setShowStatusHints,
    // Phase 9.3 additions
    setSelectedAudioDeviceId,
    setPlaybackSpeed,
    setKeyboardShortcutsEnabled,
    setShowFrequencySpectrum,
    setElevenlabsVoiceId,
    // Quality preset action
    setQualityPreset,

    // Phase 7: Multilingual actions
    setAutoLanguageDetection,
    setLanguageSwitchConfidence,

    // Phase 8: Calibration actions
    setEnableBehaviorLearning,

    // Phase 9: Offline mode actions
    setEnableOfflineFallback,
    setPreferOfflineVAD,
    setTtsCacheEnabled,

    // Phase 10: Conversation management actions
    setEnableSentimentTracking,
    setEnableDiscourseAnalysis,
    setEnableResponseRecommendations,
    setShowSuggestedFollowUps,

    // Privacy actions
    setStoreTranscriptHistory,
    setShareAnonymousAnalytics,

    reset,
  } = useVoiceSettingsStore();

  // Format calibration date
  const calibrationDateFormatted = useMemo(() => {
    if (!lastCalibrationDate) return null;
    return new Date(lastCalibrationDate).toLocaleDateString(undefined, {
      month: "short",
      day: "numeric",
      year: "numeric",
    });
  }, [lastCalibrationDate]);

  const handleReset = useCallback(() => {
    if (window.confirm("Reset all voice settings to defaults?")) {
      reset();
    }
  }, [reset]);

  const handleLanguageChange = useCallback(
    (e: React.ChangeEvent<HTMLSelectElement>) => {
      setLanguage(e.target.value as LanguageOption);
    },
    [setLanguage],
  );

  const handleSensitivityChange = useCallback(
    (e: React.ChangeEvent<HTMLInputElement>) => {
      setVadSensitivity(parseInt(e.target.value, 10));
    },
    [setVadSensitivity],
  );

  const handleElevenlabsVoiceChange = useCallback(
    (e: React.ChangeEvent<HTMLSelectElement>) => {
      setElevenlabsVoiceId(e.target.value);
    },
    [setElevenlabsVoiceId],
  );

  const handleQualityPresetChange = useCallback(
    (preset: QualityPreset) => {
      setQualityPreset(preset);
    },
    [setQualityPreset],
  );

  const handleLanguageConfidenceChange = useCallback(
    (e: React.ChangeEvent<HTMLInputElement>) => {
      setLanguageSwitchConfidence(parseFloat(e.target.value));
    },
    [setLanguageSwitchConfidence],
  );

  console.log("[VoiceModeSettings] Rendering with isOpen:", isOpen);

  if (!isOpen) {
    return null;
  }

  console.log("[VoiceModeSettings] Modal is open, rendering content");

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/50"
      onClick={onClose}
      role="dialog"
      aria-modal="true"
      aria-labelledby="voice-settings-title"
      data-testid="voice-settings-modal"
    >
      <div
        className="bg-white rounded-lg shadow-xl max-w-md w-full mx-4 p-6 max-h-[90vh] overflow-y-auto"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="flex items-center justify-between mb-6">
          <h2
            id="voice-settings-title"
            className="text-lg font-semibold text-neutral-900"
          >
            Voice Mode Settings
          </h2>
          <button
            type="button"
            onClick={onClose}
            className="text-neutral-400 hover:text-neutral-600 transition-colors"
            aria-label="Close settings"
            data-testid="close-settings"
          >
            <svg
              xmlns="http://www.w3.org/2000/svg"
              fill="none"
              viewBox="0 0 24 24"
              strokeWidth={2}
              stroke="currentColor"
              className="w-6 h-6"
            >
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                d="M6 18L18 6M6 6l12 12"
              />
            </svg>
          </button>
        </div>

        {/* Settings Form */}
        <div className="space-y-5">
          {/* Voice Selection (ElevenLabs) */}
          <div>
            <label
              htmlFor="elevenlabs-voice-select"
              className="block text-sm font-medium text-neutral-700 mb-1"
            >
              Voice
            </label>
            <select
              id="elevenlabs-voice-select"
              value={elevenlabsVoiceId || "TxGEqnHWrfWFTfGW9XjX"}
              onChange={handleElevenlabsVoiceChange}
              className="w-full rounded-md border border-neutral-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary-500 focus:border-transparent"
              data-testid="voice-select"
            >
              <optgroup label="Premium Voices">
                {ELEVENLABS_VOICE_OPTIONS.filter((v) => v.premium).map(
                  (voice) => (
                    <option key={voice.id} value={voice.id}>
                      {voice.name} ({voice.gender})
                    </option>
                  ),
                )}
              </optgroup>
              <optgroup label="Standard Voices">
                {ELEVENLABS_VOICE_OPTIONS.filter((v) => !v.premium).map(
                  (voice) => (
                    <option key={voice.id} value={voice.id}>
                      {voice.name} ({voice.gender})
                    </option>
                  ),
                )}
              </optgroup>
            </select>
            <p className="text-xs text-neutral-500 mt-1">
              Select the voice for AI spoken responses
            </p>
          </div>

          {/* Voice Quality Preset */}
          <div>
            <label className="block text-sm font-medium text-neutral-700 mb-2">
              Voice Quality
            </label>
            <div className="flex gap-2">
              {QUALITY_PRESET_OPTIONS.map((option) => (
                <button
                  key={option.value}
                  type="button"
                  onClick={() => handleQualityPresetChange(option.value)}
                  className={`flex-1 px-3 py-2 text-sm font-medium rounded-md border transition-colors ${
                    qualityPreset === option.value
                      ? "bg-primary-50 border-primary-500 text-primary-700"
                      : "bg-white border-neutral-300 text-neutral-700 hover:bg-neutral-50"
                  }`}
                  data-testid={`quality-preset-${option.value}`}
                  title={option.description}
                >
                  {option.label}
                </button>
              ))}
            </div>
            <p className="text-xs text-neutral-500 mt-1">
              {QUALITY_PRESET_OPTIONS.find((o) => o.value === qualityPreset)
                ?.description || "Adjust speed vs naturalness trade-off"}
            </p>
          </div>

          {/* Language Selection */}
          <div>
            <label
              htmlFor="language-select"
              className="block text-sm font-medium text-neutral-700 mb-1"
            >
              Language
            </label>
            <select
              id="language-select"
              value={language}
              onChange={handleLanguageChange}
              className="w-full rounded-md border border-neutral-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary-500 focus:border-transparent"
              data-testid="language-select"
            >
              {LANGUAGE_OPTIONS.map((opt) => (
                <option key={opt.value} value={opt.value}>
                  {opt.label}
                </option>
              ))}
            </select>
          </div>

          {/* VAD Sensitivity Slider */}
          <div>
            <label
              htmlFor="vad-sensitivity"
              className="block text-sm font-medium text-neutral-700 mb-1"
            >
              Voice Detection Sensitivity: {vadSensitivity}%
            </label>
            <input
              type="range"
              id="vad-sensitivity"
              min="0"
              max="100"
              value={vadSensitivity}
              onChange={handleSensitivityChange}
              className="w-full h-2 bg-neutral-200 rounded-lg appearance-none cursor-pointer accent-primary-500"
              data-testid="vad-sensitivity-slider"
            />
            <div className="flex justify-between text-xs text-neutral-500 mt-1">
              <span>Less sensitive</span>
              <span>More sensitive</span>
            </div>
          </div>

          {/* Auto-Start Toggle */}
          <div className="flex items-center justify-between">
            <div>
              <label
                htmlFor="auto-start"
                className="text-sm font-medium text-neutral-700"
              >
                Auto-start voice mode
              </label>
              <p className="text-xs text-neutral-500">
                Automatically start voice mode when opening chat
              </p>
            </div>
            <input
              type="checkbox"
              id="auto-start"
              checked={autoStartOnOpen}
              onChange={(e) => setAutoStartOnOpen(e.target.checked)}
              className="w-5 h-5 rounded border-neutral-300 text-primary-500 focus:ring-primary-500"
              data-testid="auto-start-checkbox"
            />
          </div>

          {/* Show Status Hints Toggle */}
          <div className="flex items-center justify-between">
            <div>
              <label
                htmlFor="show-hints"
                className="text-sm font-medium text-neutral-700"
              >
                Show status hints
              </label>
              <p className="text-xs text-neutral-500">
                Display helpful tips during voice conversations
              </p>
            </div>
            <input
              type="checkbox"
              id="show-hints"
              checked={showStatusHints}
              onChange={(e) => setShowStatusHints(e.target.checked)}
              className="w-5 h-5 rounded border-neutral-300 text-primary-500 focus:ring-primary-500"
              data-testid="show-hints-checkbox"
            />
          </div>

          {/* Section Divider */}
          <div className="border-t border-neutral-200 pt-5">
            <h3 className="text-sm font-semibold text-neutral-800 mb-4">
              Advanced Settings
            </h3>
          </div>

          {/* Audio Device Selection */}
          <AudioDeviceSelector
            selectedDeviceId={selectedAudioDeviceId || undefined}
            onDeviceSelect={setSelectedAudioDeviceId}
          />

          {/* Playback Speed Control */}
          <div>
            <label className="block text-sm font-medium text-neutral-700 mb-2">
              AI Response Playback Speed
            </label>
            <PlaybackSpeedControl
              speed={playbackSpeed}
              onSpeedChange={setPlaybackSpeed}
              variant="buttons"
            />
            <p className="text-xs text-neutral-500 mt-1">
              Adjust how fast AI audio responses play
            </p>
          </div>

          {/* Keyboard Shortcuts Toggle */}
          <div className="flex items-center justify-between">
            <div>
              <label
                htmlFor="keyboard-shortcuts"
                className="text-sm font-medium text-neutral-700"
              >
                Keyboard shortcuts
              </label>
              <p className="text-xs text-neutral-500">
                Use Space to toggle recording, Esc to cancel
              </p>
            </div>
            <input
              type="checkbox"
              id="keyboard-shortcuts"
              checked={keyboardShortcutsEnabled}
              onChange={(e) => setKeyboardShortcutsEnabled(e.target.checked)}
              className="w-5 h-5 rounded border-neutral-300 text-primary-500 focus:ring-primary-500"
              data-testid="keyboard-shortcuts-checkbox"
            />
          </div>

          {/* Frequency Spectrum Toggle */}
          <div className="flex items-center justify-between">
            <div>
              <label
                htmlFor="show-spectrum"
                className="text-sm font-medium text-neutral-700"
              >
                Show frequency spectrum
              </label>
              <p className="text-xs text-neutral-500">
                Display detailed audio frequency visualization
              </p>
            </div>
            <input
              type="checkbox"
              id="show-spectrum"
              checked={showFrequencySpectrum}
              onChange={(e) => setShowFrequencySpectrum(e.target.checked)}
              className="w-5 h-5 rounded border-neutral-300 text-primary-500 focus:ring-primary-500"
              data-testid="show-spectrum-checkbox"
            />
          </div>

          {/* ================================================================
              Phase 7: Language & Detection Settings
              ================================================================ */}
          <div className="border-t border-neutral-200 pt-5">
            <h3 className="text-sm font-semibold text-neutral-800 mb-4 flex items-center gap-2">
              <svg
                xmlns="http://www.w3.org/2000/svg"
                fill="none"
                viewBox="0 0 24 24"
                strokeWidth={1.5}
                stroke="currentColor"
                className="w-4 h-4 text-blue-500"
              >
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  d="M10.5 21l5.25-11.25L21 21m-9-3h7.5M3 5.621a48.474 48.474 0 016-.371m0 0c1.12 0 2.233.038 3.334.114M9 5.25V3m3.334 2.364C11.176 10.658 7.69 15.08 3 17.502m9.334-12.138c.896.061 1.785.147 2.666.257m-4.589 8.495a18.023 18.023 0 01-3.827-5.802"
                />
              </svg>
              Language & Detection
            </h3>
          </div>

          {/* Auto Language Detection */}
          <div className="flex items-center justify-between">
            <div>
              <label
                htmlFor="auto-language-detection"
                className="text-sm font-medium text-neutral-700"
              >
                Auto-detect language
              </label>
              <p className="text-xs text-neutral-500">
                Automatically detect which language you're speaking
              </p>
            </div>
            <input
              type="checkbox"
              id="auto-language-detection"
              checked={autoLanguageDetection}
              onChange={(e) => setAutoLanguageDetection(e.target.checked)}
              className="w-5 h-5 rounded border-neutral-300 text-primary-500 focus:ring-primary-500"
              data-testid="auto-language-detection-checkbox"
            />
          </div>

          {/* Language Switch Confidence */}
          {autoLanguageDetection && (
            <div>
              <label
                htmlFor="language-confidence"
                className="block text-sm font-medium text-neutral-700 mb-1"
              >
                Detection confidence:{" "}
                {Math.round(languageSwitchConfidence * 100)}%
              </label>
              <input
                type="range"
                id="language-confidence"
                min="0.5"
                max="1"
                step="0.05"
                value={languageSwitchConfidence}
                onChange={handleLanguageConfidenceChange}
                className="w-full h-2 bg-neutral-200 rounded-lg appearance-none cursor-pointer accent-primary-500"
                data-testid="language-confidence-slider"
              />
              <div className="flex justify-between text-xs text-neutral-500 mt-1">
                <span>More flexible</span>
                <span>More strict</span>
              </div>
            </div>
          )}

          {/* ================================================================
              Phase 8: Calibration Settings
              ================================================================ */}
          <div className="border-t border-neutral-200 pt-5">
            <h3 className="text-sm font-semibold text-neutral-800 mb-4 flex items-center gap-2">
              <svg
                xmlns="http://www.w3.org/2000/svg"
                fill="none"
                viewBox="0 0 24 24"
                strokeWidth={1.5}
                stroke="currentColor"
                className="w-4 h-4 text-purple-500"
              >
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  d="M9.594 3.94c.09-.542.56-.94 1.11-.94h2.593c.55 0 1.02.398 1.11.94l.213 1.281c.063.374.313.686.645.87.074.04.147.083.22.127.324.196.72.257 1.075.124l1.217-.456a1.125 1.125 0 011.37.49l1.296 2.247a1.125 1.125 0 01-.26 1.431l-1.003.827c-.293.24-.438.613-.431.992a6.759 6.759 0 010 .255c-.007.378.138.75.43.99l1.005.828c.424.35.534.954.26 1.43l-1.298 2.247a1.125 1.125 0 01-1.369.491l-1.217-.456c-.355-.133-.75-.072-1.076.124a6.57 6.57 0 01-.22.128c-.331.183-.581.495-.644.869l-.213 1.28c-.09.543-.56.941-1.11.941h-2.594c-.55 0-1.02-.398-1.11-.94l-.213-1.281c-.062-.374-.312-.686-.644-.87a6.52 6.52 0 01-.22-.127c-.325-.196-.72-.257-1.076-.124l-1.217.456a1.125 1.125 0 01-1.369-.49l-1.297-2.247a1.125 1.125 0 01.26-1.431l1.004-.827c.292-.24.437-.613.43-.992a6.932 6.932 0 010-.255c.007-.378-.138-.75-.43-.99l-1.004-.828a1.125 1.125 0 01-.26-1.43l1.297-2.247a1.125 1.125 0 011.37-.491l1.216.456c.356.133.751.072 1.076-.124.072-.044.146-.087.22-.128.332-.183.582-.495.644-.869l.214-1.281z"
                />
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  d="M15 12a3 3 0 11-6 0 3 3 0 016 0z"
                />
              </svg>
              Voice Calibration
            </h3>
          </div>

          {/* Calibration Status */}
          <div className="p-4 bg-neutral-50 rounded-lg border border-neutral-200">
            <div className="flex items-start justify-between">
              <div className="flex items-start gap-3">
                <div
                  className={`w-10 h-10 rounded-full flex items-center justify-center ${
                    vadCalibrated
                      ? "bg-green-100 text-green-600"
                      : "bg-amber-100 text-amber-600"
                  }`}
                >
                  {vadCalibrated ? (
                    <svg
                      xmlns="http://www.w3.org/2000/svg"
                      fill="none"
                      viewBox="0 0 24 24"
                      strokeWidth={2}
                      stroke="currentColor"
                      className="w-5 h-5"
                    >
                      <path
                        strokeLinecap="round"
                        strokeLinejoin="round"
                        d="M9 12.75L11.25 15 15 9.75M21 12a9 9 0 11-18 0 9 9 0 0118 0z"
                      />
                    </svg>
                  ) : (
                    <svg
                      xmlns="http://www.w3.org/2000/svg"
                      fill="none"
                      viewBox="0 0 24 24"
                      strokeWidth={2}
                      stroke="currentColor"
                      className="w-5 h-5"
                    >
                      <path
                        strokeLinecap="round"
                        strokeLinejoin="round"
                        d="M12 9v3.75m9-.75a9 9 0 11-18 0 9 9 0 0118 0zm-9 3.75h.008v.008H12v-.008z"
                      />
                    </svg>
                  )}
                </div>
                <div>
                  <p className="font-medium text-neutral-800">
                    {vadCalibrated ? "Calibrated" : "Not Calibrated"}
                  </p>
                  <p className="text-xs text-neutral-500 mt-0.5">
                    {vadCalibrated
                      ? `Last calibrated: ${calibrationDateFormatted}`
                      : "Calibrate for personalized voice detection"}
                  </p>
                  {vadCalibrated && personalizedVadThreshold !== null && (
                    <p className="text-xs text-neutral-500">
                      Personalized threshold:{" "}
                      {Math.round(personalizedVadThreshold * 100)}%
                    </p>
                  )}
                </div>
              </div>
              <button
                type="button"
                onClick={() => setShowCalibration(true)}
                className={`px-3 py-1.5 text-sm font-medium rounded-md transition-colors ${
                  vadCalibrated
                    ? "text-neutral-600 hover:text-neutral-800 bg-white border border-neutral-300 hover:bg-neutral-50"
                    : "text-white bg-primary-500 hover:bg-primary-600"
                }`}
                data-testid="calibrate-button"
              >
                {vadCalibrated ? "Recalibrate" : "Calibrate"}
              </button>
            </div>
          </div>

          {/* Enable Behavior Learning */}
          <div className="flex items-center justify-between">
            <div>
              <label
                htmlFor="behavior-learning"
                className="text-sm font-medium text-neutral-700"
              >
                Adaptive learning
              </label>
              <p className="text-xs text-neutral-500">
                Learn from your speech patterns to improve detection over time
              </p>
            </div>
            <input
              type="checkbox"
              id="behavior-learning"
              checked={enableBehaviorLearning}
              onChange={(e) => setEnableBehaviorLearning(e.target.checked)}
              className="w-5 h-5 rounded border-neutral-300 text-primary-500 focus:ring-primary-500"
              data-testid="behavior-learning-checkbox"
            />
          </div>

          {/* ================================================================
              Phase 9: Offline Mode Settings
              ================================================================ */}
          <div className="border-t border-neutral-200 pt-5">
            <h3 className="text-sm font-semibold text-neutral-800 mb-4 flex items-center gap-2">
              <svg
                xmlns="http://www.w3.org/2000/svg"
                fill="none"
                viewBox="0 0 24 24"
                strokeWidth={1.5}
                stroke="currentColor"
                className="w-4 h-4 text-teal-500"
              >
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  d="M8.288 15.038a5.25 5.25 0 017.424 0M5.106 11.856c3.807-3.808 9.98-3.808 13.788 0M1.924 8.674c5.565-5.565 14.587-5.565 20.152 0M12.53 18.22l-.53.53-.53-.53a.75.75 0 011.06 0z"
                />
              </svg>
              Offline & Connectivity
            </h3>
          </div>

          {/* Enable Offline Fallback */}
          <div className="flex items-center justify-between">
            <div>
              <label
                htmlFor="offline-fallback"
                className="text-sm font-medium text-neutral-700"
              >
                Offline voice fallback
              </label>
              <p className="text-xs text-neutral-500">
                Use local voice detection when network is unavailable
              </p>
            </div>
            <input
              type="checkbox"
              id="offline-fallback"
              checked={enableOfflineFallback}
              onChange={(e) => setEnableOfflineFallback(e.target.checked)}
              className="w-5 h-5 rounded border-neutral-300 text-primary-500 focus:ring-primary-500"
              data-testid="offline-fallback-checkbox"
            />
          </div>

          {/* Prefer Offline VAD */}
          <div className="flex items-center justify-between">
            <div>
              <label
                htmlFor="prefer-offline-vad"
                className="text-sm font-medium text-neutral-700"
              >
                Prefer local processing
              </label>
              <p className="text-xs text-neutral-500">
                Process voice locally when possible for lower latency
              </p>
            </div>
            <input
              type="checkbox"
              id="prefer-offline-vad"
              checked={preferOfflineVAD}
              onChange={(e) => setPreferOfflineVAD(e.target.checked)}
              className="w-5 h-5 rounded border-neutral-300 text-primary-500 focus:ring-primary-500"
              data-testid="prefer-offline-vad-checkbox"
            />
          </div>

          {/* TTS Cache */}
          <div className="flex items-center justify-between">
            <div>
              <label
                htmlFor="tts-cache"
                className="text-sm font-medium text-neutral-700"
              >
                Cache speech audio
              </label>
              <p className="text-xs text-neutral-500">
                Store common phrases for faster playback
              </p>
            </div>
            <input
              type="checkbox"
              id="tts-cache"
              checked={ttsCacheEnabled}
              onChange={(e) => setTtsCacheEnabled(e.target.checked)}
              className="w-5 h-5 rounded border-neutral-300 text-primary-500 focus:ring-primary-500"
              data-testid="tts-cache-checkbox"
            />
          </div>

          {/* ================================================================
              Phase 10: Conversation Intelligence Settings
              ================================================================ */}
          <div className="border-t border-neutral-200 pt-5">
            <h3 className="text-sm font-semibold text-neutral-800 mb-4 flex items-center gap-2">
              <svg
                xmlns="http://www.w3.org/2000/svg"
                fill="none"
                viewBox="0 0 24 24"
                strokeWidth={1.5}
                stroke="currentColor"
                className="w-4 h-4 text-indigo-500"
              >
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  d="M9.813 15.904L9 18.75l-.813-2.846a4.5 4.5 0 00-3.09-3.09L2.25 12l2.846-.813a4.5 4.5 0 003.09-3.09L9 5.25l.813 2.846a4.5 4.5 0 003.09 3.09L15.75 12l-2.846.813a4.5 4.5 0 00-3.09 3.09zM18.259 8.715L18 9.75l-.259-1.035a3.375 3.375 0 00-2.455-2.456L14.25 6l1.036-.259a3.375 3.375 0 002.455-2.456L18 2.25l.259 1.035a3.375 3.375 0 002.456 2.456L21.75 6l-1.035.259a3.375 3.375 0 00-2.456 2.456zM16.894 20.567L16.5 21.75l-.394-1.183a2.25 2.25 0 00-1.423-1.423L13.5 18.75l1.183-.394a2.25 2.25 0 001.423-1.423l.394-1.183.394 1.183a2.25 2.25 0 001.423 1.423l1.183.394-1.183.394a2.25 2.25 0 00-1.423 1.423z"
                />
              </svg>
              Conversation Intelligence
            </h3>
          </div>

          {/* Sentiment Tracking */}
          <div className="flex items-center justify-between">
            <div>
              <label
                htmlFor="sentiment-tracking"
                className="text-sm font-medium text-neutral-700"
              >
                Sentiment analysis
              </label>
              <p className="text-xs text-neutral-500">
                Detect emotional tone to improve AI responses
              </p>
            </div>
            <input
              type="checkbox"
              id="sentiment-tracking"
              checked={enableSentimentTracking}
              onChange={(e) => setEnableSentimentTracking(e.target.checked)}
              className="w-5 h-5 rounded border-neutral-300 text-primary-500 focus:ring-primary-500"
              data-testid="sentiment-tracking-checkbox"
            />
          </div>

          {/* Discourse Analysis */}
          <div className="flex items-center justify-between">
            <div>
              <label
                htmlFor="discourse-analysis"
                className="text-sm font-medium text-neutral-700"
              >
                Topic tracking
              </label>
              <p className="text-xs text-neutral-500">
                Track conversation topics for better context
              </p>
            </div>
            <input
              type="checkbox"
              id="discourse-analysis"
              checked={enableDiscourseAnalysis}
              onChange={(e) => setEnableDiscourseAnalysis(e.target.checked)}
              className="w-5 h-5 rounded border-neutral-300 text-primary-500 focus:ring-primary-500"
              data-testid="discourse-analysis-checkbox"
            />
          </div>

          {/* Response Recommendations */}
          <div className="flex items-center justify-between">
            <div>
              <label
                htmlFor="response-recommendations"
                className="text-sm font-medium text-neutral-700"
              >
                Smart response tuning
              </label>
              <p className="text-xs text-neutral-500">
                Automatically adjust AI responses based on conversation flow
              </p>
            </div>
            <input
              type="checkbox"
              id="response-recommendations"
              checked={enableResponseRecommendations}
              onChange={(e) =>
                setEnableResponseRecommendations(e.target.checked)
              }
              className="w-5 h-5 rounded border-neutral-300 text-primary-500 focus:ring-primary-500"
              data-testid="response-recommendations-checkbox"
            />
          </div>

          {/* Suggested Follow-ups */}
          <div className="flex items-center justify-between">
            <div>
              <label
                htmlFor="suggested-followups"
                className="text-sm font-medium text-neutral-700"
              >
                Show follow-up suggestions
              </label>
              <p className="text-xs text-neutral-500">
                Display suggested questions to continue the conversation
              </p>
            </div>
            <input
              type="checkbox"
              id="suggested-followups"
              checked={showSuggestedFollowUps}
              onChange={(e) => setShowSuggestedFollowUps(e.target.checked)}
              className="w-5 h-5 rounded border-neutral-300 text-primary-500 focus:ring-primary-500"
              data-testid="suggested-followups-checkbox"
            />
          </div>

          {/* ================================================================
              Privacy Settings
              ================================================================ */}
          <div className="border-t border-neutral-200 pt-5">
            <h3 className="text-sm font-semibold text-neutral-800 mb-4 flex items-center gap-2">
              <svg
                xmlns="http://www.w3.org/2000/svg"
                fill="none"
                viewBox="0 0 24 24"
                strokeWidth={1.5}
                stroke="currentColor"
                className="w-4 h-4 text-emerald-500"
              >
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  d="M9 12.75L11.25 15 15 9.75m-3-7.036A11.959 11.959 0 013.598 6 11.99 11.99 0 003 9.749c0 5.592 3.824 10.29 9 11.623 5.176-1.332 9-6.03 9-11.622 0-1.31-.21-2.571-.598-3.751h-.152c-3.196 0-6.1-1.248-8.25-3.285z"
                />
              </svg>
              Privacy
            </h3>
          </div>

          {/* Store Transcript History */}
          <div className="flex items-center justify-between">
            <div>
              <label
                htmlFor="store-transcripts"
                className="text-sm font-medium text-neutral-700"
              >
                Store conversation history
              </label>
              <p className="text-xs text-neutral-500">
                Save voice transcripts locally for continuity
              </p>
            </div>
            <input
              type="checkbox"
              id="store-transcripts"
              checked={storeTranscriptHistory}
              onChange={(e) => setStoreTranscriptHistory(e.target.checked)}
              className="w-5 h-5 rounded border-neutral-300 text-primary-500 focus:ring-primary-500"
              data-testid="store-transcripts-checkbox"
            />
          </div>

          {/* Anonymous Analytics */}
          <div className="flex items-center justify-between">
            <div>
              <label
                htmlFor="anonymous-analytics"
                className="text-sm font-medium text-neutral-700"
              >
                Share usage analytics
              </label>
              <p className="text-xs text-neutral-500">
                Help improve voice features with anonymous data
              </p>
            </div>
            <input
              type="checkbox"
              id="anonymous-analytics"
              checked={shareAnonymousAnalytics}
              onChange={(e) => setShareAnonymousAnalytics(e.target.checked)}
              className="w-5 h-5 rounded border-neutral-300 text-primary-500 focus:ring-primary-500"
              data-testid="anonymous-analytics-checkbox"
            />
          </div>
        </div>

        {/* Current Config Summary */}
        <div className="mt-6 p-3 bg-neutral-50 rounded-lg">
          <p className="text-xs text-neutral-600">
            <strong>Current:</strong>{" "}
            {ELEVENLABS_VOICE_OPTIONS.find((v) => v.id === elevenlabsVoiceId)
              ?.name || "Josh"}{" "}
            voice,{" "}
            {QUALITY_PRESET_OPTIONS.find((q) => q.value === qualityPreset)
              ?.label || "Balanced"}{" "}
            quality, {LANGUAGE_OPTIONS.find((l) => l.value === language)?.label}
            ,{" "}
            {PLAYBACK_SPEED_OPTIONS.find((s) => s.value === playbackSpeed)
              ?.label || "1x"}{" "}
            playback
          </p>
        </div>

        {/* Footer Actions */}
        <div className="mt-6 flex justify-between">
          <button
            type="button"
            onClick={handleReset}
            className="px-4 py-2 text-sm font-medium text-neutral-600 hover:text-neutral-900 transition-colors"
            data-testid="reset-settings"
          >
            Reset to defaults
          </button>
          <button
            type="button"
            onClick={onClose}
            className="px-4 py-2 bg-primary-500 text-white text-sm font-medium rounded-md hover:bg-primary-600 transition-colors"
            data-testid="done-button"
          >
            Done
          </button>
        </div>
      </div>

      {/* Calibration Dialog */}
      <CalibrationDialog
        isOpen={showCalibration}
        onClose={() => setShowCalibration(false)}
      />
    </div>
  );
}
