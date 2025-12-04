/**
 * Barge-In Prompt Audio Hook
 *
 * Pre-caches and plays barge-in prompt audio using ElevenLabs TTS
 * instead of the browser's native speech synthesis.
 *
 * This ensures the barge-in "I'm listening" prompt uses the same
 * voice as the main AI responses for a consistent experience.
 *
 * Fix for: Dual voice issue where browser TTS used a different voice
 */

import { useCallback, useEffect, useRef, useState } from "react";
import type { SupportedLanguage } from "./useIntelligentBargeIn/types";
import { voiceLog } from "../lib/logger";

// ============================================================================
// Types
// ============================================================================

export interface BargeInPromptAudioOptions {
  /** ElevenLabs voice ID to use for TTS */
  voiceId?: string;
  /** Language code for prompts */
  language?: SupportedLanguage;
  /** TTS provider (default: elevenlabs) */
  provider?: "openai" | "elevenlabs";
  /** Whether to auto-preload prompts on mount */
  autoPreload?: boolean;
  /** API base URL (defaults to window.location.origin) */
  apiBaseUrl?: string;
  /** Function to get auth token */
  getAccessToken?: () => string | null;
  /** Volume for playback (0-1) */
  volume?: number;
}

export interface BargeInPromptAudioReturn {
  /** Play a prompt (uses cached audio if available) */
  playPrompt: (text?: string) => Promise<void>;
  /** Preload prompts for a language */
  preloadPrompts: () => Promise<void>;
  /** Whether prompts are being preloaded */
  isPreloading: boolean;
  /** Whether prompts are ready to play */
  isReady: boolean;
  /** Stop any currently playing audio */
  stop: () => void;
  /** Clear the audio cache */
  clearCache: () => void;
}

// ============================================================================
// Constants
// ============================================================================

/**
 * Default prompts for each supported language
 */
const DEFAULT_PROMPTS: Record<SupportedLanguage, string> = {
  en: "I'm listening",
  ar: "أنا أستمع",
  es: "Te escucho",
  fr: "Je vous écoute",
  de: "Ich höre zu",
  zh: "我在听",
  ja: "聞いています",
  ko: "듣고 있어요",
  pt: "Estou ouvindo",
  ru: "Я слушаю",
  hi: "मैं सुन रहा हूं",
  tr: "Dinliyorum",
};

// ============================================================================
// Hook Implementation
// ============================================================================

