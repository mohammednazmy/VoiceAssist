/**
 * Natural Turn-Taking Module
 *
 * Orchestrates prosodic analysis, silence prediction, and context
 * resumption for human-like conversation flow.
 *
 * Phase 5: Natural Turn-Taking
 */

// Re-export components
export { ProsodicAnalyzer, createProsodicAnalyzer } from "./prosodicAnalyzer";
export { SilencePredictor, createSilencePredictor } from "./silencePredictor";
export { ContextResumer, createContextResumer } from "./contextResumer";
export * from "./types";

import { ProsodicAnalyzer } from "./prosodicAnalyzer";
import { SilencePredictor } from "./silencePredictor";
import { ContextResumer } from "./contextResumer";
import type {
  TurnState,
  TransitionType,
  TurnTakingState,
  TurnTakingConfig,
  TurnTakingEvent,
  TurnTakingEventCallback,
  ProsodicFeatures,
  SilencePrediction,
  ResumptionContext,
  SupportedLanguage,
} from "./types";
import { DEFAULT_TURN_TAKING_CONFIG } from "./types";

// ============================================================================
// Turn-Taking Manager
// ============================================================================

/**
 * High-level manager for natural turn-taking
 *
 * Coordinates prosodic analysis, silence prediction, and context
 * resumption to create a natural conversational experience.
 */
export class TurnTakingManager {
  private config: TurnTakingConfig;
  private prosodicAnalyzer: ProsodicAnalyzer;
  private silencePredictor: SilencePredictor;
  private contextResumer: ContextResumer;

  /** Current state */
  private state: TurnTakingState;

  /** Event callbacks */
  private eventCallbacks: Set<TurnTakingEventCallback> = new Set();

  /** Timing tracking */
  private stateEnteredAt: number = 0;
  private turnStartedAt: number = 0;
  private turnDurations: number[] = [];
  private readonly MAX_TURN_HISTORY = 20;

  /** Overlap tracking */
  private overlapStartedAt: number | null = null;

  /** User prompt timeout */
  private userPromptTimeoutId: ReturnType<typeof setTimeout> | null = null;

  constructor(config: Partial<TurnTakingConfig> = {}) {
    this.config = { ...DEFAULT_TURN_TAKING_CONFIG, ...config };

    this.prosodicAnalyzer = new ProsodicAnalyzer(this.config.prosodicConfig);
    this.silencePredictor = new SilencePredictor(this.config.silenceConfig);
    this.contextResumer = new ContextResumer(this.config.resumptionConfig);

    this.state = this.createInitialState();
  }

  // ==========================================================================
  // State Initialization
  // ==========================================================================

  /**
   * Create initial state
   */
  private createInitialState(): TurnTakingState {
    return {
      currentTurn: "pause",
      previousTurn: "pause",
      currentSpeaker: "none",
      timeInState: 0,
      silenceDuration: 0,
      prosodicFeatures: null,
      silencePrediction: null,
      resumptionContext: null,
      turnCount: 0,
      avgTurnDuration: 0,
    };
  }

  // ==========================================================================
  // Main Update Loop
  // ==========================================================================

  /**
   * Process audio frame and update turn-taking state
   *
   * @param samples - Audio samples
   * @param isUserSpeaking - VAD result for user
   * @param isAISpeaking - Whether AI is currently speaking
   * @returns Updated state
   */
  update(
    samples: Float32Array,
    isUserSpeaking: boolean,
    isAISpeaking: boolean,
  ): TurnTakingState {
    const now = Date.now();

    // Analyze prosodic features
    const prosodicFeatures = this.prosodicAnalyzer.analyze(samples);
    this.state.prosodicFeatures = prosodicFeatures;

    // Update silence prediction
    const silencePrediction = this.silencePredictor.update(
      isUserSpeaking,
      prosodicFeatures,
    );
    this.state.silencePrediction = silencePrediction;

    // Determine new turn state
    const newTurn = this.determineTurnState(
      isUserSpeaking,
      isAISpeaking,
      silencePrediction,
    );

    // Handle state transitions
    if (newTurn !== this.state.currentTurn) {
      this.handleTransition(this.state.currentTurn, newTurn);
    }

    // Update time in state
    this.state.timeInState = now - this.stateEnteredAt;

    // Update silence duration
    if (silencePrediction.isSilence) {
      this.state.silenceDuration = silencePrediction.predictedDuration;
    } else {
      this.state.silenceDuration = 0;
    }

    // Emit prosodic update
    this.emitEvent({ type: "prosodic_update", features: prosodicFeatures });

    return { ...this.state };
  }

