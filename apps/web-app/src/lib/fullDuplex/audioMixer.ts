/**
 * Audio Mixer
 *
 * Mixes user and AI audio streams with volume control,
 * ducking, and sidetone for full duplex operation.
 *
 * Phase 6: Full Duplex Experience
 */

import type { MixerState, FullDuplexConfig } from "./types";
import { DEFAULT_MIXER_STATE, DEFAULT_FULL_DUPLEX_CONFIG } from "./types";

// ============================================================================
// Audio Mixer
// ============================================================================

/**
 * Mixes multiple audio streams with volume control and ducking
 */
export class AudioMixer {
  private state: MixerState;
  private config: FullDuplexConfig;
  private audioContext: AudioContext | null = null;

  /** Gain nodes for each channel */
  private userGain: GainNode | null = null;
  private aiGain: GainNode | null = null;
  private masterGain: GainNode | null = null;
  private sidetoneGain: GainNode | null = null;

  /** Source nodes */
  private userSource: MediaStreamAudioSourceNode | null = null;
  private aiSource: AudioBufferSourceNode | null = null;

  /** Fade animation */
  private fadeAnimationId: number | null = null;

  /** Statistics */
  private stats = {
    duckingEvents: 0,
    totalDuckingDuration: 0,
    avgUserLevel: 0,
    avgAiLevel: 0,
  };

  constructor(
    config: Partial<FullDuplexConfig> = {},
    mixerState: Partial<MixerState> = {},
  ) {
    this.config = { ...DEFAULT_FULL_DUPLEX_CONFIG, ...config };
    this.state = { ...DEFAULT_MIXER_STATE, ...mixerState };
  }

  // ==========================================================================
  // Initialization
  // ==========================================================================

  /**
   * Initialize the audio mixer with an AudioContext
   */
  async initialize(audioContext: AudioContext): Promise<void> {
    this.audioContext = audioContext;

    // Create gain nodes
    this.userGain = audioContext.createGain();
    this.aiGain = audioContext.createGain();
    this.masterGain = audioContext.createGain();
    this.sidetoneGain = audioContext.createGain();

    // Set initial volumes
    this.userGain.gain.value = this.state.userChannel.volume;
    this.aiGain.gain.value = this.state.aiChannel.volume;
    this.masterGain.gain.value = this.state.masterVolume;
    this.sidetoneGain.gain.value = this.config.enableSidetone
      ? this.config.sidetoneVolume
      : 0;

    // Connect the audio graph
    // User -> userGain -> sidetone
    // AI -> aiGain -> master -> destination
    this.userGain.connect(this.sidetoneGain);
    this.sidetoneGain.connect(this.masterGain);
    this.aiGain.connect(this.masterGain);
    this.masterGain.connect(audioContext.destination);

    this.state.isActive = true;
  }

  /**
   * Connect user microphone stream
   */
  connectUserStream(stream: MediaStream): void {
    if (!this.audioContext || !this.userGain) {
      throw new Error("Mixer not initialized");
    }

    // Disconnect existing source
    if (this.userSource) {
      this.userSource.disconnect();
    }

    // Create new source
    this.userSource = this.audioContext.createMediaStreamSource(stream);
    this.userSource.connect(this.userGain);
  }

  /**
   * Get AI audio destination node for connecting TTS
   */
  getAiInputNode(): GainNode | null {
    return this.aiGain;
  }

  // ==========================================================================
  // Volume Control
  // ==========================================================================

  /**
   * Set user channel volume
   */
  setUserVolume(volume: number): void {
    this.state.userChannel.volume = Math.max(0, Math.min(1, volume));
    if (this.userGain) {
      this.userGain.gain.value = this.state.userChannel.muted
        ? 0
        : this.state.userChannel.volume;
    }
  }

  /**
   * Set AI channel volume
   */
  setAiVolume(volume: number): void {
    this.state.aiChannel.volume = Math.max(0, Math.min(1, volume));
    if (this.aiGain) {
      this.aiGain.gain.value = this.state.aiChannel.muted
        ? 0
        : this.state.aiChannel.volume;
    }
  }

