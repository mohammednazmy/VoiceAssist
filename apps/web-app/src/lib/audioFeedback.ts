/**
 * Audio Feedback Utilities
 *
 * Provides audio acknowledgment tones and voice prompts for barge-in events.
 * Includes tone generation, speech synthesis, and cached audio playback.
 *
 * Phase 2: Instant Response & Feedback
 */

import type { SupportedLanguage } from "../hooks/useIntelligentBargeIn/types";

// ============================================================================
// Types
// ============================================================================

/**
 * Types of audio feedback events
 */
export type FeedbackType =
  | "detected"
  | "confirmed"
  | "backchannel"
  | "soft"
  | "hard"
  | "error"
  | "calibrationComplete";

/**
 * Language-specific voice prompt configuration
 */
interface VoicePromptConfig {
  text: string;
  rate: number;
  pitch: number;
}

// ============================================================================
// Audio Context
// ============================================================================

let audioContext: AudioContext | null = null;

/**
 * Get or create the audio context (lazy initialization)
 */
function getAudioContext(): AudioContext {
  if (!audioContext) {
    audioContext = new (window.AudioContext ||
      (window as unknown as { webkitAudioContext: typeof AudioContext })
        .webkitAudioContext)();
  }

  // Resume if suspended (autoplay policy)
  if (audioContext.state === "suspended") {
    audioContext.resume();
  }

  return audioContext;
}

// ============================================================================
// Tone Configuration
// ============================================================================

/**
 * Frequencies for each feedback type (in Hz)
 */
const TONE_FREQUENCIES: Record<FeedbackType, number> = {
  detected: 440, // A4 - neutral notification
  confirmed: 523.25, // C5 - positive confirmation
  backchannel: 329.63, // E4 - subtle acknowledgment
  soft: 392, // G4 - gentle pause
  hard: 587.33, // D5 - attention
  error: 293.66, // D4 - lower, warning
  calibrationComplete: 659.25, // E5 - success
};

/**
 * Duration for each feedback type (in ms)
 */
const TONE_DURATIONS: Record<FeedbackType, number> = {
  detected: 50,
  confirmed: 80,
  backchannel: 30,
  soft: 60,
  hard: 100,
  error: 150,
  calibrationComplete: 120,
};

/**
 * Wave type for each feedback (affects sound character)
 */
const TONE_WAVE_TYPES: Record<FeedbackType, OscillatorType> = {
  detected: "sine",
  confirmed: "sine",
  backchannel: "sine",
  soft: "sine",
  hard: "triangle",
  error: "sawtooth",
  calibrationComplete: "sine",
};

// ============================================================================
// Tone Generation
// ============================================================================

/**
 * Play an audio feedback tone
 *
 * @param type - Type of feedback event
 * @param volume - Volume level (0-1, default 0.3)
 */
export function playAudioFeedback(
  type: FeedbackType,
  volume: number = 0.3,
): void {
  try {
    const ctx = getAudioContext();

    const oscillator = ctx.createOscillator();
    const gainNode = ctx.createGain();

    oscillator.connect(gainNode);
    gainNode.connect(ctx.destination);

    oscillator.frequency.value = TONE_FREQUENCIES[type];
    oscillator.type = TONE_WAVE_TYPES[type];

    const duration = TONE_DURATIONS[type] / 1000;

    // Set initial volume
    gainNode.gain.setValueAtTime(volume, ctx.currentTime);

    // Fade out to prevent clicking
    gainNode.gain.exponentialRampToValueAtTime(
      0.001,
      ctx.currentTime + duration,
    );

    oscillator.start(ctx.currentTime);
    oscillator.stop(ctx.currentTime + duration);
  } catch (error) {
    console.warn("[audioFeedback] Failed to play tone:", error);
  }
}

/**
 * Play a multi-tone sequence for special events
 */
export function playToneSequence(
  frequencies: number[],
  duration: number = 100,
  gap: number = 50,
  volume: number = 0.3,
): void {
  try {
    const ctx = getAudioContext();
    let startTime = ctx.currentTime;

    frequencies.forEach((freq) => {
      const oscillator = ctx.createOscillator();
      const gainNode = ctx.createGain();

      oscillator.connect(gainNode);
      gainNode.connect(ctx.destination);

      oscillator.frequency.value = freq;
      oscillator.type = "sine";

      const toneDuration = duration / 1000;
      gainNode.gain.setValueAtTime(volume, startTime);
      gainNode.gain.exponentialRampToValueAtTime(
        0.001,
        startTime + toneDuration,
      );

      oscillator.start(startTime);
      oscillator.stop(startTime + toneDuration);

      startTime += (duration + gap) / 1000;
    });
  } catch (error) {
    console.warn("[audioFeedback] Failed to play tone sequence:", error);
  }
}

