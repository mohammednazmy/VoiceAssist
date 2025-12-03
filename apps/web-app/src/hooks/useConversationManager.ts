/**
 * useConversationManager Hook
 *
 * React hook for advanced conversation management including
 * sentiment tracking, discourse analysis, and tool call handling.
 *
 * Phase 10: Advanced Conversation Management
 */

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  ConversationManager,
  createConversationManager,
  type ConversationState,
  type ConversationManagerConfig,
  type ConversationEvent,
  type SentimentResult,
  type DiscourseState,
  type BargeInEvent,
  type ResponseRecommendations,
  type ToolCallState,
} from "../lib/conversationManager";

// ============================================================================
// Types
// ============================================================================

export interface UseConversationManagerOptions {
  /** Primary language */
  language?: string;

  /** Enable sentiment tracking */
  enableSentimentTracking?: boolean;

  /** Enable discourse analysis */
  enableDiscourseAnalysis?: boolean;

  /** Callback when sentiment changes */
  onSentimentChange?: (sentiment: SentimentResult) => void;

  /** Callback when phase changes */
  onPhaseChange?: (phase: DiscourseState["phase"]) => void;

  /** Callback when barge-in is handled */
  onBargeInHandled?: (result: {
    shouldInterrupt: boolean;
    message?: string;
  }) => void;

  /** Callback for any conversation event */
  onEvent?: (event: ConversationEvent) => void;
}

export interface UseConversationManagerReturn {
  // State
  state: ConversationState;
  sentiment: SentimentResult;
  discourse: DiscourseState;
  isActive: boolean;

  // Processing
  processUtterance: (transcript: string, duration: number) => void;
  processAIResponse: (response: string) => void;

  // Barge-in
  handleBargeIn: (event: BargeInEvent) => {
    shouldInterrupt: boolean;
    shouldSummarize: boolean;
    message?: string;
  };

  // Tool calls
  registerToolCall: (
    id: string,
    name: string,
    options?: {
      safeToInterrupt?: boolean;
      rollbackAction?: () => Promise<void>;
      estimatedDuration?: number;
    },
  ) => ToolCallState;
  updateToolCallStatus: (
    id: string,
    status: ToolCallState["status"],
    progress?: number,
  ) => void;
  activeToolCalls: ToolCallState[];

  // Recommendations
  recommendations: ResponseRecommendations;
  suggestedFollowUps: string[];

  // Configuration
  setLanguage: (language: string) => void;

  // Lifecycle
  reset: () => void;
  endConversation: () => void;
}

// ============================================================================
// Hook Implementation
// ============================================================================

