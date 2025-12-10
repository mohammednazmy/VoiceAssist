/**
 * Overlap Handler
 *
 * Handles simultaneous speech detection and resolution
 * for full duplex voice communication.
 *
 * Phase 6: Full Duplex Experience
 */

import type {
  FullDuplexConfig,
  OverlapEvent,
  OverlapResolution,
} from "./types";
import { DEFAULT_FULL_DUPLEX_CONFIG } from "./types";

// ============================================================================
// Backchannel Detection
// ============================================================================

/**
 * Common backchannel phrases by language
 */
const BACKCHANNEL_PHRASES: Record<string, string[]> = {
  en: [
    "uh huh",
    "uh-huh",
    "mm hmm",
    "mmhmm",
    "yeah",
    "yep",
    "okay",
    "ok",
    "right",
    "sure",
    "yes",
    "I see",
    "got it",
    "go on",
    "mhm",
    "hmm",
  ],
  ar: ["نعم", "آه", "صحيح", "تمام", "طيب", "أها", "ماشي"],
  es: ["sí", "aja", "ajá", "vale", "claro", "ya", "bueno", "entiendo"],
  fr: ["oui", "ouais", "d'accord", "ok", "mmm", "ah oui", "je vois"],
  de: ["ja", "jaja", "genau", "ok", "verstehe", "mmhm", "aha", "richtig"],
  zh: ["嗯", "好", "是", "对", "哦", "好的", "明白"],
  ja: ["はい", "うん", "そう", "ええ", "なるほど", "わかりました"],
  ko: ["네", "응", "그래", "알겠어", "맞아", "예"],
};

// ============================================================================
// Overlap Handler
// ============================================================================

/**
 * Handles overlap detection and resolution
 */
export class OverlapHandler {
  private config: FullDuplexConfig;

  /** Current overlap tracking */
  private overlapStartTime: number | null = null;
  private isInOverlap: boolean = false;
  private lastVadConfidence: number = 0;

  /** History of overlaps */
  private overlapHistory: OverlapEvent[] = [];
  private readonly MAX_HISTORY_SIZE = 20;

  /** Tool call state */
  private toolCallInProgress: boolean = false;
  private toolCallStartTime: number | null = null;

  /** Statistics */
  private stats = {
    totalOverlaps: 0,
    totalBackchannels: 0,
    totalInterrupts: 0,
    avgOverlapDuration: 0,
    interruptRate: 0,
  };

  constructor(config: Partial<FullDuplexConfig> = {}) {
    this.config = { ...DEFAULT_FULL_DUPLEX_CONFIG, ...config };
  }

  // ==========================================================================
  // Overlap Detection
  // ==========================================================================

  /**
   * Update overlap state based on speaking status
   *
   * @param userSpeaking - Whether user is speaking
   * @param aiSpeaking - Whether AI is speaking
   * @param vadConfidence - VAD confidence for user speech
   * @param transcript - Current transcript if available
   * @returns Overlap resolution if needed
   */
  update(
    userSpeaking: boolean,
    aiSpeaking: boolean,
    vadConfidence: number,
    transcript?: string,
  ): OverlapResolution | null {
    this.lastVadConfidence = vadConfidence;

    // Check for overlap start
    if (userSpeaking && aiSpeaking && !this.isInOverlap) {
      return this.handleOverlapStart(vadConfidence, transcript);
    }

    // Check for overlap end
    if (this.isInOverlap && (!userSpeaking || !aiSpeaking)) {
      return this.handleOverlapEnd(userSpeaking, aiSpeaking);
    }

    // During ongoing overlap
    if (this.isInOverlap) {
      return this.handleOngoingOverlap(vadConfidence, transcript);
    }

    return null;
  }

  /**
   * Handle overlap start
   */
  private handleOverlapStart(
    vadConfidence: number,
    transcript?: string,
  ): OverlapResolution | null {
    this.isInOverlap = true;
    this.overlapStartTime = Date.now();
    this.stats.totalOverlaps++;

    // Check if it's a backchannel
    if (transcript && this.isBackchannel(transcript, vadConfidence)) {
      this.stats.totalBackchannels++;
      return {
        action: "continue_ai",
        targetAiVolume: 1.0,
        sendInterrupt: false,
        reason: "backchannel_detected",
      };
    }

    // Respect tool call boundaries if configured
    if (this.config.respectToolCallBoundaries && this.toolCallInProgress) {
      return {
        action: "fade_ai",
        targetAiVolume: this.config.duckedVolume,
        sendInterrupt: false,
        reason: "tool_call_in_progress",
      };
    }

    // Initial overlap - wait a bit before deciding
    return {
      action: "wait",
      targetAiVolume: 1.0,
      sendInterrupt: false,
      reason: "detecting_intent",
    };
  }

