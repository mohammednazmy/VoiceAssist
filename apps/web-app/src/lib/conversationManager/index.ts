/**
 * Conversation Manager
 *
 * Orchestrates sentiment analysis, discourse tracking, and tool
 * call handling for context-aware AI behavior during voice interactions.
 *
 * Phase 10: Advanced Conversation Management
 */

// Re-export types and components
export * from "./types";
export {
  SentimentAnalyzer,
  createSentimentAnalyzer,
} from "./sentimentAnalyzer";
export { DiscourseTracker, createDiscourseTracker } from "./discourseTracker";
export {
  ToolCallHandler,
  createToolCallHandler,
  type ToolCallHandlerConfig,
} from "./toolCallHandler";

import { SentimentAnalyzer } from "./sentimentAnalyzer";
import { DiscourseTracker } from "./discourseTracker";
import { ToolCallHandler } from "./toolCallHandler";
import type {
  ConversationState,
  ConversationManagerConfig,
  ConversationEvent,
  ConversationEventCallback,
  SentimentResult,
  DiscourseState,
  ToolCallState,
  BargeInEvent,
  ResponseRecommendations,
} from "./types";
import {
  NEUTRAL_SENTIMENT,
  INITIAL_DISCOURSE_STATE,
  DEFAULT_CONVERSATION_MANAGER_CONFIG,
} from "./types";

// ============================================================================
// Conversation Manager
// ============================================================================

/**
 * Main conversation manager that orchestrates all components
 */
export class ConversationManager {
  private config: ConversationManagerConfig;

  /** Component instances */
  private sentimentAnalyzer: SentimentAnalyzer;
  private discourseTracker: DiscourseTracker;
  private toolCallHandler: ToolCallHandler;

  /** Current state */
  private state: ConversationState;

  /** Event callbacks */
  private eventCallbacks: Set<ConversationEventCallback> = new Set();

  constructor(config: Partial<ConversationManagerConfig> = {}) {
    this.config = { ...DEFAULT_CONVERSATION_MANAGER_CONFIG, ...config };

    // Initialize components
    this.sentimentAnalyzer = new SentimentAnalyzer(this.config.language);
    this.discourseTracker = new DiscourseTracker(this.config.maxDiscourseUnits);
    this.toolCallHandler = new ToolCallHandler();

    // Initialize state
    this.state = this.createInitialState();
  }

  // ==========================================================================
  // Initialization
  // ==========================================================================

  /**
   * Create initial conversation state
   */
  private createInitialState(): ConversationState {
    return {
      sentiment: { ...NEUTRAL_SENTIMENT },
      discourse: {
        ...INITIAL_DISCOURSE_STATE,
        recentUnits: [],
        intentPatterns: [],
      },
      activeToolCalls: [],
      turnCount: 0,
      bargeInHistory: [],
      lastUserIntent: null,
      suggestedFollowUps: [],
      sessionStartTime: Date.now(),
      isActive: true,
    };
  }

  // ==========================================================================
  // User Utterance Processing
  // ==========================================================================

  /**
   * Process a user utterance and update conversation state
   */
  processUserUtterance(
    transcript: string,
    duration: number,
  ): ConversationState {
    this.state.turnCount++;

    // Analyze sentiment
    if (this.config.enableSentimentTracking) {
      const previousSentiment = this.state.sentiment.sentiment;
      this.state.sentiment = this.sentimentAnalyzer.analyze(transcript);

      if (this.state.sentiment.sentiment !== previousSentiment) {
        this.emitEvent({
          type: "sentiment_change",
          timestamp: Date.now(),
          data: {
            previous: previousSentiment,
            current: this.state.sentiment.sentiment,
            confidence: this.state.sentiment.confidence,
          },
        });
      }
    }

    // Update discourse
    if (this.config.enableDiscourseAnalysis) {
      const previousPhase = this.state.discourse.phase;
      const previousTopic = this.state.discourse.topic;

      this.state.discourse = this.discourseTracker.update(transcript, "user");

      if (this.state.discourse.phase !== previousPhase) {
        this.emitEvent({
          type: "phase_change",
          timestamp: Date.now(),
          data: {
            previous: previousPhase,
            current: this.state.discourse.phase,
          },
        });
      }

      if (this.state.discourse.topic !== previousTopic) {
        this.emitEvent({
          type: "topic_change",
          timestamp: Date.now(),
          data: {
            previous: previousTopic,
            current: this.state.discourse.topic,
          },
        });
      }
    }

    // Update suggested follow-ups based on sentiment
    this.updateSuggestedFollowUps();

    // Detect user intent
    this.detectUserIntent(transcript);

    return this.getState();
  }