  /**
   * Determine the current turn state
   */
  private determineTurnState(
    isUserSpeaking: boolean,
    isAISpeaking: boolean,
    silencePrediction: SilencePrediction,
  ): TurnState {
    // Both speaking = overlap
    if (isUserSpeaking && isAISpeaking) {
      return "overlap";
    }

    // User speaking
    if (isUserSpeaking && !isAISpeaking) {
      return "user_turn";
    }

    // AI speaking
    if (!isUserSpeaking && isAISpeaking) {
      return "ai_turn";
    }

    // Neither speaking
    if (!isUserSpeaking && !isAISpeaking) {
      // Check if we're transitioning
      if (
        this.state.currentTurn === "user_turn" ||
        this.state.currentTurn === "ai_turn"
      ) {
        // If silence just started, mark as transition
        if (silencePrediction.silenceType !== "end_of_turn") {
          return "transition";
        }
      }

      // Check if AI is yielding
      if (
        this.state.previousTurn === "ai_turn" &&
        silencePrediction.silenceType === "end_of_turn"
      ) {
        return "ai_yielding";
      }

      // Check if we have resumption context
      if (this.contextResumer.hasContext()) {
        if (this.contextResumer.shouldAutoResume()) {
          return "ai_resuming";
        }
      }

      return "pause";
    }

    return this.state.currentTurn;
  }

  // ==========================================================================
  // State Transitions
  // ==========================================================================

  /**
   * Handle state transition
   */
  private handleTransition(from: TurnState, to: TurnState): void {
    const now = Date.now();

    // Determine transition type
    const transitionType = this.getTransitionType(from, to);

    // Update state
    this.state.previousTurn = from;
    this.state.currentTurn = to;
    this.stateEnteredAt = now;

    // Handle specific transitions
    switch (to) {
      case "user_turn":
        this.handleUserTurnStart(from);
        break;

      case "ai_turn":
        this.handleAITurnStart(from);
        break;

      case "overlap":
        this.handleOverlapStart();
        break;

      case "pause":
        this.handlePauseStart(from);
        break;

      case "ai_yielding":
        this.handleAIYielding();
        break;

      case "ai_resuming":
        this.handleAIResuming();
        break;
    }

    // End overlap if leaving overlap state
    if (from === "overlap" && to !== "overlap") {
      this.handleOverlapEnd();
    }

    // Emit transition event
    this.emitEvent({
      type: "transition",
      from,
      to,
      transitionType,
    });
  }

  /**
   * Get transition type
   */
  private getTransitionType(from: TurnState, to: TurnState): TransitionType {
    if (from === "ai_turn" && to === "user_turn") {
      return "interrupted";
    }
    if (from === "ai_turn" && to === "ai_yielding") {
      return "smooth";
    }
    if (from === "user_turn" && to === "pause") {
      return "smooth";
    }
    if (to === "overlap") {
      return "interrupted";
    }
    if (from === "pause" && to === "user_turn") {
      return "smooth";
    }
    return "timeout";
  }

