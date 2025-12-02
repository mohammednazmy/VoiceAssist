/**
 * Voice Mode Settings Modal
 * Allows users to configure voice settings including voice selection,
 * language, VAD sensitivity, and behavior preferences.
 *
 * Phase 9.3: Added audio device, playback speed, keyboard shortcuts
 */

import { useCallback } from "react";
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

export interface VoiceModeSettingsProps {
  isOpen: boolean;
  onClose: () => void;
}

export function VoiceModeSettings({ isOpen, onClose }: VoiceModeSettingsProps) {
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
    reset,
  } = useVoiceSettingsStore();

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
    </div>
  );
}
