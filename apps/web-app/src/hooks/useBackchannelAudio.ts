/**
 * useBackchannelAudio Hook
 *
 * Plays backchannel audio clips (e.g., "uh-huh", "I see") during conversations.
 * These are short audio clips that indicate active listening.
 *
 * Phase: Voice Mode Intelligence Enhancement - Phase 2
 */

import { useRef, useCallback, useState } from "react";
import type { TTBackchannelEvent } from "./useThinkerTalkerSession";
import { voiceLog } from "../lib/logger";

interface UseBackchannelAudioOptions {
  /** Volume level (0-1) */
  volume?: number;
  /** Whether backchanneling is enabled */
  enabled?: boolean;
  /** Callback when backchannel starts playing */
  onPlayStart?: (phrase: string) => void;
  /** Callback when backchannel finishes */
  onPlayEnd?: (phrase: string) => void;
}

interface UseBackchannelAudioReturn {
  /** Play a backchannel audio clip */
  playBackchannel: (event: TTBackchannelEvent) => Promise<void>;
  /** Stop any currently playing backchannel */
  stopBackchannel: () => void;
  /** Whether a backchannel is currently playing */
  isPlaying: boolean;
  /** Currently playing phrase */
  currentPhrase: string | null;
  /** Set volume */
  setVolume: (volume: number) => void;
  /** Enable/disable backchanneling */
  setEnabled: (enabled: boolean) => void;
}

