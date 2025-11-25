/**
 * Voice Mode Settings Modal
 * User-friendly modal for configuring voice mode preferences
 */

import { useVoiceSettingsStore, AVAILABLE_VOICES, AVAILABLE_LANGUAGES } from "../../stores/voiceSettingsStore";

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

  if (!isOpen) return null;

  const handleReset = () => {
    if (confirm("Reset all voice settings to defaults?")) {
      reset();
    }
  };

  return (
    <>
      {/* Backdrop */}
      <div
        className="fixed inset-0 bg-black bg-opacity-50 z-40"
        onClick={onClose}
        aria-hidden="true"
      />

      {/* Modal */}
      <div
        className="fixed inset-0 z-50 flex items-center justify-center p-4"
        role="dialog"
        aria-modal="true"
        aria-labelledby="voice-settings-title"
      >
        <div
          className="bg-white rounded-lg shadow-2xl max-w-lg w-full max-h-[90vh] overflow-y-auto"
          onClick={(e) => e.stopPropagation()}
        >
          {/* Header */}
          <div className="flex items-center justify-between px-6 py-4 border-b border-neutral-200">
            <h2
              id="voice-settings-title"
              className="text-xl font-semibold text-neutral-900"
            >
              Voice Mode Settings
            </h2>
            <button
              type="button"
              onClick={onClose}
              className="text-neutral-400 hover:text-neutral-600 transition-colors"
              aria-label="Close settings"
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

          {/* Content */}
          <div className="px-6 py-6 space-y-6">
            {/* Voice Selection */}
            <div className="space-y-2">
              <label
                htmlFor="voice-select"
                className="block text-sm font-medium text-neutral-900"
              >
                AI Voice
              </label>
              <select
                id="voice-select"
                value={voice}
                onChange={(e) => setVoice(e.target.value as any)}
                className="w-full px-3 py-2 border border-neutral-300 rounded-md bg-white text-neutral-900 focus:outline-none focus:ring-2 focus:ring-primary-500 focus:border-transparent"
              >
                {AVAILABLE_VOICES.map((v) => (
                  <option key={v.id} value={v.id}>
                    {v.name} — {v.description}
                  </option>
                ))}
              </select>
              <p className="text-xs text-neutral-500">
                The voice personality for AI responses
              </p>
            </div>

            {/* Language Selection */}
            <div className="space-y-2">
              <label
                htmlFor="language-select"
                className="block text-sm font-medium text-neutral-900"
              >
                Language
              </label>
              <select
                id="language-select"
                value={language}
                onChange={(e) => setLanguage(e.target.value as any)}
                className="w-full px-3 py-2 border border-neutral-300 rounded-md bg-white text-neutral-900 focus:outline-none focus:ring-2 focus:ring-primary-500 focus:border-transparent"
              >
                {AVAILABLE_LANGUAGES.map((lang) => (
                  <option key={lang.code} value={lang.code}>
                    {lang.name}
                  </option>
                ))}
              </select>
              <p className="text-xs text-neutral-500">
                Primary language for voice interaction
              </p>
            </div>

            {/* VAD Sensitivity */}
            <div className="space-y-2">
              <label
                htmlFor="vad-sensitivity"
                className="block text-sm font-medium text-neutral-900"
              >
                Microphone Sensitivity: {vadSensitivity}%
              </label>
              <input
                id="vad-sensitivity"
                type="range"
                min="0"
                max="100"
                step="5"
                value={vadSensitivity}
                onChange={(e) => setVadSensitivity(Number(e.target.value))}
                className="w-full h-2 bg-neutral-200 rounded-lg appearance-none cursor-pointer accent-primary-500"
                aria-label="Voice detection sensitivity"
              />
              <div className="flex justify-between text-xs text-neutral-500">
                <span>Less sensitive (quieter)</span>
                <span>More sensitive (louder)</span>
              </div>
              <p className="text-xs text-neutral-500">
                Adjust how easily the system detects your speech
              </p>
            </div>

            {/* Auto-start Option */}
            <div className="flex items-start space-x-3 p-3 bg-neutral-50 rounded-lg">
              <input
                id="auto-start"
                type="checkbox"
                checked={autoStartOnOpen}
                onChange={(e) => setAutoStartOnOpen(e.target.checked)}
                className="mt-0.5 h-4 w-4 text-primary-600 focus:ring-primary-500 border-neutral-300 rounded"
              />
              <div className="flex-1">
                <label
                  htmlFor="auto-start"
                  className="text-sm font-medium text-neutral-900 cursor-pointer"
                >
                  Auto-start voice session
                </label>
                <p className="text-xs text-neutral-500 mt-1">
                  Automatically connect when entering Voice Mode
                </p>
              </div>
            </div>

            {/* Show Hints Option */}
            <div className="flex items-start space-x-3 p-3 bg-neutral-50 rounded-lg">
              <input
                id="show-hints"
                type="checkbox"
                checked={showStatusHints}
                onChange={(e) => setShowStatusHints(e.target.checked)}
                className="mt-0.5 h-4 w-4 text-primary-600 focus:ring-primary-500 border-neutral-300 rounded"
              />
              <div className="flex-1">
                <label
                  htmlFor="show-hints"
                  className="text-sm font-medium text-neutral-900 cursor-pointer"
                >
                  Show helpful hints
                </label>
                <p className="text-xs text-neutral-500 mt-1">
                  Display usage tips and connection status
                </p>
              </div>
            </div>

            {/* Current Settings Display */}
            <div className="p-3 bg-blue-50 border border-blue-200 rounded-lg">
              <h4 className="text-sm font-semibold text-blue-900 mb-2">
                Current Configuration
              </h4>
              <dl className="text-xs text-blue-800 space-y-1">
                <div className="flex justify-between">
                  <dt className="font-medium">Voice:</dt>
                  <dd>{AVAILABLE_VOICES.find((v) => v.id === voice)?.name}</dd>
                </div>
                <div className="flex justify-between">
                  <dt className="font-medium">Language:</dt>
                  <dd>
                    {
                      AVAILABLE_LANGUAGES.find((l) => l.code === language)
                        ?.name
                    }
                  </dd>
                </div>
                <div className="flex justify-between">
                  <dt className="font-medium">Sensitivity:</dt>
                  <dd>{vadSensitivity}%</dd>
                </div>
              </dl>
            </div>
          </div>

          {/* Footer */}
          <div className="flex items-center justify-between px-6 py-4 border-t border-neutral-200 bg-neutral-50">
            <button
              type="button"
              onClick={handleReset}
              className="text-sm text-neutral-600 hover:text-neutral-900 underline"
            >
              Reset to defaults
            </button>
            <button
              type="button"
              onClick={onClose}
              className="px-4 py-2 bg-primary-500 text-white text-sm font-medium rounded-md hover:bg-primary-600 transition-colors"
            >
              Done
            </button>
          </div>
        </div>
      </div>
    </>
  );
}
