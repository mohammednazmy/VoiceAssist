/**
 * Semantic Turn Analyzer
 *
 * Analyzes transcripts to determine if a user has finished their turn
 * in a voice conversation. Uses linguistic patterns, prosody hints,
 * and conversation context for intelligent turn detection.
 *
 * Reference: docs/planning/VOICE_MODE_BARGE_IN_IMPROVEMENT_PLAN_V3.md
 */

import {
  TurnCompletionSignals,
  TurnAnalysisContext,
  DEFAULT_TURN_SIGNALS,
} from "./turnDetection";

// =============================================================================
// Types
// =============================================================================

/**
 * The recommended action after analyzing a turn.
 */
export type TurnAction = "respond" | "wait" | "prompt_continuation";

/**
 * Result of turn analysis.
 */
export interface TurnAnalysisResult {
  /** Confidence that user has finished speaking (0-1) */
  completionConfidence: number;

  /** Recommended action */
  action: TurnAction;

  /** Human-readable reason for the decision */
  reason: string;

  /** Detected signals that influenced the decision */
  signals: {
    strongCompletion: string[];
    weakCompletion: string[];
    continuation: string[];
  };

  /** Recommended wait time before responding (ms) */
  recommendedWaitMs: number;

  /** Whether to use a filler phrase ("Let me think...") */
  useFillerPhrase: boolean;

  /** Whether the transcript appears to be a complete thought */
  isCompleteThought: boolean;
}

/**
 * Configuration options for the analyzer.
 */
export interface SemanticTurnAnalyzerConfig {
  /** Turn completion signals configuration */
  signals?: TurnCompletionSignals;

  /** Minimum confidence to consider turn complete */
  completionThreshold?: number;

  /** Default wait time for weak completion (ms) */
  weakCompletionWaitMs?: number;

  /** Default wait time for continuation signals (ms) */
  continuationWaitMs?: number;

  /** Maximum wait time before responding anyway (ms) */
  maxWaitMs?: number;

  /** Language code for multilingual support */
  language?: string;
}

// =============================================================================
// Semantic Turn Analyzer
// =============================================================================

/**
 * Analyzes speech transcripts to determine turn completion.
 */
export class SemanticTurnAnalyzer {
  private signals: TurnCompletionSignals;
  private conversationContext: string[] = [];
  private lastAnalysis: TurnAnalysisResult | null = null;

  // Configuration
  private completionThreshold: number;
  private weakCompletionWaitMs: number;
  private continuationWaitMs: number;
  private maxWaitMs: number;
  private _language: string; // Reserved for future multilingual support

  constructor(config: SemanticTurnAnalyzerConfig = {}) {
    this.signals = config.signals ?? DEFAULT_TURN_SIGNALS;
    this.completionThreshold = config.completionThreshold ?? 0.65;
    this.weakCompletionWaitMs = config.weakCompletionWaitMs ?? 800;
    this.continuationWaitMs = config.continuationWaitMs ?? 2000;
    this.maxWaitMs = config.maxWaitMs ?? 5000;
    this._language = config.language ?? "en";
  }

  /**
   * Analyze a transcript to determine if the user has finished their turn.
   *
   * @param transcript - The transcript text to analyze
   * @param silenceDurationMs - How long since the user stopped speaking
   * @param context - Additional context for analysis
   * @returns Analysis result with recommended action
   */
  analyze(
    transcript: string,
    silenceDurationMs: number,
    context: TurnAnalysisContext = { isPartial: false }
  ): TurnAnalysisResult {
    const text = transcript.trim();
    const normalizedText = text.toLowerCase();

    // Initialize detected signals
    const detectedSignals = {
      strongCompletion: [] as string[],
      weakCompletion: [] as string[],
      continuation: [] as string[],
    };

    // =========================================
    // PHASE 1: Check for continuation signals (user NOT done)
    // =========================================

    this.detectContinuationSignals(normalizedText, context, detectedSignals);

    // =========================================
    // PHASE 2: Check for strong completion signals
    // =========================================

    this.detectStrongCompletionSignals(text, normalizedText, detectedSignals);

    // =========================================
    // PHASE 3: Check for weak completion signals
    // =========================================

    this.detectWeakCompletionSignals(text, normalizedText, detectedSignals);

    // =========================================
    // PHASE 4: Calculate completion confidence
    // =========================================

    const confidenceResult = this.calculateConfidence(
      detectedSignals,
      silenceDurationMs,
      context
    );

    // =========================================
    // PHASE 5: Determine action
    // =========================================

    const result = this.determineAction(
      confidenceResult,
      detectedSignals,
      silenceDurationMs,
      context
    );

    // Cache result
    this.lastAnalysis = result;

    return result;
  }

