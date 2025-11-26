/**
 * Enhanced Voice Settings Component
 * Configure voice input/output preferences with backend persistence
 */

import { useState, useEffect, useRef } from "react";
import {
  Label,
  Card,
  CardHeader,
  CardTitle,
  CardContent,
} from "@voiceassist/ui";
import type { VADConfig } from "../../utils/vad";
import { DEFAULT_VAD_CONFIG } from "../../utils/vad";
import { useAuth } from "../../hooks/useAuth";

export interface VoiceSettingsData {
  // TTS Settings
  voiceId?: string;
  speed: number; // 0.5 to 2.0
  volume: number; // 0 to 1
  autoPlay: boolean;

  // VAD Settings
  vadEnabled: boolean;
  vadEnergyThreshold: number; // 0 to 1
  vadMinSpeechDuration: number; // ms
  vadMaxSilenceDuration: number; // ms
}

interface VoiceSettingsEnhancedProps {
  onSettingsChange?: (settings: VoiceSettingsData) => void;
  initialSettings?: Partial<VoiceSettingsData>;
}

const DEFAULT_SETTINGS: VoiceSettingsData = {
  voiceId: "alloy", // OpenAI TTS default voice
  speed: 1.0,
  volume: 0.8,
  autoPlay: true,
  vadEnabled: true,
  vadEnergyThreshold: DEFAULT_VAD_CONFIG.energyThreshold,
  vadMinSpeechDuration: DEFAULT_VAD_CONFIG.minSpeechDuration,
  vadMaxSilenceDuration: DEFAULT_VAD_CONFIG.maxSilenceDuration,
};

// OpenAI TTS available voices
const AVAILABLE_VOICES = [
  { id: "alloy", name: "Alloy", description: "Neutral and balanced" },
  { id: "echo", name: "Echo", description: "Warm and conversational" },
  { id: "fable", name: "Fable", description: "Expressive and dynamic" },
  { id: "onyx", name: "Onyx", description: "Deep and authoritative" },
  { id: "nova", name: "Nova", description: "Energetic and youthful" },
  { id: "shimmer", name: "Shimmer", description: "Soft and gentle" },
];

// Sample sentences for voice testing
const VOICE_TEST_SAMPLES = [
  "Hello! This is a test of your selected voice settings.",
  "The quick brown fox jumps over the lazy dog.",
  "Welcome to VoiceAssist. How can I help you today?",
];