// ============================================================================
// Speech Synthesis
// ============================================================================

/**
 * Language-specific default prompts for hard barge-in
 */
const VOICE_PROMPTS: Record<SupportedLanguage, VoicePromptConfig> = {
  en: { text: "I'm listening", rate: 1.1, pitch: 1.0 },
  ar: { text: "أنا أستمع", rate: 1.0, pitch: 1.0 },
  es: { text: "Te escucho", rate: 1.1, pitch: 1.0 },
  fr: { text: "Je vous écoute", rate: 1.1, pitch: 1.0 },
  de: { text: "Ich höre zu", rate: 1.0, pitch: 1.0 },
  zh: { text: "我在听", rate: 1.0, pitch: 1.0 },
  ja: { text: "聞いています", rate: 1.0, pitch: 1.0 },
  ko: { text: "듣고 있어요", rate: 1.0, pitch: 1.0 },
  pt: { text: "Estou ouvindo", rate: 1.1, pitch: 1.0 },
  ru: { text: "Я слушаю", rate: 1.0, pitch: 1.0 },
  hi: { text: "मैं सुन रहा हूं", rate: 1.0, pitch: 1.0 },
  tr: { text: "Dinliyorum", rate: 1.0, pitch: 1.0 },
};

/**
 * Speak a text prompt using Web Speech API
 *
 * @param text - Text to speak
 * @param language - Language code (e.g., "en-US")
 */
export function speakPrompt(
  text: string,
  language: SupportedLanguage = "en",
): void {
  if (typeof window === "undefined" || !window.speechSynthesis) {
    console.warn("[audioFeedback] Speech synthesis not available");
    return;
  }

  // Cancel any ongoing speech
  window.speechSynthesis.cancel();

  const config = VOICE_PROMPTS[language] || VOICE_PROMPTS.en;
  const utterance = new SpeechSynthesisUtterance(text || config.text);

  // Set language code
  utterance.lang = getLanguageCode(language);
  utterance.rate = config.rate;
  utterance.pitch = config.pitch;
  utterance.volume = 0.8;

  window.speechSynthesis.speak(utterance);
}

/**
 * Get the full language code for speech synthesis
 */
function getLanguageCode(lang: SupportedLanguage): string {
  const codes: Record<SupportedLanguage, string> = {
    en: "en-US",
    ar: "ar-SA",
    es: "es-ES",
    fr: "fr-FR",
    de: "de-DE",
    zh: "zh-CN",
    ja: "ja-JP",
    ko: "ko-KR",
    pt: "pt-BR",
    ru: "ru-RU",
    hi: "hi-IN",
    tr: "tr-TR",
  };
  return codes[lang] || "en-US";
}

/**
 * Get the default voice prompt for a language
 */
export function getDefaultVoicePrompt(language: SupportedLanguage): string {
  return VOICE_PROMPTS[language]?.text || VOICE_PROMPTS.en.text;
}

// ============================================================================
// Cached Audio Playback
// ============================================================================

/**
 * Cache for pre-loaded audio buffers
 */
const audioBufferCache = new Map<string, AudioBuffer>();

/**
 * Preload an audio file for faster playback
 *
 * @param url - URL of the audio file
 * @param key - Cache key for retrieval
 */
export async function preloadAudio(url: string, key: string): Promise<void> {
  if (audioBufferCache.has(key)) return;

  try {
    const ctx = getAudioContext();
    const response = await fetch(url);
    const arrayBuffer = await response.arrayBuffer();
    const audioBuffer = await ctx.decodeAudioData(arrayBuffer);
    audioBufferCache.set(key, audioBuffer);
  } catch (error) {
    console.warn(`[audioFeedback] Failed to preload audio: ${key}`, error);
  }
}

/**
 * Play a cached audio buffer
 *
 * @param key - Cache key of the preloaded audio
 * @returns Whether playback was successful
 */
export function playCachedAudio(key: string): boolean {
  const buffer = audioBufferCache.get(key);
  if (!buffer) return false;

  try {
    const ctx = getAudioContext();
    const source = ctx.createBufferSource();
    source.buffer = buffer;
    source.connect(ctx.destination);
    source.start(0);
    return true;
  } catch (error) {
    console.warn(`[audioFeedback] Failed to play cached audio: ${key}`, error);
    return false;
  }
}

/**
 * Clear the audio cache
 */
export function clearAudioCache(): void {
  audioBufferCache.clear();
}

// ============================================================================
// Cleanup
// ============================================================================

/**
 * Close the audio context and release resources
 */
export async function closeAudioContext(): Promise<void> {
  if (audioContext && audioContext.state !== "closed") {
    await audioContext.close();
    audioContext = null;
  }
}