export const useBackchannelAudio = (
  options: UseBackchannelAudioOptions = {},
): UseBackchannelAudioReturn => {
  const { volume = 0.6, enabled = true, onPlayStart, onPlayEnd } = options;

  const audioContextRef = useRef<AudioContext | null>(null);
  const gainNodeRef = useRef<GainNode | null>(null);
  const currentSourceRef = useRef<AudioBufferSourceNode | null>(null);

  const [isPlaying, setIsPlaying] = useState(false);
  const [currentPhrase, setCurrentPhrase] = useState<string | null>(null);
  const [isEnabled, setIsEnabled] = useState(enabled);
  const [currentVolume, setCurrentVolume] = useState(volume);

  // Initialize AudioContext lazily
  const getAudioContext = useCallback(() => {
    if (!audioContextRef.current) {
      audioContextRef.current = new (
        window.AudioContext ||
        (window as unknown as { webkitAudioContext: typeof AudioContext })
          .webkitAudioContext
      )();

      // Create gain node for volume control
      gainNodeRef.current = audioContextRef.current.createGain();
      gainNodeRef.current.gain.value = currentVolume;
      gainNodeRef.current.connect(audioContextRef.current.destination);
    }
    return audioContextRef.current;
  }, [currentVolume]);

  // Convert base64 audio to AudioBuffer
  const decodeAudio = useCallback(
    async (base64Audio: string, format: string): Promise<AudioBuffer> => {
      const ctx = getAudioContext();

      // Decode base64 to binary
      const binaryString = atob(base64Audio);
      const bytes = new Uint8Array(binaryString.length);
      for (let i = 0; i < binaryString.length; i++) {
        bytes[i] = binaryString.charCodeAt(i);
      }

      // For PCM format, we need to wrap it in a WAV header
      let audioData: ArrayBuffer;
      if (format.startsWith("pcm_")) {
        // Extract sample rate from format (e.g., "pcm_24000" -> 24000)
        const sampleRate = parseInt(format.split("_")[1]) || 24000;
        audioData = createWavFromPCM(bytes.buffer, sampleRate);
      } else {
        audioData = bytes.buffer;
      }

      return ctx.decodeAudioData(audioData);
    },
    [getAudioContext],
  );

  // Create WAV file from raw PCM data
  const createWavFromPCM = (
    pcmData: ArrayBuffer,
    sampleRate: number,
  ): ArrayBuffer => {
    const numChannels = 1;
    const bitsPerSample = 16;
    const bytesPerSample = bitsPerSample / 8;
    const blockAlign = numChannels * bytesPerSample;
    const byteRate = sampleRate * blockAlign;
    const dataLength = pcmData.byteLength;
    const headerLength = 44;
    const totalLength = headerLength + dataLength;

    const buffer = new ArrayBuffer(totalLength);
    const view = new DataView(buffer);

    // RIFF header
    writeString(view, 0, "RIFF");
    view.setUint32(4, totalLength - 8, true);
    writeString(view, 8, "WAVE");

    // fmt subchunk
    writeString(view, 12, "fmt ");
    view.setUint32(16, 16, true); // Subchunk1Size
    view.setUint16(20, 1, true); // AudioFormat (PCM)
    view.setUint16(22, numChannels, true);
    view.setUint32(24, sampleRate, true);
    view.setUint32(28, byteRate, true);
    view.setUint16(32, blockAlign, true);
    view.setUint16(34, bitsPerSample, true);

    // data subchunk
    writeString(view, 36, "data");
    view.setUint32(40, dataLength, true);

    // Copy PCM data
    const pcmView = new Uint8Array(pcmData);
    const wavData = new Uint8Array(buffer);
    wavData.set(pcmView, headerLength);

    return buffer;
  };

  const writeString = (view: DataView, offset: number, str: string) => {
    for (let i = 0; i < str.length; i++) {
      view.setUint8(offset + i, str.charCodeAt(i));
    }
  };

  // Play backchannel audio
  const playBackchannel = useCallback(
    async (event: TTBackchannelEvent): Promise<void> => {
      if (!isEnabled) {
        voiceLog.debug("[Backchannel] Disabled, skipping:", event.phrase);
        return;
      }

      if (!event.audio) {
        voiceLog.warn("[Backchannel] No audio data for:", event.phrase);
        return;
      }

      try {
        // Stop any currently playing backchannel
        if (currentSourceRef.current) {
          currentSourceRef.current.stop();
          currentSourceRef.current = null;
        }

        const ctx = getAudioContext();

        // Resume if suspended (autoplay policy)
        if (ctx.state === "suspended") {
          await ctx.resume();
        }

        // Decode audio
        const audioBuffer = await decodeAudio(event.audio, event.format);

        // Create source
        const source = ctx.createBufferSource();
        source.buffer = audioBuffer;
        source.connect(gainNodeRef.current!);

        // Track state
        setIsPlaying(true);
        setCurrentPhrase(event.phrase);
        currentSourceRef.current = source;

        onPlayStart?.(event.phrase);
        voiceLog.debug(
          `[Backchannel] Playing: "${event.phrase}" (${event.duration_ms}ms)`,
        );

        // Handle playback end
        source.onended = () => {
          setIsPlaying(false);
          setCurrentPhrase(null);
          currentSourceRef.current = null;
          onPlayEnd?.(event.phrase);
        };

        // Start playback
        source.start(0);
      } catch (err) {
        voiceLog.error("[Backchannel] Playback error:", err);
        setIsPlaying(false);
        setCurrentPhrase(null);
      }
    },
    [isEnabled, getAudioContext, decodeAudio, onPlayStart, onPlayEnd],
  );

  // Stop current backchannel
  const stopBackchannel = useCallback(() => {
    if (currentSourceRef.current) {
      try {
        currentSourceRef.current.stop();
      } catch {
        // Ignore errors if already stopped
      }
      currentSourceRef.current = null;
    }
    setIsPlaying(false);
    setCurrentPhrase(null);
  }, []);

  // Set volume
  const setVolume = useCallback((vol: number) => {
    const clampedVolume = Math.max(0, Math.min(1, vol));
    setCurrentVolume(clampedVolume);
    if (gainNodeRef.current) {
      gainNodeRef.current.gain.value = clampedVolume;
    }
  }, []);

  // Enable/disable
  const setEnabled = useCallback(
    (enabled: boolean) => {
      setIsEnabled(enabled);
      if (!enabled) {
        stopBackchannel();
      }
    },
    [stopBackchannel],
  );

  return {
    playBackchannel,
    stopBackchannel,
    isPlaying,
    currentPhrase,
    setVolume,
    setEnabled,
  };
};

export default useBackchannelAudio;
