/**
 * Conversation Manager Types
 *
 * Type definitions for conversation management including
 * sentiment analysis, discourse tracking, and tool call handling.
 *
 * Phase 10: Advanced Conversation Management
 */

// ============================================================================
// Sentiment Types
// ============================================================================

/**
 * Sentiment categories
 */
export type Sentiment =
  | "positive"
  | "neutral"
  | "negative"
  | "confused"
  | "frustrated"
  | "excited"
  | "curious";

/**
 * Result from sentiment analysis
 */
export interface SentimentResult {
  /** Primary sentiment */
  sentiment: Sentiment;

  /** Confidence level (0-1) */
  confidence: number;

  /** Valence: negative (-1) to positive (+1) */
  valence: number;

  /** Arousal: calm (0) to excited (1) */
  arousal: number;

  /** Secondary sentiment if detected */
  secondarySentiment?: Sentiment;

  /** Keywords that influenced detection */
  keywords?: string[];
}

/**
 * Default neutral sentiment
 */
export const NEUTRAL_SENTIMENT: SentimentResult = {
  sentiment: "neutral",
  confidence: 0.5,
  valence: 0,
  arousal: 0.5,
};

// ============================================================================
// Discourse Types
// ============================================================================

/**
 * Conversation phase
 */
export type ConversationPhase =
  | "opening"
  | "information_gathering"
  | "explanation"
  | "discussion"
  | "clarification"
  | "summary"
  | "closing";

/**
 * Speaker role
 */
export type SpeakerRole = "user" | "assistant";

/**
 * Discourse unit (single turn in conversation)
 */
export interface DiscourseUnit {
  /** Unique ID */
  id: string;

  /** Turn number */
  turn: number;

  /** Speaker */
  speaker: SpeakerRole;

  /** Content summary (not full text for privacy) */
  contentType:
    | "question"
    | "statement"
    | "command"
    | "acknowledgment"
    | "other";

  /** Topic keywords */
  topicKeywords: string[];

  /** Timestamp */
  timestamp: number;
}

/**
 * Discourse state
 */
export interface DiscourseState {
  /** Current topic (null if none established) */
  topic: string | null;

  /** Current conversation phase */
  phase: ConversationPhase;

  /** Topic coherence (0-1) */
  coherence: number;

  /** Number of topic shifts */
  topicShiftCount: number;

  /** Recent discourse units */
  recentUnits: DiscourseUnit[];

  /** Detected user intent patterns */
  intentPatterns: string[];
}

/**
 * Default discourse state
 */
export const INITIAL_DISCOURSE_STATE: DiscourseState = {
  topic: null,
  phase: "opening",
  coherence: 1.0,
  topicShiftCount: 0,
  recentUnits: [],
  intentPatterns: [],
};

// ============================================================================
// Tool Call Types
// ============================================================================

/**
 * Tool call status
 */
export type ToolCallStatus =
  | "pending"
  | "executing"
  | "completed"
  | "cancelled"
  | "rolled_back"
  | "failed";

/**
 * Tool call state
 */
export interface ToolCallState {
  /** Unique ID */
  id: string;

  /** Tool name */
  name: string;

  /** Current status */
  status: ToolCallStatus;

  /** Whether safe to interrupt */
  safeToInterrupt: boolean;

  /** Rollback function if available */
  rollbackAction?: () => Promise<void>;

  /** When the call started */
  startedAt: number;

  /** Estimated duration (ms) */
  estimatedDuration?: number;

  /** Progress (0-100) */
  progress?: number;
}

/**
 * Result of interruption handling
 */
export interface InterruptionResult {
  /** Whether interruption is allowed */
  canInterrupt: boolean;

  /** Recommended action */
  action: "cancel" | "rollback" | "queue" | "wait";

  /** Message to show user */
  userMessage?: string;

  /** Whether rollback was performed */
  rollbackPerformed?: boolean;

  /** Estimated wait time (ms) */
  estimatedWaitMs?: number;
}

/**
 * Categories of tools by interrupt safety
 */
