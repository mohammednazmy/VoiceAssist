/**
 * Voice Admin Panel - Phase 11.1: Comprehensive Voice Configuration
 *
 * Admin panel for managing voice mode settings:
 * - TTS Provider configuration (OpenAI/ElevenLabs)
 * - Voice selection and defaults
 * - Feature flags (echo cancellation, adaptive VAD, etc.)
 * - Voice metrics dashboard
 */

import { useState, useEffect, useCallback } from "react";
import { useAuth } from "../../hooks/useAuth";

// Types
interface VoiceInfo {
  voice_id: string;
  name: string;
  provider: string; // "openai" | "elevenlabs" or other providers
  category?: string;
  preview_url?: string;
  description?: string;
  labels?: Record<string, string>;
}

interface _VoiceListResponse {
  voices: VoiceInfo[];
  default_voice_id?: string | null;
  default_provider: string;
}

interface ElevenLabsUsage {
  character_count: number;
  character_limit: number;
  voice_limit: number;
  professional_voice_limit: number;
  next_reset_at?: string;
}

interface VoiceFeatureFlags {
  echoDetectionEnabled: boolean;
  adaptiveVadEnabled: boolean;
  elevenlabsEnabled: boolean;
  streamingTtsEnabled: boolean;
  bargeInEnabled: boolean;
}

// Tab type
type TabId = "config" | "analytics" | "features";

// ============================================================================
// Sub-components
// ============================================================================

// Provider Badge
function ProviderBadge({ provider }: { provider: string }) {
  const colors =
    provider === "elevenlabs"
      ? "bg-purple-100 text-purple-700"
      : "bg-blue-100 text-blue-700";

  return (
    <span className={`text-xs px-2 py-0.5 rounded-full font-medium ${colors}`}>
      {provider === "elevenlabs" ? "ElevenLabs" : "OpenAI"}
    </span>
  );
}

// Voice Card
function VoiceCard({
  voice,
  isDefault,
  onSetDefault,
}: {
  voice: VoiceInfo;
  isDefault: boolean;
  onSetDefault: () => void;
}) {
  return (
    <div
      className={`p-4 rounded-lg border ${isDefault ? "border-primary-500 bg-primary-50" : "border-neutral-200 bg-white"}`}
    >
      <div className="flex items-start justify-between">
        <div>
          <h4 className="font-medium text-neutral-900">{voice.name}</h4>
          <div className="flex items-center space-x-2 mt-1">
            <ProviderBadge provider={voice.provider} />
            {voice.category && (
              <span className="text-xs text-neutral-500">{voice.category}</span>
            )}
          </div>
          {voice.description && (
            <p className="text-sm text-neutral-600 mt-2">{voice.description}</p>
          )}
          {voice.labels && Object.keys(voice.labels).length > 0 && (
            <div className="flex flex-wrap gap-1 mt-2">
              {Object.entries(voice.labels).map(([key, value]) => (
                <span
                  key={key}
                  className="text-xs px-1.5 py-0.5 bg-neutral-100 text-neutral-600 rounded"
                >
                  {key}: {value}
                </span>
              ))}
            </div>
          )}
        </div>
        <div className="flex items-center space-x-2">
          {voice.preview_url && (
            <button
              onClick={() => {
                const audio = new Audio(voice.preview_url);
                audio.play();
              }}
              className="p-2 text-neutral-500 hover:text-neutral-700 hover:bg-neutral-100 rounded-full"
              title="Preview voice"
            >
              <svg
                xmlns="http://www.w3.org/2000/svg"
                fill="none"
                viewBox="0 0 24 24"
                strokeWidth={1.5}
                stroke="currentColor"
                className="w-5 h-5"
              >
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  d="M5.25 5.653c0-.856.917-1.398 1.667-.986l11.54 6.348a1.125 1.125 0 010 1.971l-11.54 6.347a1.125 1.125 0 01-1.667-.985V5.653z"
                />
              </svg>
            </button>
          )}
          <button
            onClick={onSetDefault}
            disabled={isDefault}
            className={`px-3 py-1.5 text-sm rounded-md transition-colors ${
              isDefault
                ? "bg-primary-600 text-white cursor-default"
                : "bg-neutral-100 text-neutral-700 hover:bg-neutral-200"
            }`}
          >
            {isDefault ? "Default" : "Set Default"}
          </button>
        </div>
      </div>
    </div>
  );
}

