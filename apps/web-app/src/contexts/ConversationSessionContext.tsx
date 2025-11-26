/**
 * ConversationSessionContext
 *
 * Unified context that composes useChatSession, useRealtimeVoiceSession,
 * useBranching, and useConversations for the active conversation.
 *
 * This provides a single source of truth for:
 * - Active conversation and branch state
 * - Chat WebSocket session management
 * - Voice mode session management
 * - Branch creation and navigation
 * - Connection status across all channels
 */

import {
  createContext,
  useContext,
  useCallback,
  useState,
  useEffect,
  useMemo,
  type ReactNode,
} from "react";
import { useChatSession } from "../hooks/useChatSession";
import {
  useRealtimeVoiceSession,
  type ConnectionStatus as VoiceConnectionStatus,
  type VoiceMetrics,
  type VoiceSettings,
} from "../hooks/useRealtimeVoiceSession";
import { useBranching } from "../hooks/useBranching";
import { useConversations } from "../hooks/useConversations";
import { useAuth } from "../hooks/useAuth";
import type {
  Message,
  Conversation,
  Branch,
  ConnectionStatus,
  WebSocketErrorCode,
} from "@voiceassist/types";

// ============================================================================
// Types
// ============================================================================

export type UnifiedConnectionStatus =
  | "idle"
  | "connecting"
  | "connected"
  | "reconnecting"
  | "error"
  | "disconnected";

export type VoiceStatus =
  | "idle"
  | "connecting"
  | "connected"
  | "mic_permission_denied"
  | "error"
  | "expired"
  | "failed";

export interface ConversationSessionState {
  // Identity
  conversationId: string | null;
  branchId: string | null;
  sessionId: string | null;

  // Active conversation metadata
  conversationMeta: Conversation | null;

  // Messages for current branch
  messages: Message[];
  isTyping: boolean;

  // Connection states
  connectionStatus: UnifiedConnectionStatus;
  voiceStatus: VoiceStatus;

  // Branching state
  branches: Branch[];
  currentBranchId: string;

  // Loading states
  isLoadingConversation: boolean;
  isLoadingBranches: boolean;

  // Error state
  error: string | null;
}

export interface ConversationSessionActions {
  // Conversation management
  setActiveConversation: (
    conversationId: string,
    branchId?: string | null,
  ) => Promise<void>;
  clearActiveConversation: () => void;

  // Messaging
  sendMessage: (content: string, files?: File[]) => void;
  addMessage: (message: Omit<Message, "id" | "timestamp">) => Message;
  editMessage: (messageId: string, newContent: string) => Promise<void>;
  regenerateMessage: (messageId: string) => Promise<void>;
  deleteMessage: (messageId: string) => Promise<void>;

  // Branching
  createBranchFromMessage: (
    messageId: string,
    initialMessage?: string,
  ) => Promise<Branch | null>;
  switchBranch: (branchId: string) => void;
  loadBranches: () => Promise<void>;

  // Connection management
  reconnectChat: () => void;
  disconnectChat: () => void;

  // Voice mode
  connectVoice: () => Promise<void>;
  disconnectVoice: () => void;
  sendVoiceMessage: (text: string) => void;

  // Conversation list (exposed for sidebar)
  conversations: Conversation[];
  createConversation: (title: string) => Promise<Conversation>;
  updateConversation: (
    id: string,
    updates: { title?: string; folderId?: string | null },
  ) => Promise<Conversation>;
  deleteConversation: (id: string) => Promise<void>;
  archiveConversation: (id: string) => Promise<Conversation>;
  reloadConversations: () => void;
}

export interface ConversationSessionContextValue
  extends ConversationSessionState,
    ConversationSessionActions {
  // Voice metrics (for observability)
  voiceMetrics: VoiceMetrics | null;
  voiceTranscript: string;
  voicePartialTranscript: string;
  isVoiceSpeaking: boolean;
}