export function useConversationManager(
  options: UseConversationManagerOptions = {},
): UseConversationManagerReturn {
  const {
    language = "en",
    enableSentimentTracking = true,
    enableDiscourseAnalysis = true,
    onSentimentChange,
    onPhaseChange,
    onBargeInHandled,
    onEvent,
  } = options;

  // Manager instance
  const managerRef = useRef<ConversationManager | null>(null);

  // State
  const [state, setState] = useState<ConversationState>({
    sentiment: {
      sentiment: "neutral",
      confidence: 0.5,
      valence: 0,
      arousal: 0.5,
    },
    discourse: {
      topic: null,
      phase: "opening",
      coherence: 1.0,
      topicShiftCount: 0,
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
  });

  const [recommendations, setRecommendations] =
    useState<ResponseRecommendations>({
      speakSlower: false,
      useSimpleLanguage: false,
      offerClarification: false,
      pauseForQuestions: false,
      suggestedTone: "neutral",
      urgency: "normal",
    });

  // Callback refs to avoid stale closures
  const onSentimentChangeRef = useRef(onSentimentChange);
  const onPhaseChangeRef = useRef(onPhaseChange);
  const onBargeInHandledRef = useRef(onBargeInHandled);
  const onEventRef = useRef(onEvent);

  useEffect(() => {
    onSentimentChangeRef.current = onSentimentChange;
    onPhaseChangeRef.current = onPhaseChange;
    onBargeInHandledRef.current = onBargeInHandled;
    onEventRef.current = onEvent;
  }, [onSentimentChange, onPhaseChange, onBargeInHandled, onEvent]);

  // Initialize manager
  useEffect(() => {
    const config: Partial<ConversationManagerConfig> = {
      language,
      enableSentimentTracking,
      enableDiscourseAnalysis,
    };

    const manager = createConversationManager(config);
    managerRef.current = manager;

    // Subscribe to events
    const unsubscribe = manager.onEvent((event) => {
      onEventRef.current?.(event);

      // Handle specific events
      if (event.type === "sentiment_change") {
        onSentimentChangeRef.current?.(
          event.data as unknown as SentimentResult,
        );
      } else if (event.type === "phase_change") {
        onPhaseChangeRef.current?.(
          event.data.current as DiscourseState["phase"],
        );
      }

      // Update state
      setState(manager.getState());
      setRecommendations(manager.getResponseRecommendations());
    });

    // Set initial state
    setState(manager.getState());

    return () => {
      unsubscribe();
      managerRef.current = null;
    };
  }, [language, enableSentimentTracking, enableDiscourseAnalysis]);

  // Process user utterance
  const processUtterance = useCallback(
    (transcript: string, duration: number) => {
      if (!managerRef.current) return;

      managerRef.current.processUserUtterance(transcript, duration);
      setState(managerRef.current.getState());
      setRecommendations(managerRef.current.getResponseRecommendations());
    },
    [],
  );

  // Process AI response
  const processAIResponse = useCallback((response: string) => {
    if (!managerRef.current) return;

    managerRef.current.processAIResponse(response);
    setState(managerRef.current.getState());
  }, []);

  // Handle barge-in
  const handleBargeIn = useCallback((event: BargeInEvent) => {
    if (!managerRef.current) {
      return { shouldInterrupt: true, shouldSummarize: false };
    }

    const result = managerRef.current.handleBargeIn(event);
    setState(managerRef.current.getState());
    setRecommendations(managerRef.current.getResponseRecommendations());

    onBargeInHandledRef.current?.(result);

    return result;
  }, []);

  // Register tool call
  const registerToolCall = useCallback(
    (
      id: string,
      name: string,
      options?: {
        safeToInterrupt?: boolean;
        rollbackAction?: () => Promise<void>;
        estimatedDuration?: number;
      },
    ) => {
      if (!managerRef.current) {
        return {
          id,
          name,
          status: "pending" as const,
          safeToInterrupt: true,
          startedAt: Date.now(),
        };
      }

      const toolCall = managerRef.current.registerToolCall(id, name, options);
      setState(managerRef.current.getState());
      return toolCall;
    },
    [],
  );

  // Update tool call status
  const updateToolCallStatus = useCallback(
    (id: string, status: ToolCallState["status"], progress?: number) => {
      if (!managerRef.current) return;

      managerRef.current.updateToolCallStatus(id, status, progress);
      setState(managerRef.current.getState());
    },
    [],
  );

  // Set language
  const setLanguage = useCallback((newLanguage: string) => {
    if (!managerRef.current) return;

    managerRef.current.setLanguage(newLanguage);
  }, []);

  // Reset
  const reset = useCallback(() => {
    if (!managerRef.current) return;

    managerRef.current.reset();
    setState(managerRef.current.getState());
    setRecommendations(managerRef.current.getResponseRecommendations());
  }, []);

  // End conversation
  const endConversation = useCallback(() => {
    if (!managerRef.current) return;

    managerRef.current.endConversation();
    setState(managerRef.current.getState());
  }, []);

  // Memoized values
  const sentiment = useMemo(() => state.sentiment, [state.sentiment]);
  const discourse = useMemo(() => state.discourse, [state.discourse]);
  const activeToolCalls = useMemo(
    () => state.activeToolCalls,
    [state.activeToolCalls],
  );
  const suggestedFollowUps = useMemo(
    () => state.suggestedFollowUps,
    [state.suggestedFollowUps],
  );

  return {
    // State
    state,
    sentiment,
    discourse,
    isActive: state.isActive,

    // Processing
    processUtterance,
    processAIResponse,

    // Barge-in
    handleBargeIn,

    // Tool calls
    registerToolCall,
    updateToolCallStatus,
    activeToolCalls,

    // Recommendations
    recommendations,
    suggestedFollowUps,

    // Configuration
    setLanguage,

    // Lifecycle
    reset,
    endConversation,
  };
}

export default useConversationManager;
