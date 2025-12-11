/**
 * Voice Feature Flags Debug Helper
 *
 * Exposes a small helper on `window.__voiceFlagsDebug` so developers can
 * quickly see, per-origin, which voice-related feature flags the client
 * believes are active and where each value comes from (local override,
 * env, or backend).
 *
 * This is intended for local/dev use only and is only installed when
 * running on localhost.
 */

import { experimentService } from "../services/experiments";

type VoiceFlagSource = "localStorage" | "env" | "backend" | "unknown";

interface VoiceFlagDebugEntry {
  key: string;
  effective: unknown;
  source: VoiceFlagSource;
  localOverride: string | null;
  rawBackendFlag?: unknown;
  notes?: string;
}

interface VoiceFlagsDebugHelper {
  /** List of voice-related flags this helper inspects */
  readonly voiceFlagKeys: readonly string[];
  /** Refresh and return the current debug snapshot */
  refresh(): Promise<Record<string, VoiceFlagDebugEntry>>;
  /** Convenience helper to log a compact table to the console */
  print(): Promise<void>;
}

// Backend voice flags that materially affect Thinker/Talker behavior.
// This list is intentionally small and focused on flags you are likely
// to tweak during voice labs and tuning sessions.
const BACKEND_VOICE_FLAGS = [
  "backend.voice_silero_vad_enabled",
  "backend.voice_silero_echo_suppression_mode",
  "backend.voice_silero_positive_threshold",
  "backend.voice_silero_playback_threshold_boost",
  "backend.voice_silero_min_speech_ms",
  "backend.voice_silero_playback_min_speech_ms",
  "backend.voice_silero_vad_confidence_sharing",
  "backend.voice_barge_in_quality_preset",
  "backend.voice_aec_capability_tuning",
  "backend.voice_v4_audio_processing",
  "backend.voice_instant_barge_in",
  "backend.voice_barge_in_killswitch",
] as const;

// UI / experiment flag that controls unified chat/voice UI.
const UNIFIED_UI_FLAG_KEY = "unified_chat_voice_ui";

const getApiBaseUrl = (): string => {
  // Use VITE_API_URL when available (dev server); otherwise fall back to
  // relative paths so the helper works behind the frontend gateway.
  if (typeof import.meta !== "undefined" && import.meta.env?.VITE_API_URL) {
    return import.meta.env.VITE_API_URL;
  }
  return "";
};

const getAdminFlagUrl = (flagName: string): string => {
  const base = getApiBaseUrl();
  return `${base}/api/admin/feature-flags/${encodeURIComponent(flagName)}`;
};

const getLocalOverride = (flagKey: string): string | null => {
  if (typeof localStorage === "undefined") return null;
  try {
    return localStorage.getItem(`ff_${flagKey}`);
  } catch {
    return null;
  }
};

const fetchBackendFlag = async (
  flagName: string,
): Promise<unknown | null> => {
  try {
    const response = await fetch(getAdminFlagUrl(flagName), {
      method: "GET",
      headers: { "Content-Type": "application/json" },
      credentials: "include",
    });
    if (!response.ok) {
      console.warn(
        "[VoiceFlagsDebug] Failed to fetch backend flag",
        flagName,
        "status=",
        response.status,
      );
      return null;
    }
    return await response.json();
  } catch (error) {
    console.warn(
      "[VoiceFlagsDebug] Error fetching backend flag",
      flagName,
      error,
    );
    return null;
  }
};

const buildUnifiedUiDebugEntry = async (): Promise<VoiceFlagDebugEntry> => {
  const localOverride = getLocalOverride(UNIFIED_UI_FLAG_KEY);
  const envValue =
    typeof import.meta !== "undefined"
      ? import.meta.env?.VITE_UNIFIED_UI
      : undefined;

  let effective = false;
  let source: VoiceFlagSource = "unknown";

  // Try to infer the same resolution order as ExperimentService.isFeatureEnabled
  if (localOverride === "true" || localOverride === "false") {
    effective = localOverride === "true";
    source = "localStorage";
  } else if (envValue === "true" || envValue === "false") {
    effective = envValue === "true";
    source = "env";
  } else {
    try {
      effective = await experimentService.isFeatureEnabled(UNIFIED_UI_FLAG_KEY);
      source = "backend";
    } catch (error) {
      console.warn(
        "[VoiceFlagsDebug] Failed to evaluate unified_chat_voice_ui via experimentService",
        error,
      );
      effective = false;
      source = "unknown";
    }
  }

  return {
    key: UNIFIED_UI_FLAG_KEY,
    effective,
    source,
    localOverride,
    notes:
      "UI flag controlling unified chat/voice layout; resolution: localStorage → env → backend experiments",
  };
};

const buildBackendVoiceEntry = async (
  flagName: string,
): Promise<VoiceFlagDebugEntry> => {
  const localOverride = getLocalOverride(flagName);

  // For backend.* flags, the web app reads values directly via the admin
  // feature-flags API. Local overrides are rarely used in practice, but
  // we still surface them if present.
  const rawBackendFlag = await fetchBackendFlag(flagName);

  let effective: unknown = null;
  let source: VoiceFlagSource = "backend";

  if (localOverride !== null) {
    // We don't attempt to parse non-boolean overrides here; this is a
    // debug helper, so simply echo the raw string value.
    effective = localOverride;
    source = "localStorage";
  } else if (rawBackendFlag && typeof rawBackendFlag === "object") {
    const anyFlag = rawBackendFlag as {
      enabled?: boolean;
      value?: unknown;
      metadata?: Record<string, unknown>;
    };

    if (Object.prototype.hasOwnProperty.call(anyFlag, "value")) {
      effective = anyFlag.value;
    } else if (Object.prototype.hasOwnProperty.call(anyFlag, "enabled")) {
      effective = anyFlag.enabled;
    } else {
      effective = anyFlag;
    }

    source = "backend";
  } else {
    effective = null;
    source = "unknown";
  }

  return {
    key: flagName,
    effective,
    source,
    localOverride,
    rawBackendFlag,
  };
};

export function installVoiceFlagsDebugHelper(): void {
  if (typeof window === "undefined") return;

  // Only install on localhost to avoid leaking internal helpers in
  // hosted environments.
  if (window.location.hostname !== "localhost") {
    return;
  }

  const helper: VoiceFlagsDebugHelper = {
    voiceFlagKeys: BACKEND_VOICE_FLAGS,

    async refresh() {
      const entries: Record<string, VoiceFlagDebugEntry> = {};

      // Unified UI flag (experiments / env-driven)
      entries[UNIFIED_UI_FLAG_KEY] = await buildUnifiedUiDebugEntry();

      // Backend voice flags (admin feature-flags API)
      for (const name of BACKEND_VOICE_FLAGS) {
        entries[name] = await buildBackendVoiceEntry(name);
      }

      return entries;
    },

    async print() {
      const snapshot = await this.refresh();
      const rows = Object.values(snapshot).map((entry) => ({
        key: entry.key,
        effective: entry.effective,
        source: entry.source,
        localOverride: entry.localOverride,
      }));
      // eslint-disable-next-line no-console
      console.table(rows);
    },
  };

  (window as unknown as { __voiceFlagsDebug?: VoiceFlagsDebugHelper })
    .__voiceFlagsDebug = helper;

  // eslint-disable-next-line no-console
  console.info(
    "[VoiceFlagsDebug] Helper installed on window.__voiceFlagsDebug. " +
      "Call __voiceFlagsDebug.print() or __voiceFlagsDebug.refresh() in the console.",
  );
}