  /**
   * Handle user turn start
   */
  private handleUserTurnStart(from: TurnState): void {
    this.turnStartedAt = Date.now();
    this.state.currentSpeaker = "user";

    // Clear user prompt timeout
    if (this.userPromptTimeoutId) {
      clearTimeout(this.userPromptTimeoutId);
      this.userPromptTimeoutId = null;
    }

    this.emitEvent({
      type: "turn_started",
      speaker: "user",
      timestamp: this.turnStartedAt,
    });
  }

  /**
   * Handle AI turn start
   */
  private handleAITurnStart(from: TurnState): void {
    this.turnStartedAt = Date.now();
    this.state.currentSpeaker = "ai";

    this.emitEvent({
      type: "turn_started",
      speaker: "ai",
      timestamp: this.turnStartedAt,
    });
  }

  /**
   * Handle overlap start
   */
  private handleOverlapStart(): void {
    this.overlapStartedAt = Date.now();
    this.emitEvent({
      type: "overlap_started",
      timestamp: this.overlapStartedAt,
    });
  }

  /**
   * Handle overlap end
   */
  private handleOverlapEnd(): void {
    if (this.overlapStartedAt) {
      const duration = Date.now() - this.overlapStartedAt;
      this.emitEvent({
        type: "overlap_ended",
        duration,
      });
      this.overlapStartedAt = null;
    }
  }

  /**
   * Handle pause start
   */
  private handlePauseStart(from: TurnState): void {
    // Record turn duration if ending a turn
    if (from === "user_turn" || from === "ai_turn") {
      const speaker = from === "user_turn" ? "user" : "ai";
      const duration = Date.now() - this.turnStartedAt;

      this.recordTurnDuration(duration);
      this.state.turnCount++;

      this.emitEvent({
        type: "turn_ended",
        speaker,
        duration,
      });
    }

    this.state.currentSpeaker = "none";

    // Start user prompt timeout
    this.startUserPromptTimeout();
  }

  /**
   * Handle AI yielding
   */
  private handleAIYielding(): void {
    // Start user prompt timeout
    this.startUserPromptTimeout();
  }

  /**
   * Handle AI resuming
   */
  private handleAIResuming(): void {
    const context = this.contextResumer.getLastContext();
    if (context) {
      this.emitEvent({
        type: "resumption_available",
        context,
      });
    }
  }

  // ==========================================================================
  // User Prompt Handling
  // ==========================================================================

  /**
   * Start timeout to prompt user
   */
  private startUserPromptTimeout(): void {
    if (this.userPromptTimeoutId) {
      clearTimeout(this.userPromptTimeoutId);
    }

    this.userPromptTimeoutId = setTimeout(() => {
      this.emitEvent({
        type: "prompt_user",
        reason: "silence_timeout",
      });
    }, this.config.userPromptTimeout);
  }

  // ==========================================================================
  // Turn Duration Tracking
  // ==========================================================================

  /**
   * Record a turn duration
   */
  private recordTurnDuration(duration: number): void {
    this.turnDurations.push(duration);
    if (this.turnDurations.length > this.MAX_TURN_HISTORY) {
      this.turnDurations.shift();
    }

    // Update average
    this.state.avgTurnDuration =
      this.turnDurations.reduce((a, b) => a + b, 0) / this.turnDurations.length;

    // Also record in silence predictor for context
    this.silencePredictor.recordTurnDuration(duration);
  }

  // ==========================================================================
  // Interruption Handling
  // ==========================================================================

  /**
   * Record an interruption and capture context
   *
   * @param fullResponse - Full AI response
   * @param interruptedAtIndex - Character index of interruption
   * @returns Resumption context
   */
  recordInterruption(
    fullResponse: string,
    interruptedAtIndex: number,
  ): ResumptionContext {
    return this.contextResumer.captureInterruptedContext(
      fullResponse,
      interruptedAtIndex,
      "user_barge_in",
    );
  }

  /**
   * Get resumption prefix for continuing
   */
  getResumptionPrefix(): string {
    return this.contextResumer.generateResumptionPrefix();
  }

