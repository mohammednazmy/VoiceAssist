/**
 * Voice Mode Settings Modal
 * Allows users to configure voice settings including voice selection,
 * language, VAD sensitivity, and behavior preferences.
 */

import { useCallback } from "react";
import {
  useVoiceSettingsStore,
  VOICE_OPTIONS,
  LANGUAGE_OPTIONS,
  type VoiceOption,
  type LanguageOption,
} from "../../stores/voiceSettingsStore";

export interface VoiceModeSettingsProps {
  isOpen: boolean;
  onClose: () => void;
}

export function VoiceModeSettings({ isOpen, onClose }: VoiceModeSettingsProps) {
  const {
    voice,
    language,
    vadSensitivity,
    autoStartOnOpen,
    showStatusHints,
    setVoice,
    setLanguage,
    setVadSensitivity,
    setAutoStartOnOpen,
    setShowStatusHints,
    reset,
  } = useVoiceSettingsStore();

  const handleReset = useCallback(() => {
    if (window.confirm("Reset all voice settings to defaults?")) {
      reset();
    }
  }, [reset]);

  const handleVoiceChange = useCallback(
    (e: React.ChangeEvent<HTMLSelectElement>) => {
      setVoice(e.target.value as VoiceOption);
    },
    [setVoice],
  );

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

  if (!isOpen) {
    return null;
  }

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
        className="bg-white rounded-lg shadow-xl max-w-md w-full mx-4 p-6"
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
          {/* Voice Selection */}
          <div>
            <label
              htmlFor="voice-select"
              className="block text-sm font-medium text-neutral-700 mb-1"
            >
              Voice
            </label>
            <select
              id="voice-select"
              value={voice}
              onChange={handleVoiceChange}
              className="w-full rounded-md border border-neutral-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary-500 focus:border-transparent"
              data-testid="voice-select"
            >
              {VOICE_OPTIONS.map((opt) => (
                <option key={opt.value} value={opt.value}>
                  {opt.label}
                </option>
              ))}
            </select>
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
        </div>

        {/* Current Config Summary */}
        <div className="mt-6 p-3 bg-neutral-50 rounded-lg">
          <p className="text-xs text-neutral-600">
            <strong>Current:</strong>{" "}
            {VOICE_OPTIONS.find((v) => v.value === voice)?.label} voice,{" "}
            {LANGUAGE_OPTIONS.find((l) => l.value === language)?.label},{" "}
            {vadSensitivity}% sensitivity
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
    </div>
  );
}