export const CRITICAL_TOOLS = [
  "save_document",
  "send_email",
  "make_payment",
  "submit_form",
  "database_write",
  "file_write",
  "publish",
  "deploy",
] as const;

export const SAFE_TO_CANCEL_TOOLS = [
  "search",
  "read_document",
  "fetch_data",
  "calculate",
  "lookup",
  "query",
  "analyze",
] as const;

// ============================================================================
// Barge-In Event Types
// ============================================================================

/**
 * Barge-in event type
 */
export type BargeInType = "backchannel" | "soft_barge" | "hard_barge";

/**
 * Barge-in event from the voice system
 */
export interface BargeInEvent {
  /** Unique ID */
  id: string;

  /** Event type */
  type: BargeInType;

  /** Timestamp */
  timestamp: number;

  /** Duration of the utterance (ms) */
  duration: number;

  /** VAD confidence (0-1) */
  vadConfidence: number;

  /** Transcript if available */
  transcript?: string;

  /** How far through AI response (0-100%) */
  completionPercentage?: number;

  /** Whether AI was speaking */
  aiWasSpeaking: boolean;
}

// ============================================================================
// Conversation State Types
// ============================================================================

/**
 * Complete conversation state
 */
export interface ConversationState {
  /** Current sentiment */
  sentiment: SentimentResult;

  /** Discourse state */
  discourse: DiscourseState;

  /** Active tool calls */
  activeToolCalls: ToolCallState[];

  /** Turn count */
  turnCount: number;

  /** Barge-in history */
  bargeInHistory: BargeInEvent[];

  /** Last detected user intent */
  lastUserIntent: string | null;

  /** Suggested follow-up questions */
  suggestedFollowUps: string[];

  /** Session start time */
  sessionStartTime: number;

  /** Whether conversation is active */
  isActive: boolean;
}

/**
 * Recommendations for AI response behavior
 */
export interface ResponseRecommendations {
  /** Should speak slower */
  speakSlower: boolean;

  /** Should use simpler language */
  useSimpleLanguage: boolean;

  /** Should offer clarification */
  offerClarification: boolean;

  /** Should pause for questions */
  pauseForQuestions: boolean;

  /** Suggested tone */
  suggestedTone: "formal" | "casual" | "empathetic" | "neutral";

  /** Priority level for response */
  urgency: "low" | "normal" | "high";
}

// ============================================================================
// Configuration Types
// ============================================================================

/**
 * Conversation manager configuration
 */
export interface ConversationManagerConfig {
  /** Primary language */
  language: string;

  /** Enable sentiment tracking */
  enableSentimentTracking: boolean;

  /** Enable discourse analysis */
  enableDiscourseAnalysis: boolean;

  /** Maximum barge-in events to keep in history */
  maxBargeInHistory: number;

  /** Enable follow-up suggestions */
  followUpSuggestionEnabled: boolean;

  /** Maximum discourse units to keep */
  maxDiscourseUnits: number;

  /** Sentiment decay rate (per second) */
  sentimentDecayRate: number;
}

/**
 * Default configuration
 */
export const DEFAULT_CONVERSATION_MANAGER_CONFIG: ConversationManagerConfig = {
  language: "en",
  enableSentimentTracking: true,
  enableDiscourseAnalysis: true,
  maxBargeInHistory: 20,
  followUpSuggestionEnabled: true,
  maxDiscourseUnits: 10,
  sentimentDecayRate: 0.1,
};

// ============================================================================
// Event Types
// ============================================================================

/**
 * Conversation event types
 */
export type ConversationEventType =
  | "sentiment_change"
  | "phase_change"
  | "topic_change"
  | "barge_in"
  | "tool_call_start"
  | "tool_call_complete"
  | "interruption_handled"
  | "recommendation_update";

/**
 * Conversation event
 */
export interface ConversationEvent {
  type: ConversationEventType;
  timestamp: number;
  data: Record<string, unknown>;
}

/**
 * Conversation event callback
 */
export type ConversationEventCallback = (event: ConversationEvent) => void;