  /**
   * Process an AI response
   */
  processAIResponse(response: string): void {
    if (this.config.enableDiscourseAnalysis) {
      this.discourseTracker.update(response, "assistant");
      this.state.discourse = this.discourseTracker.getState();
    }
  }

  // ==========================================================================
  // Barge-In Handling
  // ==========================================================================

  /**
   * Handle a barge-in event
   */
  handleBargeIn(event: BargeInEvent): {
    shouldInterrupt: boolean;
    shouldSummarize: boolean;
    message?: string;
  } {
    // Add to history
    this.state.bargeInHistory.push(event);
    if (this.state.bargeInHistory.length > this.config.maxBargeInHistory) {
      this.state.bargeInHistory.shift();
    }

    // Emit event
    this.emitEvent({
      type: "barge_in",
      timestamp: Date.now(),
      data: { type: event.type, duration: event.duration },
    });

    // Check for active tool calls
    const activeToolCall = this.state.activeToolCalls.find(
      (tc) => tc.status === "executing",
    );

    if (activeToolCall && event.type === "hard_barge") {
      const result = this.toolCallHandler.handleInterruption(
        activeToolCall,
        event,
      );

      this.emitEvent({
        type: "interruption_handled",
        timestamp: Date.now(),
        data: {
          toolCallId: activeToolCall.id,
          canInterrupt: result.canInterrupt,
          action: result.action,
        },
      });

      if (!result.canInterrupt) {
        return {
          shouldInterrupt: false,
          shouldSummarize: false,
          message: result.userMessage,
        };
      }
    }

    // Analyze barge-in patterns for frustration detection
    this.analyzeBargeInPatterns();

    return {
      shouldInterrupt: true,
      shouldSummarize: (event.completionPercentage ?? 0) > 30,
    };
  }

  /**
   * Analyze barge-in patterns to detect frustration
   */
  private analyzeBargeInPatterns(): void {
    const recentWindow = 60000; // 1 minute
    const now = Date.now();

    const recentHardBarges = this.state.bargeInHistory.filter(
      (b) => b.type === "hard_barge" && now - b.timestamp < recentWindow,
    );

    // Multiple hard barges in short time suggests frustration
    if (recentHardBarges.length >= 3) {
      this.state.sentiment = {
        ...this.state.sentiment,
        sentiment: "frustrated",
        confidence: Math.min(0.95, this.state.sentiment.confidence + 0.2),
        valence: Math.max(-0.8, this.state.sentiment.valence - 0.2),
      };

      this.emitEvent({
        type: "sentiment_change",
        timestamp: Date.now(),
        data: {
          source: "barge_in_pattern",
          sentiment: "frustrated",
          hardBargeCount: recentHardBarges.length,
        },
      });
    }
  }

  // ==========================================================================
  // Tool Call Management
  // ==========================================================================

  /**
   * Register a tool call
   */
  registerToolCall(
    id: string,
    name: string,
    options: {
      safeToInterrupt?: boolean;
      rollbackAction?: () => Promise<void>;
      estimatedDuration?: number;
    } = {},
  ): ToolCallState {
    const toolCall = this.toolCallHandler.registerToolCall(id, name, options);
    this.state.activeToolCalls.push(toolCall);

    this.emitEvent({
      type: "tool_call_start",
      timestamp: Date.now(),
      data: { id, name, safeToInterrupt: toolCall.safeToInterrupt },
    });

    return toolCall;
  }