// ============================================================================
// Context
// ============================================================================

const ConversationSessionContext = createContext<
  ConversationSessionContextValue | undefined
>(undefined);

// ============================================================================
// Provider Props
// ============================================================================

export interface ConversationSessionProviderProps {
  children: ReactNode;
  /** Initial conversation ID (e.g., from URL params) */
  initialConversationId?: string;
  /** Initial branch ID */
  initialBranchId?: string;
  /** Voice settings for realtime voice mode */
  voiceSettings?: VoiceSettings;
  /** Callback when WebSocket errors occur */
  onChatError?: (code: WebSocketErrorCode, message: string) => void;
  /** Callback when voice errors occur */
  onVoiceError?: (error: Error) => void;
  /** Callback when connection status changes */
  onConnectionChange?: (status: UnifiedConnectionStatus) => void;
  /** Callback when voice status changes */
  onVoiceStatusChange?: (status: VoiceStatus) => void;
  /** Callback when voice metrics update */
  onVoiceMetricsUpdate?: (metrics: VoiceMetrics) => void;
  /** Callback when a new message is received */
  onMessage?: (message: Message) => void;
}

// ============================================================================
// Provider Implementation
// ============================================================================

export function ConversationSessionProvider({
  children,
  initialConversationId,
  initialBranchId,
  voiceSettings,
  onChatError,
  onVoiceError,
  onConnectionChange,
  onVoiceStatusChange,
  onVoiceMetricsUpdate,
  onMessage,
}: ConversationSessionProviderProps) {
  const { apiClient } = useAuth();

  // -------------------------------------------------------------------------
  // Local State
  // -------------------------------------------------------------------------
  const [conversationId, setConversationId] = useState<string | null>(
    initialConversationId || null,
  );
  const [branchId, setBranchId] = useState<string | null>(
    initialBranchId || null,
  );
  const [conversationMeta, setConversationMeta] = useState<Conversation | null>(
    null,
  );
  const [initialMessages, setInitialMessages] = useState<Message[]>([]);
  const [isLoadingConversation, setIsLoadingConversation] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // -------------------------------------------------------------------------
  // Composed Hooks
  // -------------------------------------------------------------------------

  // Chat Session Hook
  const chatSession = useChatSession({
    conversationId: conversationId || undefined,
    initialMessages,
    onMessage,
    onError: (code, message) => {
      setError(`Chat error: ${code} - ${message}`);
      onChatError?.(code, message);
    },
    onConnectionChange: (status) => {
      onConnectionChange?.(mapChatStatus(status));
    },
  });

  // Branching Hook
  const branching = useBranching(conversationId);

  // Voice Session Hook (lazy initialization - only connect when explicitly requested)
  const voiceSession = useRealtimeVoiceSession({
    conversation_id: conversationId || undefined,
    voiceSettings,
    autoConnect: false, // Don't auto-connect, let user initiate
    onError: (err) => {
      setError(`Voice error: ${err.message}`);
      onVoiceError?.(err);
    },
    onConnectionChange: (status) => {
      onVoiceStatusChange?.(mapVoiceStatus(status));
    },
    onMetricsUpdate: onVoiceMetricsUpdate,
  });

  // Conversations list hook
  const conversationsHook = useConversations({
    onError: (message, description) => {
      setError(`${message}: ${description || ""}`);
    },
  });

  // -------------------------------------------------------------------------
  // Status Mapping Helpers
  // -------------------------------------------------------------------------
  function mapChatStatus(status: ConnectionStatus): UnifiedConnectionStatus {
    switch (status) {
      case "connecting":
        return "connecting";
      case "connected":
        return "connected";
      case "reconnecting":
        return "reconnecting";
      case "disconnected":
        return "disconnected";
      default:
        return "idle";
    }
  }

  function mapVoiceStatus(status: VoiceConnectionStatus): VoiceStatus {
    switch (status) {
      case "connecting":
        return "connecting";
      case "connected":
        return "connected";
      case "reconnecting":
        return "connecting";
      case "error":
        return "error";
      case "failed":
        return "failed";
      case "expired":
        return "expired";
      case "disconnected":
      default:
        return "idle";
    }
  }

  // -------------------------------------------------------------------------
  // Conversation Loading
  // -------------------------------------------------------------------------
  const loadConversation = useCallback(
    async (convId: string) => {
      setIsLoadingConversation(true);
      setError(null);

      try {
        // Load conversation metadata
        const conv = await apiClient.getConversation(convId);
        setConversationMeta(conv);

        // Load messages for the conversation
        const messagesResponse = await apiClient.getMessages(convId, 1, 100);
        setInitialMessages(messagesResponse.items);

        // Load branches
        await branching.loadBranches();
      } catch (err: any) {
        const errorMessage =
          err.response?.status === 404
            ? "Conversation not found"
            : err.message || "Failed to load conversation";
        setError(errorMessage);
        setConversationMeta(null);
        setInitialMessages([]);
      } finally {
        setIsLoadingConversation(false);
      }
    },
    [apiClient, branching],
  );

  // -------------------------------------------------------------------------
  // Actions
  // -------------------------------------------------------------------------

  const setActiveConversation = useCallback(
    async (newConversationId: string, newBranchId?: string | null) => {
      // Disconnect existing sessions when switching conversations
      if (conversationId && conversationId !== newConversationId) {
        chatSession.disconnect();
        if (voiceSession.isConnected) {
          voiceSession.disconnect();
        }
      }

      setConversationId(newConversationId);
      setBranchId(newBranchId || null);

      await loadConversation(newConversationId);
    },
    [conversationId, chatSession, voiceSession, loadConversation],
  );

  const clearActiveConversation = useCallback(() => {
    chatSession.disconnect();
    if (voiceSession.isConnected) {
      voiceSession.disconnect();
    }

    setConversationId(null);
    setBranchId(null);
    setConversationMeta(null);
    setInitialMessages([]);
    setError(null);
  }, [chatSession, voiceSession]);

  const createBranchFromMessage = useCallback(
    async (messageId: string, initialMessage?: string) => {
      const branch = await branching.createBranch(messageId, initialMessage);
      if (branch) {
        setBranchId(branch.branchId);
      }
      return branch;
    },
    [branching],
  );

  const switchBranch = useCallback(
    (newBranchId: string) => {
      branching.switchBranch(newBranchId);
      setBranchId(newBranchId === "main" ? null : newBranchId);
    },
    [branching],
  );

  const connectVoice = useCallback(async () => {
    await voiceSession.connect();
  }, [voiceSession]);

  const disconnectVoice = useCallback(() => {
    voiceSession.disconnect();
  }, [voiceSession]);

  // -------------------------------------------------------------------------
  // Effect: Load initial conversation
  // -------------------------------------------------------------------------
  useEffect(() => {
    if (initialConversationId && initialConversationId !== conversationId) {
      setActiveConversation(initialConversationId, initialBranchId);
    }
  }, [initialConversationId, initialBranchId]);

  // -------------------------------------------------------------------------
  // Memoized Context Value
  // -------------------------------------------------------------------------
  const contextValue = useMemo<ConversationSessionContextValue>(
    () => ({
      // State
      conversationId,
      branchId,
      sessionId: conversationId, // Using conversationId as sessionId for now
      conversationMeta,
      messages: chatSession.messages,
      isTyping: chatSession.isTyping,
      connectionStatus: mapChatStatus(chatSession.connectionStatus),
      voiceStatus: mapVoiceStatus(voiceSession.status),
      branches: branching.branches,
      currentBranchId: branching.currentBranchId,
      isLoadingConversation,
      isLoadingBranches: branching.isLoading,
      error: error || branching.error,

      // Voice state
      voiceMetrics: voiceSession.metrics,
      voiceTranscript: voiceSession.transcript,
      voicePartialTranscript: voiceSession.partialTranscript,
      isVoiceSpeaking: voiceSession.isSpeaking,

      // Conversation actions
      setActiveConversation,
      clearActiveConversation,

      // Message actions
      sendMessage: chatSession.sendMessage,
      addMessage: chatSession.addMessage,
      editMessage: chatSession.editMessage,
      regenerateMessage: chatSession.regenerateMessage,
      deleteMessage: chatSession.deleteMessage,

      // Branch actions
      createBranchFromMessage,
      switchBranch,
      loadBranches: branching.loadBranches,

      // Connection actions
      reconnectChat: chatSession.reconnect,
      disconnectChat: chatSession.disconnect,

      // Voice actions
      connectVoice,
      disconnectVoice,
      sendVoiceMessage: voiceSession.sendMessage,

      // Conversations list actions
      conversations: conversationsHook.conversations,
      createConversation: conversationsHook.createConversation,
      updateConversation: conversationsHook.updateConversation,
      deleteConversation: conversationsHook.deleteConversation,
      archiveConversation: conversationsHook.archiveConversation,
      reloadConversations: conversationsHook.reload,
    }),
    [
      conversationId,
      branchId,
      conversationMeta,
      chatSession,
      voiceSession,
      branching,
      conversationsHook,
      isLoadingConversation,
      error,
      setActiveConversation,
      clearActiveConversation,
      createBranchFromMessage,
      switchBranch,
      connectVoice,
      disconnectVoice,
    ],
  );

  return (
    <ConversationSessionContext.Provider value={contextValue}>
      {children}
    </ConversationSessionContext.Provider>
  );
}