// Usage Gauge
function UsageGauge({
  used,
  limit,
  label,
}: {
  used: number;
  limit: number;
  label: string;
}) {
  const percentage = Math.min((used / limit) * 100, 100);
  const status =
    percentage < 50 ? "good" : percentage < 80 ? "warning" : "critical";
  const colors = {
    good: "bg-green-500",
    warning: "bg-yellow-500",
    critical: "bg-red-500",
  };

  return (
    <div className="space-y-2">
      <div className="flex justify-between text-sm">
        <span className="text-neutral-600">{label}</span>
        <span className="font-medium text-neutral-900">
          {used.toLocaleString()} / {limit.toLocaleString()}
        </span>
      </div>
      <div className="h-2 bg-neutral-200 rounded-full overflow-hidden">
        <div
          className={`h-full ${colors[status]} transition-all duration-300`}
          style={{ width: `${percentage}%` }}
        />
      </div>
      <p className="text-xs text-neutral-500">{percentage.toFixed(1)}% used</p>
    </div>
  );
}

// Feature Flag Toggle
function FeatureFlagToggle({
  label,
  description,
  enabled,
  onChange,
  loading,
}: {
  label: string;
  description: string;
  enabled: boolean;
  onChange: (enabled: boolean) => void;
  loading?: boolean;
}) {
  return (
    <div className="flex items-center justify-between py-4 border-b border-neutral-100 last:border-0">
      <div>
        <h4 className="font-medium text-neutral-900">{label}</h4>
        <p className="text-sm text-neutral-600">{description}</p>
      </div>
      <button
        onClick={() => onChange(!enabled)}
        disabled={loading}
        className={`relative inline-flex h-6 w-11 items-center rounded-full transition-colors ${
          enabled ? "bg-primary-600" : "bg-neutral-300"
        } ${loading ? "opacity-50 cursor-not-allowed" : ""}`}
      >
        <span
          className={`inline-block h-4 w-4 transform rounded-full bg-white transition-transform ${
            enabled ? "translate-x-6" : "translate-x-1"
          }`}
        />
      </button>
    </div>
  );
}

// ============================================================================
// Main Component
// ============================================================================

