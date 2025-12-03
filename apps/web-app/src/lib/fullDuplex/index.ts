/**
 * Full Duplex Module
 *
 * Orchestrates full duplex voice communication with
 * simultaneous speaking, audio mixing, and intelligent
 * overlap handling.
 *
 * Phase 6: Full Duplex Experience
 */

// Re-export components
export { AudioMixer, createAudioMixer } from "./audioMixer";
export { OverlapHandler, createOverlapHandler } from "./overlapHandler";
export * from "./types";

import { AudioMixer } from "./audioMixer";
import { OverlapHandler } from "./overlapHandler";
import type {
  DuplexState,
  FullDuplexConfig,
  FullDuplexEvent,
  FullDuplexEventCallback,
  OverlapResolution,
} from "./types";
import { DEFAULT_FULL_DUPLEX_CONFIG } from "./types";

// ============================================================================
// Full Duplex Manager
// ============================================================================

/**
 * High-level manager for full duplex voice communication
 */
export class FullDuplexManager {
  private config: FullDuplexConfig;
  private audioMixer: AudioMixer;
  private overlapHandler: OverlapHandler;

  /** Current state */
  private state: DuplexState;

  /** Event callbacks */
  private eventCallbacks: Set<FullDuplexEventCallback> = new Set();

  /** Audio context */
  private audioContext: AudioContext | null = null;

  /** Timing */
  private lastUpdateTime: number = 0;

  constructor(config: Partial<FullDuplexConfig> = {}) {
    this.config = { ...DEFAULT_FULL_DUPLEX_CONFIG, ...config };

    this.audioMixer = new AudioMixer(this.config);
    this.overlapHandler = new OverlapHandler(this.config);

    this.state = this.createInitialState();
  }

  // ==========================================================================
  // State Initialization
  // ==========================================================================

  /**
   * Create initial state
   */
  private createInitialState(): DuplexState {
    return {
      userSpeaking: false,
      aiSpeaking: false,
      isOverlap: false,
      overlapDuration: 0,
      activeStream: "none",
      toolCallInProgress: false,
      aiVolume: 1.0,
      sidetoneVolume: this.config.sidetoneVolume,
    };
  }

  // ==========================================================================
  // Initialization
  // ==========================================================================

  /**
   * Initialize the full duplex system
   */
  async initialize(audioContext: AudioContext): Promise<void> {
    this.audioContext = audioContext;
    await this.audioMixer.initialize(audioContext);
  }

  /**
   * Connect user microphone stream
   */
  connectUserStream(stream: MediaStream): void {
    this.audioMixer.connectUserStream(stream);
  }

  /**
   * Get AI audio input node for connecting TTS
   */
  getAiInputNode(): GainNode | null {
    return this.audioMixer.getAiInputNode();
  }

  // ==========================================================================
  // Main Update Loop
  // ==========================================================================

  /**
   * Update full duplex state
   *
   * @param userSpeaking - Whether user is speaking (from VAD)
   * @param aiSpeaking - Whether AI is speaking (from TTS)
   * @param vadConfidence - VAD confidence level
   * @param transcript - Current transcript if available
   * @returns Overlap resolution if any
   */
  update(
    userSpeaking: boolean,
    aiSpeaking: boolean,
    vadConfidence: number,
    transcript?: string,
  ): OverlapResolution | null {
    const now = Date.now();
    const prevState = { ...this.state };

    // Update state
    this.state.userSpeaking = userSpeaking;
    this.state.aiSpeaking = aiSpeaking;

    // Update active stream
    if (userSpeaking && aiSpeaking) {
      this.state.activeStream = "both";
      this.state.isOverlap = true;
    } else if (userSpeaking) {
      this.state.activeStream = "user";
      this.state.isOverlap = false;
    } else if (aiSpeaking) {
      this.state.activeStream = "ai";
      this.state.isOverlap = false;
    } else {
      this.state.activeStream = "none";
      this.state.isOverlap = false;
    }

    // Get overlap resolution
    const resolution = this.overlapHandler.update(
      userSpeaking,
      aiSpeaking,
      vadConfidence,
      transcript,
    );

    // Apply resolution
    if (resolution) {
      this.applyResolution(resolution, prevState);
    }

    // Update overlap duration
    if (this.state.isOverlap) {
      this.state.overlapDuration =
        this.overlapHandler.getCurrentOverlapDuration();
    } else {
      this.state.overlapDuration = 0;
    }

    // Emit state change if needed
    if (this.hasStateChanged(prevState)) {
      this.emitEvent({ type: "state_change", state: { ...this.state } });
    }

    this.lastUpdateTime = now;
    return resolution;
  }

  /**
   * Apply overlap resolution
   */
  private applyResolution(
    resolution: OverlapResolution,
    _prevState: DuplexState,
  ): void {
    switch (resolution.action) {
      case "interrupt_ai":
        this.handleAiInterrupt(resolution.reason);
        break;

      case "fade_ai":
        this.handleAiFade(resolution.targetAiVolume);
        break;

      case "continue_ai":
        this.handleAiContinue();
        break;

      case "wait":
        // Do nothing, just wait
        break;
    }

    // Handle backchannel detection
    if (
      resolution.reason === "backchannel_detected" ||
      resolution.reason === "backchannel_confirmed"
    ) {
      this.emitEvent({
        type: "backchannel_detected",
        transcript: "",
      });
    }
  }

  /**
   * Handle AI interrupt
   */
  private handleAiInterrupt(reason: string): void {
    this.audioMixer.setAiVolume(0);
    this.state.aiVolume = 0;

    this.emitEvent({
      type: "ai_interrupted",
      reason,
    });
  }