  /**
   * Update tool call status
   */
  updateToolCallStatus(
    id: string,
    status: ToolCallState["status"],
    progress?: number,
  ): void {
    this.toolCallHandler.updateStatus(id, status, progress);

    // Update local state
    const toolCall = this.state.activeToolCalls.find((tc) => tc.id === id);
    if (toolCall) {
      toolCall.status = status;
      if (progress !== undefined) {
        toolCall.progress = progress;
      }

      // Remove completed tool calls from active list
      if (
        ["completed", "cancelled", "rolled_back", "failed"].includes(status)
      ) {
        this.state.activeToolCalls = this.state.activeToolCalls.filter(
          (tc) => tc.id !== id,
        );

        this.emitEvent({
          type: "tool_call_complete",
          timestamp: Date.now(),
          data: { id, status },
        });
      }
    }
  }

  // ==========================================================================
  // Recommendations
  // ==========================================================================

  /**
   * Get recommendations for AI response behavior
   */
  getResponseRecommendations(): ResponseRecommendations {
    const { sentiment, discourse, bargeInHistory } = this.state;

    const recentWindow = 120000; // 2 minutes
    const now = Date.now();
    const recentBargeIns = bargeInHistory.filter(
      (b) => now - b.timestamp < recentWindow,
    );

    // Determine suggested tone
    let suggestedTone: ResponseRecommendations["suggestedTone"] = "neutral";
    if (
      sentiment.sentiment === "frustrated" ||
      sentiment.sentiment === "negative"
    ) {
      suggestedTone = "empathetic";
    } else if (
      sentiment.sentiment === "positive" ||
      sentiment.sentiment === "excited"
    ) {
      suggestedTone = "casual";
    } else if (discourse.phase === "closing" || discourse.phase === "summary") {
      suggestedTone = "formal";
    }

    // Determine urgency
    let urgency: ResponseRecommendations["urgency"] = "normal";
    if (recentBargeIns.length >= 3) {
      urgency = "high";
    } else if (sentiment.sentiment === "curious") {
      urgency = "low";
    }

    const recommendations: ResponseRecommendations = {
      speakSlower:
        sentiment.sentiment === "frustrated" ||
        sentiment.sentiment === "confused",
      useSimpleLanguage: recentBargeIns.length > 2,
      offerClarification: sentiment.sentiment === "confused",
      pauseForQuestions:
        discourse.phase === "explanation" &&
        recentBargeIns.some((b) => b.type === "soft_barge"),
      suggestedTone,
      urgency,
    };

    this.emitEvent({
      type: "recommendation_update",
      timestamp: Date.now(),
      data: recommendations as unknown as Record<string, unknown>,
    });

    return recommendations;
  }

  /**
   * Update suggested follow-ups based on current state
   */
  private updateSuggestedFollowUps(): void {
    const suggestions: string[] = [];
    const { sentiment, discourse } = this.state;

    // Frustrated user
    if (sentiment.sentiment === "frustrated") {
      suggestions.push("Would you like me to slow down?");
      suggestions.push("Let me try explaining that differently.");
      suggestions.push("I apologize for any confusion. How can I help better?");
    }

    // Confused user
    if (sentiment.sentiment === "confused") {
      suggestions.push("Would you like me to clarify that?");
      suggestions.push("Let me break that down step by step.");
      suggestions.push("What part would you like me to explain further?");
    }

    // Curious user
    if (sentiment.sentiment === "curious") {
      suggestions.push("Would you like to know more about this?");
      suggestions.push("There's more to explore here if you're interested.");
    }

    // Based on phase
    if (discourse.phase === "explanation" && discourse.coherence < 0.5) {
      suggestions.push("Shall I recap what we've covered?");
    }

    if (discourse.phase === "closing") {
      suggestions.push("Is there anything else I can help with?");
    }

    this.state.suggestedFollowUps = suggestions.slice(0, 3);
  }