export function VoiceAdminPanel() {
  const { apiClient } = useAuth();

  // State
  const [activeTab, setActiveTab] = useState<TabId>("config");
  const [voices, setVoices] = useState<VoiceInfo[]>([]);
  const [defaultVoiceId, setDefaultVoiceId] = useState<string | null>(null);
  const [defaultProvider, setDefaultProvider] = useState<string>("openai");
  const [providerFilter, setProviderFilter] = useState<string>("all");
  const [elevenlabsUsage, setElevenlabsUsage] =
    useState<ElevenLabsUsage | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [savingFlags, setSavingFlags] = useState(false);

  // Feature flags state
  const [featureFlags, setFeatureFlags] = useState<VoiceFeatureFlags>({
    echoDetectionEnabled: true,
    adaptiveVadEnabled: true,
    elevenlabsEnabled: true,
    streamingTtsEnabled: true,
    bargeInEnabled: true,
  });

  // Load voices
  const loadVoices = useCallback(async () => {
    setLoading(true);
    setError(null);

    try {
      const response = await apiClient.getAvailableVoices();
      setVoices(response.voices);
      setDefaultVoiceId(response.default_voice_id || null);
      setDefaultProvider(response.default_provider);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to load voices");
    } finally {
      setLoading(false);
    }
  }, [apiClient]);

  // Load ElevenLabs usage (if available)
  const loadElevenlabsUsage = useCallback(async () => {
    try {
      // This would call a new API endpoint for ElevenLabs usage
      // For now, we'll simulate it
      // const usage = await apiClient.getElevenlabsUsage();
      // setElevenlabsUsage(usage);
    } catch {
      // ElevenLabs might not be configured - ignore
    }
  }, []);

  // Load feature flags
  const loadFeatureFlags = useCallback(async () => {
    try {
      // Load from API or localStorage
      const stored = localStorage.getItem("voiceassist-voice-feature-flags");
      if (stored) {
        setFeatureFlags(JSON.parse(stored));
      }
    } catch {
      // Use defaults
    }
  }, []);

  // Initial load
  useEffect(() => {
    loadVoices();
    loadElevenlabsUsage();
    loadFeatureFlags();
  }, [loadVoices, loadElevenlabsUsage, loadFeatureFlags]);

  // Set default voice
  const handleSetDefaultVoice = async (voice: VoiceInfo) => {
    try {
      // In a real implementation, this would call an API to persist the setting
      setDefaultVoiceId(voice.voice_id);
      setDefaultProvider(voice.provider);

      // Store in localStorage for now
      localStorage.setItem(
        "voiceassist-default-voice",
        JSON.stringify({
          voice_id: voice.voice_id,
          provider: voice.provider,
        }),
      );
    } catch (err) {
      setError("Failed to set default voice");
    }
  };

  // Update feature flag
  const handleFeatureFlagChange = async (
    flag: keyof VoiceFeatureFlags,
    enabled: boolean,
  ) => {
    setSavingFlags(true);
    try {
      const newFlags = { ...featureFlags, [flag]: enabled };
      setFeatureFlags(newFlags);

      // Persist to localStorage (in production, this would be an API call)
      localStorage.setItem(
        "voiceassist-voice-feature-flags",
        JSON.stringify(newFlags),
      );
    } catch {
      setError("Failed to update feature flag");
    } finally {
      setSavingFlags(false);
    }
  };

  // Filter voices
  const filteredVoices =
    providerFilter === "all"
      ? voices
      : voices.filter((v) => v.provider === providerFilter);

  // Group voices by provider
  const openaiVoices = voices.filter((v) => v.provider === "openai");
  const elevenlabsVoices = voices.filter((v) => v.provider === "elevenlabs");

  return (
    <div className="p-6 space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-neutral-900">
            Voice Configuration
          </h1>
          <p className="text-sm text-neutral-600">
            Manage TTS providers, voices, and voice mode features
          </p>
        </div>
        <button
          onClick={loadVoices}
          disabled={loading}
          className="px-4 py-2 text-sm font-medium text-primary-700 bg-primary-50 rounded-md hover:bg-primary-100 disabled:opacity-50"
        >
          {loading ? "Refreshing..." : "Refresh"}
        </button>
      </div>

      {/* Error Banner */}
      {error && (
        <div className="p-4 bg-red-50 border border-red-200 rounded-lg text-red-700">
          {error}
          <button
            onClick={() => setError(null)}
            className="ml-2 text-red-500 hover:text-red-700"
          >
            Dismiss
          </button>
        </div>
      )}

      {/* Tabs */}
      <div className="border-b border-neutral-200">
        <nav className="flex space-x-8">
          {[
            { id: "config", label: "TTS Configuration", icon: "cog" },
            { id: "analytics", label: "Usage & Analytics", icon: "chart" },
            { id: "features", label: "Feature Flags", icon: "flag" },
          ].map((tab) => (
            <button
              key={tab.id}
              onClick={() => setActiveTab(tab.id as TabId)}
              className={`py-4 px-1 border-b-2 font-medium text-sm transition-colors ${
                activeTab === tab.id
                  ? "border-primary-500 text-primary-600"
                  : "border-transparent text-neutral-500 hover:text-neutral-700"
              }`}
            >
              {tab.label}
            </button>
          ))}
        </nav>
      </div>

      {/* Tab Content */}
      {activeTab === "config" && (
        <div className="space-y-6">
          {/* Provider Selection */}
          <div className="bg-white rounded-lg shadow p-6">
            <h2 className="text-lg font-semibold text-neutral-900 mb-4">
              TTS Provider
            </h2>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <button
                onClick={() => setDefaultProvider("openai")}
                className={`p-4 rounded-lg border-2 text-left transition-colors ${
                  defaultProvider === "openai"
                    ? "border-primary-500 bg-primary-50"
                    : "border-neutral-200 hover:border-neutral-300"
                }`}
              >
                <h3 className="font-medium text-neutral-900">OpenAI TTS</h3>
                <p className="text-sm text-neutral-600 mt-1">
                  Built-in TTS with 6 natural voices. Fast and reliable.
                </p>
                <div className="flex items-center space-x-2 mt-2">
                  <span className="text-xs px-2 py-0.5 bg-blue-100 text-blue-700 rounded">
                    {openaiVoices.length} voices
                  </span>
                  <span className="text-xs text-neutral-500">Included</span>
                </div>
              </button>

              <button
                onClick={() => setDefaultProvider("elevenlabs")}
                className={`p-4 rounded-lg border-2 text-left transition-colors ${
                  defaultProvider === "elevenlabs"
                    ? "border-primary-500 bg-primary-50"
                    : "border-neutral-200 hover:border-neutral-300"
                }`}
              >
                <h3 className="font-medium text-neutral-900">ElevenLabs</h3>
                <p className="text-sm text-neutral-600 mt-1">
                  Premium neural voices with emotion control. Higher quality.
                </p>
                <div className="flex items-center space-x-2 mt-2">
                  <span className="text-xs px-2 py-0.5 bg-purple-100 text-purple-700 rounded">
                    {elevenlabsVoices.length} voices
                  </span>
                  <span className="text-xs text-neutral-500">Premium</span>
                </div>
              </button>
            </div>
          </div>

          {/* Voice Selection */}
          <div className="bg-white rounded-lg shadow p-6">
            <div className="flex items-center justify-between mb-4">
              <h2 className="text-lg font-semibold text-neutral-900">
                Available Voices
              </h2>
              <select
                value={providerFilter}
                onChange={(e) => setProviderFilter(e.target.value)}
                className="px-3 py-1.5 text-sm border border-neutral-300 rounded-md focus:ring-primary-500 focus:border-primary-500"
              >
                <option value="all">All Providers</option>
                <option value="openai">OpenAI</option>
                <option value="elevenlabs">ElevenLabs</option>
              </select>
            </div>

            {loading ? (
              <div className="text-center py-8 text-neutral-500">
                Loading voices...
              </div>
            ) : filteredVoices.length === 0 ? (
              <div className="text-center py-8 text-neutral-500">
                No voices available
              </div>
            ) : (
              <div className="space-y-3">
                {filteredVoices.map((voice) => (
                  <VoiceCard
                    key={voice.voice_id}
                    voice={voice}
                    isDefault={voice.voice_id === defaultVoiceId}
                    onSetDefault={() => handleSetDefaultVoice(voice)}
                  />
                ))}
              </div>
            )}
          </div>
        </div>
      )}

      {activeTab === "analytics" && (
        <div className="space-y-6">
          {/* ElevenLabs Usage */}
          {elevenlabsUsage && (
            <div className="bg-white rounded-lg shadow p-6">
              <h2 className="text-lg font-semibold text-neutral-900 mb-4">
                ElevenLabs Usage
              </h2>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                <UsageGauge
                  used={elevenlabsUsage.character_count}
                  limit={elevenlabsUsage.character_limit}
                  label="Characters Used"
                />
                <div className="space-y-4">
                  <div className="flex justify-between">
                    <span className="text-neutral-600">Voice Limit</span>
                    <span className="font-medium">
                      {elevenlabsUsage.voice_limit}
                    </span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-neutral-600">Pro Voices</span>
                    <span className="font-medium">
                      {elevenlabsUsage.professional_voice_limit}
                    </span>
                  </div>
                  {elevenlabsUsage.next_reset_at && (
                    <div className="flex justify-between">
                      <span className="text-neutral-600">Resets</span>
                      <span className="font-medium">
                        {new Date(
                          elevenlabsUsage.next_reset_at,
                        ).toLocaleDateString()}
                      </span>
                    </div>
                  )}
                </div>
              </div>
            </div>
          )}

          {/* Provider Stats */}
          <div className="bg-white rounded-lg shadow p-6">
            <h2 className="text-lg font-semibold text-neutral-900 mb-4">
              Provider Statistics
            </h2>
            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
              <div className="text-center p-4 bg-blue-50 rounded-lg">
                <p className="text-3xl font-bold text-blue-600">
                  {openaiVoices.length}
                </p>
                <p className="text-sm text-neutral-600">OpenAI Voices</p>
              </div>
              <div className="text-center p-4 bg-purple-50 rounded-lg">
                <p className="text-3xl font-bold text-purple-600">
                  {elevenlabsVoices.length}
                </p>
                <p className="text-sm text-neutral-600">ElevenLabs Voices</p>
              </div>
              <div className="text-center p-4 bg-green-50 rounded-lg">
                <p className="text-3xl font-bold text-green-600">
                  {voices.length}
                </p>
                <p className="text-sm text-neutral-600">Total Available</p>
              </div>
            </div>
          </div>

          {/* Note about voice metrics */}
          <div className="bg-neutral-50 rounded-lg p-6 border border-neutral-200">
            <p className="text-sm text-neutral-600">
              For detailed voice session metrics and latency analytics, visit
              the{" "}
              <a
                href="/admin/voice-metrics"
                className="text-primary-600 hover:underline"
              >
                Voice Health Dashboard
              </a>
              .
            </p>
          </div>
        </div>
      )}

      {activeTab === "features" && (
        <div className="space-y-6">
          {/* Voice Mode Features */}
          <div className="bg-white rounded-lg shadow p-6">
            <h2 className="text-lg font-semibold text-neutral-900 mb-4">
              Voice Mode Features
            </h2>
            <div className="divide-y divide-neutral-100">
              <FeatureFlagToggle
                label="Echo Detection"
                description="Enable local echo detection in AudioWorklet to suppress speaker feedback"
                enabled={featureFlags.echoDetectionEnabled}
                onChange={(enabled) =>
                  handleFeatureFlagChange("echoDetectionEnabled", enabled)
                }
                loading={savingFlags}
              />
              <FeatureFlagToggle
                label="Adaptive VAD"
                description="Automatically adjust silence detection based on user speech patterns"
                enabled={featureFlags.adaptiveVadEnabled}
                onChange={(enabled) =>
                  handleFeatureFlagChange("adaptiveVadEnabled", enabled)
                }
                loading={savingFlags}
              />
              <FeatureFlagToggle
                label="Barge-In Support"
                description="Allow users to interrupt AI responses by speaking"
                enabled={featureFlags.bargeInEnabled}
                onChange={(enabled) =>
                  handleFeatureFlagChange("bargeInEnabled", enabled)
                }
                loading={savingFlags}
              />
            </div>
          </div>

          {/* TTS Features */}
          <div className="bg-white rounded-lg shadow p-6">
            <h2 className="text-lg font-semibold text-neutral-900 mb-4">
              TTS Features
            </h2>
            <div className="divide-y divide-neutral-100">
              <FeatureFlagToggle
                label="ElevenLabs Integration"
                description="Enable ElevenLabs as an alternative TTS provider"
                enabled={featureFlags.elevenlabsEnabled}
                onChange={(enabled) =>
                  handleFeatureFlagChange("elevenlabsEnabled", enabled)
                }
                loading={savingFlags}
              />
              <FeatureFlagToggle
                label="Streaming TTS"
                description="Stream audio chunks for lower latency playback"
                enabled={featureFlags.streamingTtsEnabled}
                onChange={(enabled) =>
                  handleFeatureFlagChange("streamingTtsEnabled", enabled)
                }
                loading={savingFlags}
              />
            </div>
          </div>

          {/* Save Notice */}
          <div className="bg-neutral-50 rounded-lg p-4 border border-neutral-200">
            <p className="text-sm text-neutral-600">
              Feature flag changes are saved automatically and take effect
              immediately for new voice sessions. Existing sessions may need to
              be restarted.
            </p>
          </div>
        </div>
      )}
    </div>
  );
}

export default VoiceAdminPanel;