  /**
   * Set master volume
   */
  setMasterVolume(volume: number): void {
    this.state.masterVolume = Math.max(0, Math.min(1, volume));
    if (this.masterGain) {
      this.masterGain.gain.value = this.state.masterVolume;
    }
  }

  /**
   * Mute/unmute user channel
   */
  setUserMuted(muted: boolean): void {
    this.state.userChannel.muted = muted;
    if (this.userGain) {
      this.userGain.gain.value = muted ? 0 : this.state.userChannel.volume;
    }
  }

  /**
   * Mute/unmute AI channel
   */
  setAiMuted(muted: boolean): void {
    this.state.aiChannel.muted = muted;
    if (this.aiGain) {
      this.aiGain.gain.value = muted ? 0 : this.state.aiChannel.volume;
    }
  }

  // ==========================================================================
  // Sidetone
  // ==========================================================================

  /**
   * Enable/disable sidetone
   */
  setSidetoneEnabled(enabled: boolean): void {
    this.config.enableSidetone = enabled;
    if (this.sidetoneGain) {
      this.sidetoneGain.gain.value = enabled ? this.config.sidetoneVolume : 0;
    }
  }

  /**
   * Set sidetone volume
   */
  setSidetoneVolume(volume: number): void {
    this.config.sidetoneVolume = Math.max(0, Math.min(1, volume));
    if (this.sidetoneGain && this.config.enableSidetone) {
      this.sidetoneGain.gain.value = this.config.sidetoneVolume;
    }
  }

  // ==========================================================================
  // Ducking
  // ==========================================================================

  /**
   * Duck AI audio (reduce volume during user speech)
   */
  duckAiAudio(): void {
    if (!this.aiGain || !this.audioContext) return;

    // Cancel any pending fade
    if (this.fadeAnimationId) {
      cancelAnimationFrame(this.fadeAnimationId);
    }

    const currentTime = this.audioContext.currentTime;
    const fadeDuration = this.config.duckingFadeDuration / 1000;

    // Smooth transition to ducked volume
    this.aiGain.gain.cancelScheduledValues(currentTime);
    this.aiGain.gain.setValueAtTime(this.aiGain.gain.value, currentTime);
    this.aiGain.gain.linearRampToValueAtTime(
      this.config.duckedVolume,
      currentTime + fadeDuration,
    );

    this.stats.duckingEvents++;
  }

  /**
   * Restore AI audio to normal volume
   */
  restoreAiAudio(): void {
    if (!this.aiGain || !this.audioContext) return;

    // Cancel any pending fade
    if (this.fadeAnimationId) {
      cancelAnimationFrame(this.fadeAnimationId);
    }

    const currentTime = this.audioContext.currentTime;
    const fadeDuration = this.config.duckingFadeDuration / 1000;

    // Smooth transition back to normal
    this.aiGain.gain.cancelScheduledValues(currentTime);
    this.aiGain.gain.setValueAtTime(this.aiGain.gain.value, currentTime);
    this.aiGain.gain.linearRampToValueAtTime(
      this.state.aiChannel.volume,
      currentTime + fadeDuration,
    );
  }

  /**
   * Fade AI audio to a specific volume
   */
  fadeAiVolumeTo(targetVolume: number, durationMs: number): void {
    if (!this.aiGain || !this.audioContext) return;

    const currentTime = this.audioContext.currentTime;
    const fadeDuration = durationMs / 1000;

    this.aiGain.gain.cancelScheduledValues(currentTime);
    this.aiGain.gain.setValueAtTime(this.aiGain.gain.value, currentTime);
    this.aiGain.gain.linearRampToValueAtTime(
      Math.max(0, Math.min(1, targetVolume)),
      currentTime + fadeDuration,
    );
  }

  // ==========================================================================
  // Audio Blending
  // ==========================================================================