  /**
   * Detect user intent from transcript
   */
  private detectUserIntent(transcript: string): void {
    const lowerText = transcript.toLowerCase();

    if (lowerText.match(/(help|assist|how do i)/i)) {
      this.state.lastUserIntent = "seeking_help";
    } else if (lowerText.match(/(what|who|where|when|why|explain)/i)) {
      this.state.lastUserIntent = "seeking_information";
    } else if (lowerText.match(/(do|make|create|find|search)/i)) {
      this.state.lastUserIntent = "task_request";
    } else if (lowerText.match(/(stop|cancel|nevermind|forget)/i)) {
      this.state.lastUserIntent = "cancellation";
    } else if (lowerText.match(/(thanks|thank you|bye|goodbye)/i)) {
      this.state.lastUserIntent = "closing";
    }
  }

  // ==========================================================================
  // State Access
  // ==========================================================================

  /**
   * Get current state
   */
  getState(): ConversationState {
    return {
      ...this.state,
      sentiment: { ...this.state.sentiment },
      discourse: {
        ...this.state.discourse,
        recentUnits: [...this.state.discourse.recentUnits],
        intentPatterns: [...this.state.discourse.intentPatterns],
      },
      activeToolCalls: this.state.activeToolCalls.map((tc) => ({ ...tc })),
      bargeInHistory: [...this.state.bargeInHistory],
      suggestedFollowUps: [...this.state.suggestedFollowUps],
    };
  }

  /**
   * Get current sentiment
   */
  getSentiment(): SentimentResult {
    return { ...this.state.sentiment };
  }

  /**
   * Get discourse state
   */
  getDiscourseState(): DiscourseState {
    return this.discourseTracker.getState();
  }

  /**
   * Get suggested follow-ups
   */
  getSuggestedFollowUps(): string[] {
    return [...this.state.suggestedFollowUps];
  }

  /**
   * Check if conversation is active
   */
  isActive(): boolean {
    return this.state.isActive;
  }

  // ==========================================================================
  // Configuration
  // ==========================================================================

  /**
   * Set language
   */
  setLanguage(language: string): void {
    this.config.language = language;
    this.sentimentAnalyzer.setLanguage(language);
  }

  /**
   * Enable/disable sentiment tracking
   */
  setSentimentTrackingEnabled(enabled: boolean): void {
    this.config.enableSentimentTracking = enabled;
  }

  /**
   * Enable/disable discourse analysis
   */
  setDiscourseAnalysisEnabled(enabled: boolean): void {
    this.config.enableDiscourseAnalysis = enabled;
  }

  // ==========================================================================
  // Events
  // ==========================================================================

  /**
   * Subscribe to conversation events
   */
  onEvent(callback: ConversationEventCallback): () => void {
    this.eventCallbacks.add(callback);
    return () => this.eventCallbacks.delete(callback);
  }

  /**
   * Emit an event
   */
  private emitEvent(event: ConversationEvent): void {
    this.eventCallbacks.forEach((callback) => callback(event));
  }

  // ==========================================================================
  // Lifecycle
  // ==========================================================================

  /**
   * Reset conversation state
   */
  reset(): void {
    this.state = this.createInitialState();
    this.sentimentAnalyzer.reset();
    this.discourseTracker.reset();
    this.toolCallHandler.reset();
  }

  /**
   * End conversation
   */
  endConversation(): void {
    this.state.isActive = false;
  }
}

// ============================================================================
// Factory Function
// ============================================================================

/**
 * Create a new conversation manager
 */
export function createConversationManager(
  config?: Partial<ConversationManagerConfig>,
): ConversationManager {
  return new ConversationManager(config);
}
