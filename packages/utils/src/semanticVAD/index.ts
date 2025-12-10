/**
 * Semantic VAD Module
 *
 * Provides intelligent turn detection for voice conversations.
 * Analyzes transcripts using linguistic patterns and prosody hints
 * to determine when a user has finished their turn.
 *
 * Reference: docs/planning/VOICE_MODE_BARGE_IN_IMPROVEMENT_PLAN_V3.md
 */

// Turn detection types and utilities
export {
  type TurnCompletionSignals,
  type TurnAnalysisContext,
  type ProsodyHints,
  DEFAULT_TURN_SIGNALS,
  HESITATION_MARKERS_BY_LANGUAGE,
  getHesitationMarkers,
  isHesitationMarker,
  endsWithContinuationSignal,
  endsWithStrongCompletion,
} from "./turnDetection";

// Semantic turn analyzer
export {
  type TurnAction,
  type TurnAnalysisResult,
  type SemanticTurnAnalyzerConfig,
  SemanticTurnAnalyzer,
  createSemanticTurnAnalyzer,
  analyzeTranscript,
} from "./semanticTurnAnalyzer";