// ============================================================================
// Hook
// ============================================================================

export function useConversationSession(): ConversationSessionContextValue {
  const context = useContext(ConversationSessionContext);
  if (!context) {
    throw new Error(
      "useConversationSession must be used within ConversationSessionProvider",
    );
  }
  return context;
}

// ============================================================================
// Selective Hooks (for components that only need specific parts)
// ============================================================================

/**
 * Hook for components that only need chat functionality
 */
export function useConversationChat() {
  const ctx = useConversationSession();
  return {
    messages: ctx.messages,
    isTyping: ctx.isTyping,
    connectionStatus: ctx.connectionStatus,
    sendMessage: ctx.sendMessage,
    addMessage: ctx.addMessage,
    editMessage: ctx.editMessage,
    regenerateMessage: ctx.regenerateMessage,
    deleteMessage: ctx.deleteMessage,
    reconnect: ctx.reconnectChat,
  };
}

/**
 * Hook for components that only need voice functionality
 */
export function useConversationVoice() {
  const ctx = useConversationSession();
  return {
    status: ctx.voiceStatus,
    metrics: ctx.voiceMetrics,
    transcript: ctx.voiceTranscript,
    partialTranscript: ctx.voicePartialTranscript,
    isSpeaking: ctx.isVoiceSpeaking,
    connect: ctx.connectVoice,
    disconnect: ctx.disconnectVoice,
    sendMessage: ctx.sendVoiceMessage,
  };
}

/**
 * Hook for components that only need branching functionality
 */
export function useConversationBranching() {
  const ctx = useConversationSession();
  return {
    branches: ctx.branches,
    currentBranchId: ctx.currentBranchId,
    isLoading: ctx.isLoadingBranches,
    createBranch: ctx.createBranchFromMessage,
    switchBranch: ctx.switchBranch,
    loadBranches: ctx.loadBranches,
  };
}

/**
 * Hook for components that only need conversation metadata
 */
export function useConversationMeta() {
  const ctx = useConversationSession();
  return {
    conversationId: ctx.conversationId,
    branchId: ctx.branchId,
    meta: ctx.conversationMeta,
    isLoading: ctx.isLoadingConversation,
    error: ctx.error,
  };
}