  /**
   * Add context from previous utterances.
   */
  addContext(utterance: string): void {
    this.conversationContext.push(utterance);
    // Keep only last 5 utterances
    if (this.conversationContext.length > 5) {
      this.conversationContext.shift();
    }
  }

  /**
   * Clear conversation context.
   */
  clearContext(): void {
    this.conversationContext = [];
  }

  /**
   * Get the last analysis result.
   */
  getLastAnalysis(): TurnAnalysisResult | null {
    return this.lastAnalysis;
  }

  /**
   * Get the configured language.
   */
  getLanguage(): string {
    return this._language;
  }

  // ---------------------------------------------------------------------------
  // Internal: Signal Detection
  // ---------------------------------------------------------------------------

  private detectContinuationSignals(
    normalizedText: string,
    context: TurnAnalysisContext,
    signals: { continuation: string[] }
  ): void {
    // Check hesitation markers at end
    for (const marker of this.signals.continuationSignals.hesitationMarkers) {
      if (normalizedText.endsWith(marker) || normalizedText.endsWith(marker + " ")) {
        signals.continuation.push(`hesitation:${marker}`);
      }
    }

    // Check trailing conjunctions
    for (const conj of this.signals.continuationSignals.conjunctions) {
      if (
        normalizedText.endsWith(conj) ||
        normalizedText.endsWith(conj + " ") ||
        normalizedText.endsWith(conj + ",")
      ) {
        signals.continuation.push(`conjunction:${conj}`);
      }
    }

    // Check incomplete patterns
    for (const pattern of this.signals.continuationSignals.incompletePatterns) {
      if (pattern.test(normalizedText)) {
        signals.continuation.push(`incomplete:pattern`);
      }
    }

    // Check prosody hints
    if (context.prosodyHints?.risingIntonation) {
      signals.continuation.push("prosody:rising_intonation");
    }

    // Check for partial transcript
    if (context.isPartial) {
      signals.continuation.push("partial_transcript");
    }
  }

  private detectStrongCompletionSignals(
    text: string,
    normalizedText: string,
    signals: { strongCompletion: string[] }
  ): void {
    // Question endings
    if (this.signals.strongCompletion.questionEndings.test(text)) {
      signals.strongCompletion.push("question_ending");
    }

    // Command verbs (short utterances ending with command)
    const words = normalizedText.split(/\s+/);
    const lastWord = words[words.length - 1]?.replace(/[.!?,;:]/g, "");
    if (this.signals.strongCompletion.commandVerbs.includes(lastWord) && words.length <= 5) {
      signals.strongCompletion.push(`command:${lastWord}`);
    }

    // Acknowledgments
    for (const ack of this.signals.strongCompletion.acknowledgments) {
      if (
        normalizedText === ack ||
        normalizedText.endsWith(" " + ack) ||
        normalizedText.endsWith(ack + ".")
      ) {
        signals.strongCompletion.push(`acknowledgment:${ack}`);
      }
    }

    // Farewells
    for (const farewell of this.signals.strongCompletion.farewells) {
      if (normalizedText === farewell || normalizedText.includes(farewell)) {
        signals.strongCompletion.push(`farewell:${farewell}`);
      }
    }
  }

  private detectWeakCompletionSignals(
    text: string,
    normalizedText: string,
    signals: { weakCompletion: string[] }
  ): void {
    // Statement endings
    if (this.signals.weakCompletion.statementEndings.test(text)) {
      signals.weakCompletion.push("statement_ending");
    }

    // Trailing punctuation (comma, semicolon, colon)
    if (this.signals.weakCompletion.trailingPunctuation.test(text)) {
      signals.weakCompletion.push("trailing_punctuation");
    }

    // Complete clause pattern
    if (this.signals.weakCompletion.completeClause.test(text)) {
      signals.weakCompletion.push("complete_clause");
    }

    // Check if transcript has reasonable length for a complete thought
    const wordCount = normalizedText.split(/\s+/).filter((w) => w.length > 0).length;
    if (wordCount >= 3 && wordCount <= 20) {
      signals.weakCompletion.push("reasonable_length");
    }
  }

  // ---------------------------------------------------------------------------
  // Internal: Confidence Calculation
  // ---------------------------------------------------------------------------