  /**
   * Handle AI fade/duck
   */
  private handleAiFade(targetVolume: number): void {
    this.audioMixer.fadeAiVolumeTo(
      targetVolume,
      this.config.duckingFadeDuration,
    );
    this.state.aiVolume = targetVolume;

    this.emitEvent({
      type: "ai_ducked",
      targetVolume,
    });
  }

  /**
   * Handle AI continue (restore volume)
   */
  private handleAiContinue(): void {
    this.audioMixer.restoreAiAudio();
    this.state.aiVolume = 1.0;

    this.emitEvent({
      type: "ai_restored",
      targetVolume: 1.0,
    });
  }

  /**
   * Check if state has changed
   */
  private hasStateChanged(prevState: DuplexState): boolean {
    return (
      prevState.userSpeaking !== this.state.userSpeaking ||
      prevState.aiSpeaking !== this.state.aiSpeaking ||
      prevState.isOverlap !== this.state.isOverlap ||
      prevState.activeStream !== this.state.activeStream ||
      prevState.toolCallInProgress !== this.state.toolCallInProgress
    );
  }

  // ==========================================================================
  // Tool Call Management
  // ==========================================================================

  /**
   * Start a tool call
   */
  startToolCall(): void {
    this.state.toolCallInProgress = true;
    this.overlapHandler.startToolCall();
    this.emitEvent({ type: "tool_call_started" });
  }

  /**
   * End a tool call
   */
  endToolCall(): void {
    this.state.toolCallInProgress = false;
    this.overlapHandler.endToolCall();
    this.emitEvent({ type: "tool_call_ended" });
  }

  /**
   * Check if tool call is active
   */
  isToolCallActive(): boolean {
    return this.state.toolCallInProgress;
  }

  // ==========================================================================
  // Volume Control
  // ==========================================================================

  /**
   * Set AI volume
   */
  setAiVolume(volume: number): void {
    this.audioMixer.setAiVolume(volume);
    this.state.aiVolume = volume;
  }

  /**
   * Set sidetone enabled
   */
  setSidetoneEnabled(enabled: boolean): void {
    this.audioMixer.setSidetoneEnabled(enabled);
    this.state.sidetoneVolume = enabled ? this.config.sidetoneVolume : 0;
  }

  /**
   * Set sidetone volume
   */
  setSidetoneVolume(volume: number): void {
    this.config.sidetoneVolume = volume;
    this.audioMixer.setSidetoneVolume(volume);
    if (this.config.enableSidetone) {
      this.state.sidetoneVolume = volume;
    }
  }

  /**
   * Mute AI
   */
  muteAi(): void {
    this.audioMixer.setAiMuted(true);
  }

  /**
   * Unmute AI
   */
  unmuteAi(): void {
    this.audioMixer.setAiMuted(false);
  }

  // ==========================================================================
  // Backchannel Detection
  // ==========================================================================

  /**
   * Check if a transcript is a backchannel
   */
  isBackchannel(transcript: string, vadConfidence: number): boolean {
    return this.overlapHandler.isBackchannel(transcript, vadConfidence);
  }

  /**
   * Add custom backchannel phrases
   */
  addBackchannelPhrases(language: string, phrases: string[]): void {
    this.overlapHandler.addBackchannelPhrases(language, phrases);
  }

  // ==========================================================================
  // Events
  // ==========================================================================

  /**
   * Subscribe to full duplex events
   */
  onEvent(callback: FullDuplexEventCallback): () => void {
    this.eventCallbacks.add(callback);
    return () => this.eventCallbacks.delete(callback);
  }

  /**
   * Emit an event
   */
  private emitEvent(event: FullDuplexEvent): void {
    this.eventCallbacks.forEach((callback) => callback(event));
  }

  // ==========================================================================
  // State and Configuration
  // ==========================================================================

  /**
   * Get current state
   */
  getState(): DuplexState {
    return { ...this.state };
  }

  /**
   * Get configuration
   */
  getConfig(): FullDuplexConfig {
    return { ...this.config };
  }

  /**
   * Update configuration
   */
  updateConfig(config: Partial<FullDuplexConfig>): void {
    this.config = { ...this.config, ...config };
    this.audioMixer.updateConfig(this.config);
    this.overlapHandler.updateConfig(this.config);
  }

  /**
   * Get statistics
   */
  getStats(): {
    mixer: ReturnType<AudioMixer["getStats"]>;
    overlap: ReturnType<OverlapHandler["getStats"]>;
  } {
    return {
      mixer: this.audioMixer.getStats(),
      overlap: this.overlapHandler.getStats(),
    };
  }

  /**
   * Check if initialized
   */
  isInitialized(): boolean {
    return this.audioMixer.isInitialized();
  }

  // ==========================================================================
  // Cleanup
  // ==========================================================================

  /**
   * Reset state
   */
  reset(): void {
    this.state = this.createInitialState();
    this.audioMixer.reset();
    this.overlapHandler.reset();
  }

  /**
   * Dispose of all resources
   */
  dispose(): void {
    this.audioMixer.dispose();
    this.overlapHandler.reset();
    this.eventCallbacks.clear();
    this.audioContext = null;
  }
}

// ============================================================================
// Factory Functions
// ============================================================================

/**
 * Create a new FullDuplexManager
 */
export function createFullDuplexManager(
  config?: Partial<FullDuplexConfig>,
): FullDuplexManager {
  return new FullDuplexManager(config);
}

/**
 * Create and initialize a FullDuplexManager
 */
export async function createInitializedFullDuplexManager(
  audioContext: AudioContext,
  config?: Partial<FullDuplexConfig>,
): Promise<FullDuplexManager> {
  const manager = new FullDuplexManager(config);
  await manager.initialize(audioContext);
  return manager;
}