  /**
   * Handle ongoing overlap
   */
  private handleOngoingOverlap(
    vadConfidence: number,
    transcript?: string,
  ): OverlapResolution {
    const overlapDuration = this.overlapStartTime
      ? Date.now() - this.overlapStartTime
      : 0;

    // Check for backchannel again with more context
    if (transcript && this.isBackchannel(transcript, vadConfidence)) {
      return {
        action: "continue_ai",
        targetAiVolume: 1.0,
        sendInterrupt: false,
        reason: "backchannel_confirmed",
      };
    }

    // Apply overlap mode logic
    return this.resolveOverlap(vadConfidence, overlapDuration, transcript);
  }

  /**
   * Handle overlap end
   */
  private handleOverlapEnd(
    userSpeaking: boolean,
    aiSpeaking: boolean,
  ): OverlapResolution {
    const overlapDuration = this.overlapStartTime
      ? Date.now() - this.overlapStartTime
      : 0;

    // Record overlap event
    this.recordOverlapEvent(overlapDuration);

    this.isInOverlap = false;
    this.overlapStartTime = null;

    // If user stopped, restore AI
    if (!userSpeaking && aiSpeaking) {
      return {
        action: "continue_ai",
        targetAiVolume: 1.0,
        sendInterrupt: false,
        reason: "user_stopped",
      };
    }

    // If AI was interrupted
    if (userSpeaking && !aiSpeaking) {
      return {
        action: "wait",
        targetAiVolume: 0,
        sendInterrupt: false,
        reason: "ai_interrupted",
      };
    }

    return {
      action: "wait",
      targetAiVolume: 1.0,
      sendInterrupt: false,
      reason: "overlap_ended",
    };
  }

  // ==========================================================================
  // Overlap Resolution
  // ==========================================================================

  /**
   * Resolve overlap based on configured mode
   */
  private resolveOverlap(
    vadConfidence: number,
    overlapDuration: number,
    transcript?: string,
  ): OverlapResolution {
    switch (this.config.overlapMode) {
      case "user_priority":
        return this.resolveUserPriority(vadConfidence, overlapDuration);

      case "ai_priority":
        return this.resolveAiPriority(vadConfidence, overlapDuration);

      case "intelligent":
      default:
        return this.resolveIntelligent(
          vadConfidence,
          overlapDuration,
          transcript,
        );
    }
  }

  /**
   * User priority mode: Always interrupt AI
   */
  private resolveUserPriority(
    vadConfidence: number,
    _overlapDuration: number,
  ): OverlapResolution {
    if (vadConfidence >= this.config.interruptThreshold) {
      this.stats.totalInterrupts++;
      return {
        action: "interrupt_ai",
        targetAiVolume: 0,
        sendInterrupt: true,
        reason: "user_priority_interrupt",
      };
    }

    // Below threshold, just duck
    return {
      action: "fade_ai",
      targetAiVolume: this.config.duckedVolume,
      sendInterrupt: false,
      reason: "user_priority_duck",
    };
  }

  /**
   * AI priority mode: Only interrupt on strong signals
   */
  private resolveAiPriority(
    vadConfidence: number,
    overlapDuration: number,
  ): OverlapResolution {
    // Only interrupt on very high confidence and long duration
    if (
      vadConfidence >= 0.9 &&
      overlapDuration > this.config.maxOverlapDuration
    ) {
      this.stats.totalInterrupts++;
      return {
        action: "interrupt_ai",
        targetAiVolume: 0,
        sendInterrupt: true,
        reason: "ai_priority_forced_interrupt",
      };
    }

    // Duck but continue
    return {
      action: "fade_ai",
      targetAiVolume: this.config.duckedVolume * 1.5,
      sendInterrupt: false,
      reason: "ai_priority_continue",
    };
  }

  /**
   * Intelligent mode: Use context to decide
   */
  private resolveIntelligent(
    vadConfidence: number,
    overlapDuration: number,
    _transcript?: string,
  ): OverlapResolution {
    // Check detection delay
    if (overlapDuration < this.config.overlapDetectionDelay) {
      return {
        action: "wait",
        targetAiVolume: 1.0,
        sendInterrupt: false,
        reason: "intelligent_detecting",
      };
    }

    // High confidence = likely intentional interrupt
    if (vadConfidence >= this.config.interruptThreshold) {
      // But wait a bit longer to be sure
      if (overlapDuration > 150) {
        this.stats.totalInterrupts++;
        return {
          action: "interrupt_ai",
          targetAiVolume: 0,
          sendInterrupt: true,
          reason: "intelligent_interrupt",
        };
      }
    }

    // Medium confidence = fade and wait
    if (vadConfidence >= this.config.acknowledgmentThreshold) {
      return {
        action: "fade_ai",
        targetAiVolume: this.config.duckedVolume,
        sendInterrupt: false,
        reason: "intelligent_fade",
      };
    }

    // Low confidence = probably noise or backchannel
    return {
      action: "continue_ai",
      targetAiVolume: 1.0,
      sendInterrupt: false,
      reason: "intelligent_continue",
    };
  }