  private calculateConfidence(
    signals: {
      strongCompletion: string[];
      weakCompletion: string[];
      continuation: string[];
    },
    silenceDurationMs: number,
    context: TurnAnalysisContext
  ): number {
    let confidence = 0.5; // Start at neutral

    // Strong completion signals boost confidence significantly
    if (signals.strongCompletion.length > 0) {
      confidence += 0.3 * signals.strongCompletion.length;
    }

    // Weak completion signals provide moderate boost
    if (signals.weakCompletion.length > 0) {
      confidence += 0.15 * signals.weakCompletion.length;
    }

    // Continuation signals reduce confidence significantly
    if (signals.continuation.length > 0) {
      confidence -= 0.25 * signals.continuation.length;
    }

    // Silence duration affects confidence
    if (silenceDurationMs > 2000) {
      confidence += 0.2; // Long silence = likely done
    } else if (silenceDurationMs > 1000) {
      confidence += 0.1;
    } else if (silenceDurationMs < 300) {
      confidence -= 0.1; // Very short silence = likely not done
    }

    // Prosody hints
    if (context.prosodyHints) {
      if (context.prosodyHints.energyDecline) {
        confidence += 0.1; // Trailing off = likely done
      }
      if (context.prosodyHints.finalPitchDirection === "down") {
        confidence += 0.1; // Falling pitch = statement complete
      }
    }

    // Partial transcript = definitely not done
    if (context.isPartial) {
      confidence = Math.min(confidence, 0.3);
    }

    // Clamp to [0, 1]
    return Math.max(0, Math.min(1, confidence));
  }

  // ---------------------------------------------------------------------------
  // Internal: Action Determination
  // ---------------------------------------------------------------------------

  private determineAction(
    confidence: number,
    signals: {
      strongCompletion: string[];
      weakCompletion: string[];
      continuation: string[];
    },
    silenceDurationMs: number,
    _context: TurnAnalysisContext // Reserved for future context-aware decisions
  ): TurnAnalysisResult {
    let action: TurnAction;
    let reason: string;
    let recommendedWaitMs: number;
    let useFillerPhrase = false;

    // Determine if this is a complete thought
    const isCompleteThought =
      signals.strongCompletion.length > 0 ||
      (signals.weakCompletion.length > 0 && signals.continuation.length === 0);

    // High confidence - respond now
    if (confidence >= this.completionThreshold) {
      if (signals.strongCompletion.length > 0) {
        action = "respond";
        reason = `Strong completion: ${signals.strongCompletion.join(", ")}`;
        recommendedWaitMs = 0;
      } else {
        action = "respond";
        reason = `Weak completion with high confidence (${(confidence * 100).toFixed(0)}%)`;
        recommendedWaitMs = this.weakCompletionWaitMs;
      }
    }
    // Medium confidence with continuation signals - wait
    else if (signals.continuation.length > 0) {
      action = "wait";
      reason = `Continuation detected: ${signals.continuation.join(", ")}`;
      recommendedWaitMs = this.continuationWaitMs;
    }
    // Low confidence - wait but maybe prompt
    else if (confidence < 0.4) {
      // If silence is getting long, prompt for continuation
      if (silenceDurationMs > 3000) {
        action = "prompt_continuation";
        reason = "Long silence with uncertain completion";
        recommendedWaitMs = 0;
        useFillerPhrase = true;
      } else {
        action = "wait";
        reason = `Low confidence (${(confidence * 100).toFixed(0)}%)`;
        recommendedWaitMs = Math.min(this.continuationWaitMs, this.maxWaitMs - silenceDurationMs);
      }
    }
    // Medium confidence - wait briefly
    else {
      action = "wait";
      reason = `Medium confidence (${(confidence * 100).toFixed(0)}%)`;
      recommendedWaitMs = this.weakCompletionWaitMs;
    }

    // Cap wait time
    recommendedWaitMs = Math.max(0, Math.min(recommendedWaitMs, this.maxWaitMs));

    // Force response if we've waited too long
    if (silenceDurationMs >= this.maxWaitMs) {
      action = "respond";
      reason = `Max wait time (${this.maxWaitMs}ms) exceeded`;
      recommendedWaitMs = 0;
    }

    return {
      completionConfidence: confidence,
      action,
      reason,
      signals,
      recommendedWaitMs,
      useFillerPhrase,
      isCompleteThought,
    };
  }
}

// =============================================================================
// Factory Function
// =============================================================================

/**
 * Create a semantic turn analyzer with default configuration.
 */
export function createSemanticTurnAnalyzer(
  config?: SemanticTurnAnalyzerConfig
): SemanticTurnAnalyzer {
  return new SemanticTurnAnalyzer(config);
}

// =============================================================================
// Quick Analysis Helper
// =============================================================================

/**
 * Quick turn analysis without creating an analyzer instance.
 * Useful for simple use cases or testing.
 */
export function analyzeTranscript(
  transcript: string,
  silenceDurationMs: number = 0,
  context: TurnAnalysisContext = { isPartial: false }
): TurnAnalysisResult {
  const analyzer = new SemanticTurnAnalyzer();
  return analyzer.analyze(transcript, silenceDurationMs, context);
}