export function useBargeInPromptAudio(
  options: BargeInPromptAudioOptions = {},
): BargeInPromptAudioReturn {
  const {
    voiceId,
    language = "en",
    provider = "elevenlabs",
    autoPreload = true,
    apiBaseUrl = typeof window !== "undefined" ? window.location.origin : "",
    getAccessToken,
    volume = 0.8,
  } = options;

  // State
  const [isPreloading, setIsPreloading] = useState(false);
  const [isReady, setIsReady] = useState(false);

  // Refs
  const audioCacheRef = useRef<Map<string, AudioBuffer>>(new Map());
  const audioContextRef = useRef<AudioContext | null>(null);
  const currentSourceRef = useRef<AudioBufferSourceNode | null>(null);
  const gainNodeRef = useRef<GainNode | null>(null);

  /**
   * Get or create AudioContext
   */
  const getAudioContext = useCallback((): AudioContext => {
    if (!audioContextRef.current) {
      audioContextRef.current = new (
        window.AudioContext ||
        (window as unknown as { webkitAudioContext: typeof AudioContext })
          .webkitAudioContext
      )();
    }

    // Resume if suspended (autoplay policy)
    if (audioContextRef.current.state === "suspended") {
      audioContextRef.current.resume();
    }

    return audioContextRef.current;
  }, []);

  /**
   * Generate cache key for a prompt
   */
  const getCacheKey = useCallback(
    (text: string): string => {
      return `${voiceId || "default"}_${language}_${provider}_${text}`;
    },
    [voiceId, language, provider],
  );

  /**
   * Fetch TTS audio from backend
   */
  const fetchTTSAudio = useCallback(
    async (text: string): Promise<ArrayBuffer> => {
      const token = getAccessToken?.();
      const url = `${apiBaseUrl}/api/voice/synthesize`;

      const response = await fetch(url, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          ...(token ? { Authorization: `Bearer ${token}` } : {}),
        },
        body: JSON.stringify({
          text,
          voiceId,
          provider,
        }),
      });

      if (!response.ok) {
        throw new Error(
          `TTS request failed: ${response.status} ${response.statusText}`,
        );
      }

      return response.arrayBuffer();
    },
    [apiBaseUrl, voiceId, provider, getAccessToken],
  );

  /**
   * Preload a single prompt
   */
  const preloadPrompt = useCallback(
    async (text: string): Promise<void> => {
      const cacheKey = getCacheKey(text);

      // Skip if already cached
      if (audioCacheRef.current.has(cacheKey)) {
        return;
      }

      try {
        const audioData = await fetchTTSAudio(text);
        const ctx = getAudioContext();
        const audioBuffer = await ctx.decodeAudioData(audioData);
        audioCacheRef.current.set(cacheKey, audioBuffer);
        voiceLog.debug(`[BargeInAudio] Preloaded prompt: "${text}"`);
      } catch (error) {
        voiceLog.warn(
          `[BargeInAudio] Failed to preload prompt: "${text}"`,
          error,
        );
      }
    },
    [getCacheKey, fetchTTSAudio, getAudioContext],
  );

  /**
   * Preload all prompts for current language
   */
  const preloadPrompts = useCallback(async (): Promise<void> => {
    if (!voiceId) {
      voiceLog.debug("[BargeInAudio] No voice ID, skipping preload");
      return;
    }

    setIsPreloading(true);
    setIsReady(false);

    try {
      const defaultPrompt = DEFAULT_PROMPTS[language] || DEFAULT_PROMPTS.en;
      await preloadPrompt(defaultPrompt);
      setIsReady(true);
      voiceLog.info("[BargeInAudio] Prompts preloaded successfully");
    } catch (error) {
      voiceLog.error("[BargeInAudio] Failed to preload prompts", error);
    } finally {
      setIsPreloading(false);
    }
  }, [voiceId, language, preloadPrompt]);

  /**
   * Stop currently playing audio
   */
  const stop = useCallback((): void => {
    if (currentSourceRef.current) {
      try {
        currentSourceRef.current.stop();
      } catch {
        // Ignore errors if already stopped
      }
      currentSourceRef.current = null;
    }
  }, []);

  /**
   * Play a prompt
   */
  const playPrompt = useCallback(
    async (text?: string): Promise<void> => {
      const promptText =
        text || DEFAULT_PROMPTS[language] || DEFAULT_PROMPTS.en;
      const cacheKey = getCacheKey(promptText);

      // Stop any currently playing audio
      stop();

      try {
        const ctx = getAudioContext();

        // Check cache first
        let audioBuffer = audioCacheRef.current.get(cacheKey);

        // If not cached, fetch on-demand
        if (!audioBuffer) {
          voiceLog.debug(
            `[BargeInAudio] Cache miss, fetching: "${promptText}"`,
          );
          const audioData = await fetchTTSAudio(promptText);
          audioBuffer = await ctx.decodeAudioData(audioData);
          audioCacheRef.current.set(cacheKey, audioBuffer);
        }

        // Create audio nodes
        const source = ctx.createBufferSource();
        source.buffer = audioBuffer;

        // Create gain node for volume control
        if (!gainNodeRef.current) {
          gainNodeRef.current = ctx.createGain();
          gainNodeRef.current.connect(ctx.destination);
        }
        gainNodeRef.current.gain.value = volume;

        source.connect(gainNodeRef.current);
        currentSourceRef.current = source;

        // Play
        source.start(0);
        voiceLog.debug(`[BargeInAudio] Playing prompt: "${promptText}"`);

        // Clean up when finished
        source.onended = () => {
          if (currentSourceRef.current === source) {
            currentSourceRef.current = null;
          }
        };
      } catch (error) {
        voiceLog.error(
          `[BargeInAudio] Failed to play prompt: "${promptText}"`,
          error,
        );

        // Fallback to browser speech synthesis if ElevenLabs fails
        voiceLog.warn("[BargeInAudio] Falling back to browser TTS");
        if (typeof window !== "undefined" && window.speechSynthesis) {
          const utterance = new SpeechSynthesisUtterance(promptText);
          utterance.volume = volume;
          window.speechSynthesis.speak(utterance);
        }
      }
    },
    [language, getCacheKey, stop, getAudioContext, fetchTTSAudio, volume],
  );

  /**
   * Clear the audio cache
   */
  const clearCache = useCallback((): void => {
    audioCacheRef.current.clear();
    setIsReady(false);
    voiceLog.debug("[BargeInAudio] Cache cleared");
  }, []);

  // Auto-preload on mount or when voice changes
  useEffect(() => {
    if (autoPreload && voiceId) {
      preloadPrompts();
    }
  }, [autoPreload, voiceId, language, preloadPrompts]);

  // Cleanup on unmount
  useEffect(() => {
    return () => {
      stop();
      if (
        audioContextRef.current &&
        audioContextRef.current.state !== "closed"
      ) {
        audioContextRef.current.close();
      }
    };
  }, [stop]);

  return {
    playPrompt,
    preloadPrompts,
    isPreloading,
    isReady,
    stop,
    clearCache,
  };
}

export default useBargeInPromptAudio;