  /**
   * Mix audio samples for monitoring
   *
   * @param userSamples - User audio samples
   * @param aiSamples - AI audio samples
   * @returns Mixed samples
   */
  mixSamples(userSamples: Float32Array, aiSamples: Float32Array): Float32Array {
    const length = Math.min(userSamples.length, aiSamples.length);
    const output = new Float32Array(length);

    const userVol = this.state.userChannel.muted
      ? 0
      : this.state.userChannel.volume;
    const aiVol = this.state.aiChannel.muted ? 0 : this.state.aiChannel.volume;

    for (let i = 0; i < length; i++) {
      // Simple additive mixing with soft clipping
      const mixed = userSamples[i] * userVol + aiSamples[i] * aiVol;
      output[i] = this.softClip(mixed);
    }

    return output;
  }

  /**
   * Soft clip audio to prevent harsh distortion
   */
  private softClip(sample: number): number {
    // Tanh-based soft clipping
    return Math.tanh(sample);
  }

  // ==========================================================================
  // Level Monitoring
  // ==========================================================================

  /**
   * Get current user audio level (RMS)
   */
  getUserLevel(samples: Float32Array): number {
    let sum = 0;
    for (let i = 0; i < samples.length; i++) {
      sum += samples[i] * samples[i];
    }
    const rms = Math.sqrt(sum / samples.length);
    this.stats.avgUserLevel = 0.95 * this.stats.avgUserLevel + 0.05 * rms;
    return rms;
  }

  /**
   * Get current AI audio level (RMS)
   */
  getAiLevel(samples: Float32Array): number {
    let sum = 0;
    for (let i = 0; i < samples.length; i++) {
      sum += samples[i] * samples[i];
    }
    const rms = Math.sqrt(sum / samples.length);
    this.stats.avgAiLevel = 0.95 * this.stats.avgAiLevel + 0.05 * rms;
    return rms;
  }

  // ==========================================================================
  // State Management
  // ==========================================================================

  /**
   * Get current mixer state
   */
  getState(): MixerState {
    return { ...this.state };
  }

  /**
   * Get current AI gain value
   */
  getCurrentAiGain(): number {
    return this.aiGain?.gain.value ?? 0;
  }

  /**
   * Get statistics
   */
  getStats(): {
    duckingEvents: number;
    totalDuckingDuration: number;
    avgUserLevel: number;
    avgAiLevel: number;
  } {
    return { ...this.stats };
  }

  /**
   * Check if mixer is initialized
   */
  isInitialized(): boolean {
    return this.state.isActive && this.audioContext !== null;
  }

  /**
   * Update configuration
   */
  updateConfig(config: Partial<FullDuplexConfig>): void {
    this.config = { ...this.config, ...config };
  }

  // ==========================================================================
  // Cleanup
  // ==========================================================================

  /**
   * Reset mixer state
   */
  reset(): void {
    if (this.userSource) {
      this.userSource.disconnect();
      this.userSource = null;
    }

    if (this.aiSource) {
      this.aiSource.disconnect();
      this.aiSource = null;
    }

    this.stats = {
      duckingEvents: 0,
      totalDuckingDuration: 0,
      avgUserLevel: 0,
      avgAiLevel: 0,
    };
  }

  /**
   * Dispose of all resources
   */
  dispose(): void {
    if (this.fadeAnimationId) {
      cancelAnimationFrame(this.fadeAnimationId);
    }

    this.reset();

    if (this.userGain) {
      this.userGain.disconnect();
      this.userGain = null;
    }
    if (this.aiGain) {
      this.aiGain.disconnect();
      this.aiGain = null;
    }
    if (this.masterGain) {
      this.masterGain.disconnect();
      this.masterGain = null;
    }
    if (this.sidetoneGain) {
      this.sidetoneGain.disconnect();
      this.sidetoneGain = null;
    }

    this.audioContext = null;
    this.state.isActive = false;
  }
}

// ============================================================================
// Factory Function
// ============================================================================

/**
 * Create a new AudioMixer
 */
export function createAudioMixer(
  config?: Partial<FullDuplexConfig>,
  mixerState?: Partial<MixerState>,
): AudioMixer {
  return new AudioMixer(config, mixerState);
}
