/**
 * Voice Preferences Sync Hook
 * Handles loading and saving voice preferences to/from the backend API.
 *
 * Voice Mode Overhaul: Backend persistence for user voice settings.
 */

import { useCallback, useEffect, useRef } from "react";
import { useAuth } from "./useAuth";
import {
  useVoiceSettingsStore,
  type BackendVoicePreferences,
} from "../stores/voiceSettingsStore";

// Debounce delay for saving preferences (ms)
const SAVE_DEBOUNCE_MS = 1000;

/**
 * Hook to sync voice preferences with the backend API.
 *
 * - Loads preferences from backend on mount
 * - Saves changes to backend with debouncing
 * - Falls back to local storage if API fails
 */
export function useVoicePreferencesSync() {
  const { apiClient, isAuthenticated } = useAuth();
  const saveTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const isLoadingRef = useRef(false);

  const {
    ttsProvider,
    voice,
    elevenlabsVoiceId,
    playbackSpeed,
    stability,
    similarityBoost,
    style,
    speakerBoost,
    autoPlayInVoiceMode,
    contextAwareStyle,
    language,
    backendPrefsId,
    syncFromBackend,
    setBackendPrefsId,
    setLastSyncedAt,
  } = useVoiceSettingsStore();

  /**
   * Load preferences from backend
   */
  const loadPreferences = useCallback(async () => {
    if (!isAuthenticated || !apiClient || isLoadingRef.current) return;

    isLoadingRef.current = true;
    try {
      const response = await apiClient.get<BackendVoicePreferences>(
        "/api/voice/preferences",
      );
      if (response.data) {
        syncFromBackend(response.data);
        console.log("[VoicePrefs] Loaded preferences from backend");
      }
    } catch (error) {
      console.warn("[VoicePrefs] Failed to load preferences:", error);
      // Continue using local storage values
    } finally {
      isLoadingRef.current = false;
    }
  }, [isAuthenticated, apiClient, syncFromBackend]);

  /**
   * Save preferences to backend
   */
  const savePreferences = useCallback(async () => {
    if (!isAuthenticated || !apiClient) return;

    try {
      const payload = {
        tts_provider: ttsProvider,
        openai_voice_id: voice,
        elevenlabs_voice_id: elevenlabsVoiceId,
        speech_rate: playbackSpeed,
        stability,
        similarity_boost: similarityBoost,
        style,
        speaker_boost: speakerBoost,
        auto_play: autoPlayInVoiceMode,
        context_aware_style: contextAwareStyle,
        preferred_language: language,
      };

      const response = await apiClient.put<BackendVoicePreferences>(
        "/api/voice/preferences",
        payload,
      );

      if (response.data) {
        setBackendPrefsId(response.data.id);
        setLastSyncedAt(Date.now());
        console.log("[VoicePrefs] Saved preferences to backend");
      }
    } catch (error) {
      console.warn("[VoicePrefs] Failed to save preferences:", error);
      // Local storage will preserve the values
    }
  }, [
    isAuthenticated,
    apiClient,
    ttsProvider,
    voice,
    elevenlabsVoiceId,
    playbackSpeed,
    stability,
    similarityBoost,
    style,
    speakerBoost,
    autoPlayInVoiceMode,
    contextAwareStyle,
    language,
    setBackendPrefsId,
    setLastSyncedAt,
  ]);

  /**
   * Debounced save - waits for changes to settle before saving
   */
  const debouncedSave = useCallback(() => {
    if (saveTimeoutRef.current) {
      clearTimeout(saveTimeoutRef.current);
    }
    saveTimeoutRef.current = setTimeout(() => {
      savePreferences();
    }, SAVE_DEBOUNCE_MS);
  }, [savePreferences]);

  /**
   * Reset preferences to defaults (backend and local)
   */
  const resetPreferences = useCallback(async () => {
    if (!isAuthenticated || !apiClient) {
      useVoiceSettingsStore.getState().reset();
      return;
    }

    try {
      const response = await apiClient.post<BackendVoicePreferences>(
        "/api/voice/preferences/reset",
      );
      if (response.data) {
        syncFromBackend(response.data);
        console.log("[VoicePrefs] Reset preferences to defaults");
      }
    } catch (error) {
      console.warn("[VoicePrefs] Failed to reset preferences:", error);
      useVoiceSettingsStore.getState().reset();
    }
  }, [isAuthenticated, apiClient, syncFromBackend]);

  // Load preferences on mount when authenticated
  useEffect(() => {
    if (isAuthenticated) {
      loadPreferences();
    }
  }, [isAuthenticated, loadPreferences]);

  // Save preferences when they change (debounced)
  useEffect(() => {
    // Skip if we're currently loading or haven't loaded yet
    if (isLoadingRef.current || !backendPrefsId) return;

    debouncedSave();

    return () => {
      if (saveTimeoutRef.current) {
        clearTimeout(saveTimeoutRef.current);
      }
    };
  }, [
    ttsProvider,
    voice,
    elevenlabsVoiceId,
    playbackSpeed,
    stability,
    similarityBoost,
    style,
    speakerBoost,
    autoPlayInVoiceMode,
    contextAwareStyle,
    language,
    backendPrefsId,
    debouncedSave,
  ]);

  return {
    loadPreferences,
    savePreferences,
    resetPreferences,
    isLoading: isLoadingRef.current,
  };
}

/**
 * Hook to get available voice style presets
 */
export function useVoiceStylePresets() {
  const { apiClient, isAuthenticated } = useAuth();

  const fetchPresets = useCallback(async () => {
    if (!isAuthenticated || !apiClient) return null;

    try {
      const response = await apiClient.get<{
        presets: Record<
          string,
          {
            context: string;
            stability: number;
            similarity_boost: number;
            style: number;
            speech_rate: number;
          }
        >;
      }>("/api/voice/style-presets");
      return response.data?.presets ?? null;
    } catch (error) {
      console.warn("[VoicePrefs] Failed to fetch style presets:", error);
      return null;
    }
  }, [isAuthenticated, apiClient]);

  return { fetchPresets };
}