export function VoiceSettingsEnhanced({
  onSettingsChange,
  initialSettings,
}: VoiceSettingsEnhancedProps) {
  const { apiClient } = useAuth();
  const [settings, setSettings] = useState<VoiceSettingsData>({
    ...DEFAULT_SETTINGS,
    ...initialSettings,
  });

  const [showAdvanced, setShowAdvanced] = useState(false);
  const [isTestingVoice, setIsTestingVoice] = useState(false);
  const [testError, setTestError] = useState<string | null>(null);
  const audioRef = useRef<HTMLAudioElement | null>(null);

  // Load settings from localStorage on mount
  useEffect(() => {
    const stored = localStorage.getItem("voiceassist-voice-settings");
    if (stored) {
      try {
        const parsed = JSON.parse(stored);
        setSettings({ ...DEFAULT_SETTINGS, ...parsed });
      } catch (err) {
        console.error("Failed to parse voice settings:", err);
      }
    }
  }, []);

  // Save settings to localStorage and notify parent
  useEffect(() => {
    localStorage.setItem(
      "voiceassist-voice-settings",
      JSON.stringify(settings),
    );
    onSettingsChange?.(settings);
  }, [settings, onSettingsChange]);

  const updateSetting = <K extends keyof VoiceSettingsData>(
    key: K,
    value: VoiceSettingsData[K],
  ) => {
    setSettings((prev) => ({ ...prev, [key]: value }));
  };

  const resetToDefaults = () => {
    setSettings(DEFAULT_SETTINGS);
  };

  // Stop any currently playing test audio
  const stopTestAudio = () => {
    if (audioRef.current) {
      audioRef.current.pause();
      audioRef.current.currentTime = 0;
      URL.revokeObjectURL(audioRef.current.src);
      audioRef.current = null;
    }
  };

  // Test voice with current settings
  const testVoiceSettings = async () => {
    // Stop any existing playback
    stopTestAudio();

    setIsTestingVoice(true);
    setTestError(null);

    try {
      // Pick a random sample sentence
      const sampleText =
        VOICE_TEST_SAMPLES[
          Math.floor(Math.random() * VOICE_TEST_SAMPLES.length)
        ];

      // Synthesize speech with current voice
      const audioBlob = await apiClient.synthesizeSpeech(
        sampleText,
        settings.voiceId,
      );

      // Create audio element and play
      const audioUrl = URL.createObjectURL(audioBlob);
      const audio = new Audio(audioUrl);
      audioRef.current = audio;

      // Apply settings
      audio.volume = settings.volume;
      audio.playbackRate = settings.speed;

      // Handle playback end
      audio.onended = () => {
        setIsTestingVoice(false);
        URL.revokeObjectURL(audioUrl);
        audioRef.current = null;
      };

      // Handle errors
      audio.onerror = () => {
        setTestError("Failed to play audio");
        setIsTestingVoice(false);
        URL.revokeObjectURL(audioUrl);
        audioRef.current = null;
      };

      // Play the audio
      await audio.play();
    } catch (err: unknown) {
      console.error("Voice test failed:", err);
      const errorMessage =
        err instanceof Error ? err.message : "Failed to test voice";
      setTestError(errorMessage);
      setIsTestingVoice(false);
    }
  };

  // Cleanup on unmount
  useEffect(() => {
    return () => {
      stopTestAudio();
    };
  }, []);

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center justify-between">
          <span>Voice Settings</span>
          <button
            type="button"
            onClick={resetToDefaults}
            className="text-xs text-neutral-500 hover:text-neutral-700 underline"
          >
            Reset to defaults
          </button>
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-6">
        {/* Voice Selection */}
        <div className="space-y-2">
          <Label htmlFor="voice-id">Voice</Label>
          <select
            id="voice-id"
            value={settings.voiceId}
            onChange={(e) => updateSetting("voiceId", e.target.value)}
            className="w-full px-3 py-2 border border-neutral-300 rounded-md bg-white text-neutral-900 focus:outline-none focus:ring-2 focus:ring-primary-500"
          >
            {AVAILABLE_VOICES.map((voice) => (
              <option key={voice.id} value={voice.id}>
                {voice.name} - {voice.description}
              </option>
            ))}
          </select>
          <p className="text-xs text-neutral-500">
            Choose the AI voice for text-to-speech responses
          </p>
        </div>

        {/* Voice Speed */}
        <div className="space-y-2">
          <Label htmlFor="voice-speed">
            Speech Speed: {settings.speed.toFixed(1)}x
          </Label>
          <input
            id="voice-speed"
            type="range"
            min="0.5"
            max="2.0"
            step="0.1"
            value={settings.speed}
            onChange={(e) => updateSetting("speed", parseFloat(e.target.value))}
            className="w-full h-2 bg-neutral-200 rounded-lg appearance-none cursor-pointer accent-primary-500"
            aria-label="Speech speed"
          />
          <div className="flex justify-between text-xs text-neutral-500">
            <span>0.5x (Slower)</span>
            <span>1.0x (Normal)</span>
            <span>2.0x (Faster)</span>
          </div>
        </div>

        {/* Volume */}
        <div className="space-y-2">
          <Label htmlFor="voice-volume">
            Volume: {Math.round(settings.volume * 100)}%
          </Label>
          <input
            id="voice-volume"
            type="range"
            min="0"
            max="1"
            step="0.1"
            value={settings.volume}
            onChange={(e) =>
              updateSetting("volume", parseFloat(e.target.value))
            }
            className="w-full h-2 bg-neutral-200 rounded-lg appearance-none cursor-pointer accent-primary-500"
            aria-label="Volume"
          />
          <div className="flex justify-between text-xs text-neutral-500">
            <span>Mute</span>
            <span>100%</span>
          </div>
        </div>

        {/* Auto-play */}
        <div className="flex items-center justify-between">
          <div className="flex-1">
            <Label htmlFor="auto-play" className="font-medium">
              Auto-play Responses
            </Label>
            <p className="text-sm text-neutral-600 mt-1">
              Automatically play audio responses when received
            </p>
          </div>
          <label className="relative inline-flex items-center cursor-pointer ml-4">
            <input
              id="auto-play"
              type="checkbox"
              checked={settings.autoPlay}
              onChange={(e) => updateSetting("autoPlay", e.target.checked)}
              className="sr-only peer"
            />
            <div className="w-11 h-6 bg-neutral-200 peer-focus:outline-none peer-focus:ring-4 peer-focus:ring-primary-300 rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-neutral-300 after:border after:rounded-full after:h-5 after:w-5 after:transition-all peer-checked:bg-primary-500"></div>
          </label>
        </div>

        {/* VAD Toggle */}
        <div className="flex items-center justify-between pt-3 border-t border-neutral-200">
          <div className="flex-1">
            <Label htmlFor="vad-enabled" className="font-medium">
              Voice Activity Detection (VAD)
            </Label>
            <p className="text-sm text-neutral-600 mt-1">
              Automatically detect when you start and stop speaking
            </p>
          </div>
          <label className="relative inline-flex items-center cursor-pointer ml-4">
            <input
              id="vad-enabled"
              type="checkbox"
              checked={settings.vadEnabled}
              onChange={(e) => updateSetting("vadEnabled", e.target.checked)}
              className="sr-only peer"
            />
            <div className="w-11 h-6 bg-neutral-200 peer-focus:outline-none peer-focus:ring-4 peer-focus:ring-primary-300 rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-neutral-300 after:border after:rounded-full after:h-5 after:w-5 after:transition-all peer-checked:bg-primary-500"></div>
          </label>
        </div>

        {/* Advanced Settings Toggle */}
        <button
          type="button"
          onClick={() => setShowAdvanced(!showAdvanced)}
          className="w-full flex items-center justify-between px-3 py-2 text-sm text-neutral-700 bg-neutral-50 rounded-md hover:bg-neutral-100 transition-colors"
        >
          <span className="font-medium">Advanced VAD Settings</span>
          <svg
            xmlns="http://www.w3.org/2000/svg"
            fill="none"
            viewBox="0 0 24 24"
            strokeWidth={2}
            stroke="currentColor"
            className={`w-4 h-4 transition-transform ${showAdvanced ? "rotate-180" : ""}`}
          >
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              d="M19 9l-7 7-7-7"
            />
          </svg>
        </button>

        {/* Advanced VAD Settings */}
        {showAdvanced && settings.vadEnabled && (
          <div className="space-y-4 pt-2 border-t border-neutral-200">
            {/* Energy Threshold */}
            <div className="space-y-2">
              <Label htmlFor="vad-threshold">
                Energy Threshold:{" "}
                {(settings.vadEnergyThreshold * 100).toFixed(0)}%
              </Label>
              <input
                id="vad-threshold"
                type="range"
                min="0.01"
                max="0.1"
                step="0.01"
                value={settings.vadEnergyThreshold}
                onChange={(e) =>
                  updateSetting(
                    "vadEnergyThreshold",
                    parseFloat(e.target.value),
                  )
                }
                className="w-full h-2 bg-neutral-200 rounded-lg appearance-none cursor-pointer accent-primary-500"
                aria-label="VAD energy threshold"
              />
              <p className="text-xs text-neutral-500">
                Higher values require louder speech to trigger detection
              </p>
            </div>

            {/* Min Speech Duration */}
            <div className="space-y-2">
              <Label htmlFor="vad-min-duration">
                Minimum Speech Duration: {settings.vadMinSpeechDuration}ms
              </Label>
              <input
                id="vad-min-duration"
                type="range"
                min="100"
                max="1000"
                step="50"
                value={settings.vadMinSpeechDuration}
                onChange={(e) =>
                  updateSetting(
                    "vadMinSpeechDuration",
                    parseInt(e.target.value),
                  )
                }
                className="w-full h-2 bg-neutral-200 rounded-lg appearance-none cursor-pointer accent-primary-500"
                aria-label="Minimum speech duration"
              />
              <p className="text-xs text-neutral-500">
                Minimum time speaking before recording starts
              </p>
            </div>

            {/* Max Silence Duration */}
            <div className="space-y-2">
              <Label htmlFor="vad-max-silence">
                Maximum Silence Duration: {settings.vadMaxSilenceDuration}ms
              </Label>
              <input
                id="vad-max-silence"
                type="range"
                min="500"
                max="3000"
                step="100"
                value={settings.vadMaxSilenceDuration}
                onChange={(e) =>
                  updateSetting(
                    "vadMaxSilenceDuration",
                    parseInt(e.target.value),
                  )
                }
                className="w-full h-2 bg-neutral-200 rounded-lg appearance-none cursor-pointer accent-primary-500"
                aria-label="Maximum silence duration"
              />
              <p className="text-xs text-neutral-500">
                Maximum silence before stopping recording
              </p>
            </div>
          </div>
        )}

        {/* Test Voice Button */}
        <div className="pt-3 border-t border-neutral-200 space-y-2">
          <button
            type="button"
            className={`w-full px-4 py-2 rounded-md transition-colors font-medium flex items-center justify-center gap-2 ${
              isTestingVoice
                ? "bg-red-500 hover:bg-red-600 text-white"
                : "bg-primary-500 hover:bg-primary-600 text-white"
            }`}
            onClick={isTestingVoice ? stopTestAudio : testVoiceSettings}
            disabled={isTestingVoice && !audioRef.current}
          >
            {isTestingVoice ? (
              <>
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
                    d="M5.25 7.5A2.25 2.25 0 017.5 5.25h9a2.25 2.25 0 012.25 2.25v9a2.25 2.25 0 01-2.25 2.25h-9a2.25 2.25 0 01-2.25-2.25v-9z"
                  />
                </svg>
                Stop Playback
              </>
            ) : (
              <>
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
                    d="M19.114 5.636a9 9 0 010 12.728M16.463 8.288a5.25 5.25 0 010 7.424M6.75 8.25l4.72-4.72a.75.75 0 011.28.53v15.88a.75.75 0 01-1.28.53l-4.72-4.72H4.51c-.88 0-1.704-.507-1.938-1.354A9.01 9.01 0 012.25 12c0-.83.112-1.633.322-2.396C2.806 8.756 3.63 8.25 4.51 8.25H6.75z"
                  />
                </svg>
                Test Voice Settings
              </>
            )}
          </button>
          {testError && (
            <p className="text-xs text-red-500 text-center">{testError}</p>
          )}
          <p className="text-xs text-neutral-500 text-center">
            Hear how your voice settings sound with "{settings.voiceId}" voice
            at {settings.speed}x speed
          </p>
        </div>
      </CardContent>
    </Card>
  );
}

/**
 * Hook to use voice settings
 */
export function useVoiceSettings() {
  const [settings, setSettings] = useState<VoiceSettingsData>(DEFAULT_SETTINGS);

  useEffect(() => {
    const stored = localStorage.getItem("voiceassist-voice-settings");
    if (stored) {
      try {
        const parsed = JSON.parse(stored);
        setSettings({ ...DEFAULT_SETTINGS, ...parsed });
      } catch (err) {
        console.error("Failed to parse voice settings:", err);
      }
    }
  }, []);

  const getVADConfig = (): VADConfig => {
    return {
      energyThreshold: settings.vadEnergyThreshold,
      minSpeechDuration: settings.vadMinSpeechDuration,
      maxSilenceDuration: settings.vadMaxSilenceDuration,
      sampleRate: DEFAULT_VAD_CONFIG.sampleRate,
      fftSize: DEFAULT_VAD_CONFIG.fftSize,
    };
  };

  return {
    settings,
    setSettings,
    getVADConfig,
  };
}