  /**
   * Get remaining content after interruption
   */
  getRemainingContent(): string {
    return this.contextResumer.getRemainingContent();
  }

  /**
   * Clear resumption context
   */
  clearResumptionContext(): void {
    this.contextResumer.clear();
    this.state.resumptionContext = null;
  }

  // ==========================================================================
  // Events
  // ==========================================================================

  /**
   * Subscribe to turn-taking events
   */
  onEvent(callback: TurnTakingEventCallback): () => void {
    this.eventCallbacks.add(callback);
    return () => this.eventCallbacks.delete(callback);
  }

  /**
   * Emit an event
   */
  private emitEvent(event: TurnTakingEvent): void {
    this.eventCallbacks.forEach((callback) => callback(event));
  }

  // ==========================================================================
  // Configuration and State
  // ==========================================================================

  /**
   * Get current state
   */
  getState(): TurnTakingState {
    return { ...this.state };
  }

  /**
   * Get current turn
   */
  getCurrentTurn(): TurnState {
    return this.state.currentTurn;
  }

  /**
   * Get current speaker
   */
  getCurrentSpeaker(): "user" | "ai" | "none" {
    return this.state.currentSpeaker;
  }

  /**
   * Get adaptive silence threshold
   */
  getAdaptiveSilenceThreshold(): number {
    return this.silencePredictor.getAdaptiveThreshold();
  }

  /**
   * Set language for all components
   */
  setLanguage(language: SupportedLanguage): void {
    this.contextResumer.setLanguage(language);
    this.config.resumptionConfig.language = language;
  }

  /**
   * Update configuration
   */
  updateConfig(config: Partial<TurnTakingConfig>): void {
    this.config = { ...this.config, ...config };

    if (config.prosodicConfig) {
      this.prosodicAnalyzer.updateConfig(config.prosodicConfig);
    }
    if (config.silenceConfig) {
      this.silencePredictor.updateConfig(config.silenceConfig);
    }
    if (config.resumptionConfig) {
      this.contextResumer.updateConfig(config.resumptionConfig);
    }
  }

  /**
   * Get configuration
   */
  getConfig(): TurnTakingConfig {
    return { ...this.config };
  }

  /**
   * Get statistics
   */
  getStats(): {
    prosodic: ReturnType<ProsodicAnalyzer["getStats"]>;
    silence: ReturnType<SilencePredictor["getStats"]>;
    resumption: ReturnType<ContextResumer["getStats"]>;
    turnCount: number;
    avgTurnDuration: number;
  } {
    return {
      prosodic: this.prosodicAnalyzer.getStats(),
      silence: this.silencePredictor.getStats(),
      resumption: this.contextResumer.getStats(),
      turnCount: this.state.turnCount,
      avgTurnDuration: this.state.avgTurnDuration,
    };
  }

  /**
   * Reset all state
   */
  reset(): void {
    this.prosodicAnalyzer.reset();
    this.silencePredictor.reset();
    this.contextResumer.reset();
    this.state = this.createInitialState();
    this.stateEnteredAt = 0;
    this.turnStartedAt = 0;
    this.turnDurations = [];
    this.overlapStartedAt = null;

    if (this.userPromptTimeoutId) {
      clearTimeout(this.userPromptTimeoutId);
      this.userPromptTimeoutId = null;
    }
  }

  /**
   * Dispose of resources
   */
  dispose(): void {
    if (this.userPromptTimeoutId) {
      clearTimeout(this.userPromptTimeoutId);
      this.userPromptTimeoutId = null;
    }
    this.eventCallbacks.clear();
  }
}

// ============================================================================
// Factory Functions
// ============================================================================

/**
 * Create a new TurnTakingManager
 */
export function createTurnTakingManager(
  config?: Partial<TurnTakingConfig>,
): TurnTakingManager {
  return new TurnTakingManager(config);
}
