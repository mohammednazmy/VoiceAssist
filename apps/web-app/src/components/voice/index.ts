/**
 * Voice Components Module
 *
 * Exports all voice-related UI components for the barge-in system.
 *
 * Phase 2: Instant Response & Feedback
 * Phase v4.1: Thinking Feedback Components
 */

// Feedback components
export {
  BargeInFeedback,
  ConfidenceIndicator,
  SpeakingIndicator,
  ListeningIndicator,
  type BargeInFeedbackType,
  type BargeInFeedbackProps,
  type ConfidenceIndicatorProps,
  type SpeakingIndicatorProps,
  type ListeningIndicatorProps,
} from "./BargeInFeedback";

// Thinking Feedback components (Voice Mode v4.1)
export {
  ThinkingFeedbackPanel,
  ThinkingFeedbackSettings,
} from "./ThinkingFeedbackPanel";

export {
  ThinkingVisualIndicator,
  type ThinkingVisualStyle,
} from "./ThinkingVisualIndicator";

// Latency Indicator (Voice Mode v4.1)
export { LatencyIndicator, LatencyBadge } from "./LatencyIndicator";