  // ==========================================================================
  // Backchannel Detection
  // ==========================================================================

  /**
   * Check if transcript is a backchannel
   */
  isBackchannel(transcript: string, vadConfidence: number): boolean {
    // Low confidence often indicates short utterance
    if (vadConfidence < this.config.acknowledgmentThreshold) {
      return true;
    }

    const normalized = transcript.toLowerCase().trim();

    // Check against all language backchannels
    for (const phrases of Object.values(BACKCHANNEL_PHRASES)) {
      if (phrases.some((phrase) => normalized === phrase.toLowerCase())) {
        return true;
      }
    }

    // Check for short utterance (likely backchannel)
    if (normalized.split(/\s+/).length <= 2 && normalized.length < 10) {
      return true;
    }

    return false;
  }

  /**
   * Add custom backchannel phrases for a language
   */
  addBackchannelPhrases(language: string, phrases: string[]): void {
    if (!BACKCHANNEL_PHRASES[language]) {
      BACKCHANNEL_PHRASES[language] = [];
    }
    BACKCHANNEL_PHRASES[language].push(...phrases);
  }

  // ==========================================================================
  // Tool Call Handling
  // ==========================================================================

  /**
   * Mark tool call as started
   */
  startToolCall(): void {
    this.toolCallInProgress = true;
    this.toolCallStartTime = Date.now();
  }

  /**
   * Mark tool call as ended
   */
  endToolCall(): void {
    this.toolCallInProgress = false;
    this.toolCallStartTime = null;
  }

  /**
   * Check if tool call is in progress
   */
  isToolCallActive(): boolean {
    return this.toolCallInProgress;
  }

  // ==========================================================================
  // History and Statistics
  // ==========================================================================

  /**
   * Record an overlap event
   */
  private recordOverlapEvent(duration: number): void {
    const event: OverlapEvent = {
      startTime: this.overlapStartTime ?? Date.now() - duration,
      duration,
      vadConfidence: this.lastVadConfidence,
      wasBackchannel: duration < 200 && this.lastVadConfidence < 0.5,
      resolution:
        duration > this.config.maxOverlapDuration
          ? "user_interrupt"
          : "ai_continue",
    };

    this.overlapHistory.push(event);
    if (this.overlapHistory.length > this.MAX_HISTORY_SIZE) {
      this.overlapHistory.shift();
    }

    // Update stats
    this.updateStats(duration);
  }

  /**
   * Update statistics
   */
  private updateStats(_duration: number): void {
    // Update average overlap duration
    const totalDuration = this.overlapHistory.reduce(
      (sum, e) => sum + e.duration,
      0,
    );
    this.stats.avgOverlapDuration = totalDuration / this.overlapHistory.length;

    // Update interrupt rate
    this.stats.interruptRate =
      this.stats.totalInterrupts / Math.max(1, this.stats.totalOverlaps);
  }

  /**
   * Get overlap history
   */
  getHistory(): OverlapEvent[] {
    return [...this.overlapHistory];
  }

  /**
   * Get statistics
   */
  getStats(): {
    totalOverlaps: number;
    totalBackchannels: number;
    totalInterrupts: number;
    avgOverlapDuration: number;
    interruptRate: number;
    isInOverlap: boolean;
    currentOverlapDuration: number;
  } {
    return {
      ...this.stats,
      isInOverlap: this.isInOverlap,
      currentOverlapDuration: this.overlapStartTime
        ? Date.now() - this.overlapStartTime
        : 0,
    };
  }

  // ==========================================================================
  // State Management
  // ==========================================================================

  /**
   * Check if currently in overlap
   */
  isOverlapping(): boolean {
    return this.isInOverlap;
  }

  /**
   * Get current overlap duration
   */
  getCurrentOverlapDuration(): number {
    return this.overlapStartTime ? Date.now() - this.overlapStartTime : 0;
  }

  /**
   * Update configuration
   */
  updateConfig(config: Partial<FullDuplexConfig>): void {
    this.config = { ...this.config, ...config };
  }

  /**
   * Get current configuration
   */
  getConfig(): FullDuplexConfig {
    return { ...this.config };
  }

  /**
   * Reset state
   */
  reset(): void {
    this.overlapStartTime = null;
    this.isInOverlap = false;
    this.lastVadConfidence = 0;
    this.toolCallInProgress = false;
    this.toolCallStartTime = null;
    this.overlapHistory = [];
    this.stats = {
      totalOverlaps: 0,
      totalBackchannels: 0,
      totalInterrupts: 0,
      avgOverlapDuration: 0,
      interruptRate: 0,
    };
  }
}

// ============================================================================
// Factory Function
// ============================================================================

/**
 * Create a new OverlapHandler
 */
export function createOverlapHandler(
  config?: Partial<FullDuplexConfig>,
): OverlapHandler {
  return new OverlapHandler(config);
}
