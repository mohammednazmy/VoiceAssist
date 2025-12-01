/**
 * Unified Chat Container
 *
 * Main container for the unified chat/voice interface.
 * Provides three-panel layout with collapsible sidebar and context pane.
 *
 * This component is rendered when the unified_chat_voice_ui feature flag is enabled.
 */

import {
  useState,
  useCallback,
  useEffect,
  useMemo,
  lazy,
  Suspense,
} from "react";
import { useParams, useNavigate, useLocation } from "react-router-dom";
import { useAuth } from "../../hooks/useAuth";
import { useToastContext } from "../../contexts/ToastContext";
import {
  useUnifiedConversationStore,
  type MessageSource,
} from "../../stores/unifiedConversationStore";
import { useVoiceSettingsStore } from "../../stores/voiceSettingsStore";
import { useAnnouncer } from "../accessibility/LiveRegion";
import { useChatSession } from "../../hooks/useChatSession";
import { useConversations } from "../../hooks/useConversations";
import { MessageList } from "../chat/MessageList";
import { ConnectionStatus } from "../chat/ConnectionStatus";
import { ChatErrorBoundary } from "../chat/ChatErrorBoundary";
import { UnifiedInputArea } from "./UnifiedInputArea";
import { CollapsibleSidebar } from "./CollapsibleSidebar";
import { CollapsibleContextPane } from "./CollapsibleContextPane";
import { UnifiedHeader } from "./UnifiedHeader";
import { ThinkerTalkerVoicePanel } from "../voice/ThinkerTalkerVoicePanel";
import { useKeyboardShortcuts } from "../../hooks/useKeyboardShortcuts";
import type { TTVoiceMetrics } from "../../hooks/useThinkerTalkerSession";

// Lazy-loaded dialogs for better initial load performance
const KeyboardShortcutsDialog = lazy(() =>
  import("../KeyboardShortcutsDialog").then((m) => ({
    default: m.KeyboardShortcutsDialog,
  })),
);
const ExportDialog = lazy(() =>
  import("../export/ExportDialog").then((m) => ({ default: m.ExportDialog })),
);
const ShareDialog = lazy(() =>
  import("../sharing/ShareDialog").then((m) => ({ default: m.ShareDialog })),
);
import type {
  Message,
  Conversation,
  WebSocketErrorCode,
} from "@voiceassist/types";
import { extractErrorMessage } from "@voiceassist/types";
import { Loader2 } from "lucide-react";
import { ChatSkeleton } from "./UnifiedChatSkeleton";
import { ErrorDisplay, type ChatErrorType } from "./UnifiedChatError";

// ============================================================================
// Types
// ============================================================================

type LoadingState = "idle" | "creating" | "validating" | "loading-history";

interface UnifiedChatContainerProps {
  /** Pre-loaded conversation ID from ChatPage */
  conversationId?: string;
  /** Start in voice mode (from ?mode=voice or startVoiceMode location state) */
  startInVoiceMode?: boolean;
  /** Callback when conversation is created/loaded */
  onConversationReady?: (conversationId: string) => void;
}

// ============================================================================
// Main Component
// ============================================================================

export function UnifiedChatContainer({
  conversationId: propsConversationId,
  startInVoiceMode = false,
  onConversationReady,
}: UnifiedChatContainerProps) {
  const { conversationId: paramsConversationId } = useParams<{
    conversationId: string;
  }>();
  const navigate = useNavigate();
  const location = useLocation();
  const { apiClient } = useAuth();
  const toast = useToastContext();
  const { announce } = useAnnouncer();

  // Use props conversationId if provided, otherwise fall back to URL params
  const conversationId = propsConversationId || paramsConversationId;

  // Debug logging
  console.log("[UnifiedChatContainer] Render:", {
    propsConversationId,
    paramsConversationId,
    conversationId,
    startInVoiceMode,
    pathname: location.pathname,
  });

  // Check if we should start in voice mode (props take precedence)
  const searchParams = new URLSearchParams(location.search);
  const startVoiceMode =
    startInVoiceMode ||
    searchParams.get("mode") === "voice" ||
    (location.state as { startVoiceMode?: boolean } | null)?.startVoiceMode ===
      true;

  // Unified store state
  const {
    conversationId: activeConversationId,
    messages,
    isTyping,
    inputMode,
    voiceModeActive,
    setConversation,
    addMessage,
    updateMessage,
    setTyping,
    activateVoiceMode,
  } = useUnifiedConversationStore();

  // Voice settings
  const voiceModeType = useVoiceSettingsStore((state) => state.voiceModeType);

  // Conversations hook for title editing
  const { updateConversation } = useConversations({
    onError: (message, description) => toast.error(message, description),
  });

  // Local state
  const [loadingState, setLoadingState] = useState<LoadingState>("idle");
  const [errorType, setErrorType] = useState<ChatErrorType>(null);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [conversation, setLocalConversation] = useState<Conversation | null>(
    null,
  );
  const [initialMessages, setInitialMessages] = useState<Message[]>([]);

  // Panel visibility state
  const [isSidebarOpen, setIsSidebarOpen] = useState(true);
  const [isContextPaneOpen, setIsContextPaneOpen] = useState(false);
  const [isShortcutsDialogOpen, setIsShortcutsDialogOpen] = useState(false);
  const [isExportDialogOpen, setIsExportDialogOpen] = useState(false);
  const [isShareDialogOpen, setIsShareDialogOpen] = useState(false);
  const [isVoicePanelOpen, setIsVoicePanelOpen] = useState(startVoiceMode);

  // Pagination state
  const [hasMoreMessages, setHasMoreMessages] = useState(false);
  const [isLoadingMoreMessages, setIsLoadingMoreMessages] = useState(false);
  const [totalMessageCount, setTotalMessageCount] = useState(0);

  // Auto-titling state
  const [hasAutoTitled, setHasAutoTitled] = useState(false);

  // Chat session hook for WebSocket communication
  const {
    messages: chatMessages,
    connectionStatus,
    isTyping: chatIsTyping,
    sendMessage: sendChatMessage,
    editMessage,
    regenerateMessage,
    deleteMessage,
    reconnect: reconnectChat,
    addMessage: addChatMessage,
  } = useChatSession({
    conversationId: activeConversationId || undefined,
    initialMessages,
    onError: (code: WebSocketErrorCode, message: string) => {
      console.error(`[UnifiedChat] WebSocket error ${code}: ${message}`);
      setErrorType("websocket");
      setErrorMessage(message);
      toast.error("Connection Error", message);
    },
  });

  // Sync chat messages to unified store
  useEffect(() => {
    if (chatMessages.length > 0) {
      chatMessages.forEach((msg) => {
        // Check if message already exists to avoid duplicates
        const exists = messages.some((m) => m.id === msg.id);
        if (!exists) {
          addMessage({
            ...msg,
            source: "text" as MessageSource,
          });
        }
      });
    }
  }, [chatMessages]);

  // Sync typing state
  useEffect(() => {
    setTyping(chatIsTyping);
  }, [chatIsTyping, setTyping]);

  // Keyboard shortcuts
  useKeyboardShortcuts({
    onToggleCitations: () => setIsContextPaneOpen((prev) => !prev),
    onToggleClinicalContext: () => setIsContextPaneOpen((prev) => !prev),
    onShowShortcuts: () => setIsShortcutsDialogOpen(true),
    onToggleVoicePanel: () => setIsVoicePanelOpen((prev) => !prev),
    onCloseVoicePanel: () => setIsVoicePanelOpen(false),
    isVoicePanelOpen,
  });

  // -------------------------------------------------------------------------
  // Conversation Management
  // -------------------------------------------------------------------------

  const createNewConversation = useCallback(async () => {
    if (!apiClient) return;

    setLoadingState("creating");
    setErrorType(null);

    try {
      const newConversation =
        await apiClient.createConversation("New Conversation");

      if (newConversation?.id) {
        setConversation(newConversation.id);
        setLocalConversation(newConversation);
        navigate(`/chat/${newConversation.id}`, { replace: true });
        onConversationReady?.(newConversation.id);
        announce("New conversation created");
      } else {
        throw new Error("Failed to create conversation");
      }
    } catch (error) {
      console.error("[UnifiedChat] Failed to create conversation:", error);
      setErrorType("failed-create");
      setErrorMessage(error instanceof Error ? error.message : "Unknown error");
    } finally {
      setLoadingState("idle");
    }
  }, [apiClient, navigate, setConversation, onConversationReady, announce]);

  const loadConversation = useCallback(
    async (id: string) => {
      if (!apiClient) return;

      setLoadingState("loading-history");
      setErrorType(null);

      try {
        // Load conversation metadata
        const conv = await apiClient.getConversation(id);
        if (!conv) {
          setErrorType("not-found");
          return;
        }

        setLocalConversation(conv);
        setConversation(id);

        // Load messages
        const messagesResponse = await apiClient.getMessages(id, 1, 50);

        if (messagesResponse?.items) {
          const loadedMessages = messagesResponse.items;
          const total = messagesResponse.totalCount || loadedMessages.length;
          const totalPages = Math.ceil(total / 50);

          // Set initial messages for chat session
          setInitialMessages(loadedMessages);

          // Add messages to store
          loadedMessages.forEach((msg: Message) => {
            addMessage({
              ...msg,
              source: "text" as MessageSource,
            });
          });

          setTotalMessageCount(total);
          setHasMoreMessages(totalPages > 1);
        }

        onConversationReady?.(id);
        announce("Conversation loaded");
      } catch (error: unknown) {
        console.error("[UnifiedChat] Failed to load conversation:", error);
        if ((error as any)?.response?.status === 404) {
          setErrorType("not-found");
        } else {
          setErrorType("failed-load");
        }
        setErrorMessage(extractErrorMessage(error));
      } finally {
        setLoadingState("idle");
      }
    },
    [apiClient, setConversation, addMessage, onConversationReady, announce],
  );

  // Initialize conversation
  useEffect(() => {
    if (conversationId) {
      loadConversation(conversationId);
    } else {
      createNewConversation();
    }
  }, [conversationId]);

  // Start voice mode if requested
  useEffect(() => {
    if (startVoiceMode && loadingState === "idle" && !errorType) {
      activateVoiceMode();
    }
  }, [startVoiceMode, loadingState, errorType, activateVoiceMode]);

  // Announce voice mode changes for screen readers
  useEffect(() => {
    if (voiceModeActive) {
      announce("Voice mode activated. You can speak to interact.");
    } else if (inputMode === "text") {
      // Only announce when switching from voice to text, not initial load
      // Check if we're in a state where voice was previously active
    }
  }, [voiceModeActive, inputMode, announce]);

  // Announce typing indicator for screen readers
  useEffect(() => {
    if (isTyping) {
      announce("Assistant is typing");
    }
  }, [isTyping, announce]);

  // -------------------------------------------------------------------------
  // Event Handlers
  // -------------------------------------------------------------------------

  const handleRetry = useCallback(() => {
    if (conversationId) {
      loadConversation(conversationId);
    } else {
      createNewConversation();
    }
  }, [conversationId, loadConversation, createNewConversation]);

  const handleGoHome = useCallback(() => {
    navigate("/");
  }, [navigate]);

  // Handle title change
  const handleTitleChange = useCallback(
    async (newTitle: string) => {
      if (!activeConversationId) return;

      try {
        const updated = await updateConversation(activeConversationId, {
          title: newTitle,
        });
        setLocalConversation((prev) =>
          prev ? { ...prev, title: newTitle } : prev,
        );
        toast.success("Title updated");
      } catch (error) {
        throw error; // Let the header handle the error display
      }
    },
    [activeConversationId, updateConversation, toast],
  );

  // Handle export - open dialog
  const handleExport = useCallback(() => {
    if (!activeConversationId) return;
    setIsExportDialogOpen(true);
  }, [activeConversationId]);

  // Handle share - open dialog
  const handleShare = useCallback(() => {
    if (!activeConversationId) return;
    setIsShareDialogOpen(true);
  }, [activeConversationId]);

  // Generate auto-title from message content
  const generateAutoTitle = useCallback((content: string): string => {
    // Clean and truncate the message for use as a title
    const cleaned = content
      .replace(/\n+/g, " ") // Replace newlines with spaces
      .replace(/\s+/g, " ") // Collapse multiple spaces
      .trim();

    // Max 50 characters, try to break at word boundary
    if (cleaned.length <= 50) {
      return cleaned;
    }

    // Find last space before 50 chars
    const truncated = cleaned.substring(0, 50);
    const lastSpace = truncated.lastIndexOf(" ");

    if (lastSpace > 30) {
      return truncated.substring(0, lastSpace) + "...";
    }

    return truncated + "...";
  }, []);

  // Auto-title conversation based on first message
  const autoTitleConversation = useCallback(
    async (messageContent: string) => {
      if (
        hasAutoTitled ||
        !activeConversationId ||
        !conversation ||
        conversation.title !== "New Conversation"
      ) {
        return;
      }

      const newTitle = generateAutoTitle(messageContent);

      try {
        await updateConversation(activeConversationId, { title: newTitle });
        setLocalConversation((prev) =>
          prev ? { ...prev, title: newTitle } : prev,
        );
        setHasAutoTitled(true);
      } catch (error) {
        // Silently fail - title remains as "New Conversation"
        console.warn("[UnifiedChat] Auto-title failed:", error);
      }
    },
    [
      hasAutoTitled,
      activeConversationId,
      conversation,
      generateAutoTitle,
      updateConversation,
    ],
  );

  // Handle send message
  const handleSendMessage = useCallback(
    (content: string, source: MessageSource) => {
      if (!content.trim()) return;

      // Auto-title conversation if this is the first message
      autoTitleConversation(content);

      // Add to unified store immediately for optimistic update
      addMessage({
        role: "user",
        content,
        source,
      });

      // Send via WebSocket
      sendChatMessage(content);
    },
    [addMessage, sendChatMessage, autoTitleConversation],
  );

  const handleLoadMoreMessages = useCallback(async () => {
    if (
      !apiClient ||
      !activeConversationId ||
      isLoadingMoreMessages ||
      !hasMoreMessages
    ) {
      return;
    }

    setIsLoadingMoreMessages(true);
    try {
      // Calculate next page based on current messages
      const currentPage = Math.ceil(messages.length / 50);
      const messagesResponse = await apiClient.getMessages(
        activeConversationId,
        currentPage + 1,
        50,
      );

      if (messagesResponse?.items) {
        const olderMessages = messagesResponse.items;
        const total = messagesResponse.totalCount || 0;
        const totalPages = Math.ceil(total / 50);

        // Prepend older messages
        olderMessages.forEach((msg: Message) => {
          addMessage({
            ...msg,
            source: "text" as MessageSource,
          });
        });

        setHasMoreMessages(currentPage + 1 < totalPages);
      }
    } catch (error) {
      console.error("[UnifiedChat] Failed to load more messages:", error);
      toast.error("Failed to load older messages");
    } finally {
      setIsLoadingMoreMessages(false);
    }
  }, [
    apiClient,
    activeConversationId,
    messages.length,
    isLoadingMoreMessages,
    hasMoreMessages,
    addMessage,
    toast,
  ]);

  // -------------------------------------------------------------------------
  // Voice Mode Handlers
  // -------------------------------------------------------------------------

  // Handle voice user message - add transcribed speech to chat timeline
  const handleVoiceUserMessage = useCallback(
    (content: string) => {
      if (!content.trim()) return;

      // Auto-title conversation if this is the first message
      autoTitleConversation(content);

      // Add to unified store with voice source
      addMessage({
        role: "user",
        content,
        source: "voice" as MessageSource,
      });

      // Send via WebSocket for conversation history
      sendChatMessage(content);
    },
    [addMessage, sendChatMessage, autoTitleConversation],
  );

  // Handle voice assistant message - add AI response to chat timeline
  const handleVoiceAssistantMessage = useCallback(
    (content: string) => {
      if (!content.trim()) return;

      addMessage({
        role: "assistant",
        content,
        source: "voice" as MessageSource,
      });
    },
    [addMessage],
  );

  // Handle voice metrics update - export to backend for observability
  const handleVoiceMetricsUpdate = useCallback(
    (metrics: TTVoiceMetrics) => {
      // Send metrics to backend (non-blocking)
      if (
        activeConversationId &&
        typeof navigator !== "undefined" &&
        "sendBeacon" in navigator
      ) {
        const payload = JSON.stringify({
          conversation_id: activeConversationId,
          ...metrics,
          timestamp: new Date().toISOString(),
        });
        const blob = new Blob([payload], { type: "application/json" });
        navigator.sendBeacon("/api/voice/metrics", blob);
      }
    },
    [activeConversationId],
  );

  // Handle voice panel close
  const handleVoicePanelClose = useCallback(() => {
    setIsVoicePanelOpen(false);
  }, []);

  // -------------------------------------------------------------------------
  // Render Helpers
  // -------------------------------------------------------------------------

  // Map UnifiedMessage to Message format for MessageList
  const mappedMessages: Message[] = useMemo(() => {
    return messages.map((msg) => ({
      id: msg.id,
      conversationId: activeConversationId || undefined,
      role: msg.role,
      content: msg.content,
      citations: msg.citations || msg.metadata?.citations,
      timestamp: new Date(msg.createdAt).getTime(),
      metadata: msg.metadata,
    }));
  }, [messages, activeConversationId]);

  // -------------------------------------------------------------------------
  // Render
  // -------------------------------------------------------------------------

  // Show loading skeleton
  if (loadingState !== "idle") {
    return <ChatSkeleton />;
  }

  // Show error state
  if (errorType) {
    return (
      <ErrorDisplay
        type={errorType}
        message={errorMessage}
        onRetry={handleRetry}
        onGoHome={handleGoHome}
      />
    );
  }

  return (
    <ChatErrorBoundary
      onError={(err, info) => {
        console.error("[UnifiedChatContainer] Error:", err, info);
        setErrorType("websocket");
        setErrorMessage("An unexpected error occurred");
      }}
    >
      <div
        className="flex h-full bg-neutral-50"
        role="application"
        aria-label="Chat interface"
      >
        {/* Collapsible Sidebar */}
        <CollapsibleSidebar
          isOpen={isSidebarOpen}
          onToggle={() => setIsSidebarOpen(!isSidebarOpen)}
          conversationId={activeConversationId}
        />

        {/* Main Content Area */}
        <main
          className="flex-1 flex flex-col min-w-0"
          aria-label="Conversation"
        >
          {/* Header */}
          <UnifiedHeader
            conversation={conversation}
            isSidebarOpen={isSidebarOpen}
            isContextPaneOpen={isContextPaneOpen}
            onToggleSidebar={() => setIsSidebarOpen(!isSidebarOpen)}
            onToggleContextPane={() => setIsContextPaneOpen(!isContextPaneOpen)}
            onTitleChange={handleTitleChange}
            onExport={handleExport}
            onShare={handleShare}
          />

          {/* Connection Status */}
          <ConnectionStatus
            status={connectionStatus}
            onReconnect={reconnectChat}
            compact
          />

          {/* Message List */}
          <div
            className="flex-1 overflow-hidden"
            role="log"
            aria-live="polite"
            aria-label="Conversation messages"
          >
            <MessageList
              messages={mappedMessages}
              isTyping={isTyping}
              onLoadMore={handleLoadMoreMessages}
              hasMore={hasMoreMessages}
              isLoadingMore={isLoadingMoreMessages}
              totalCount={totalMessageCount}
            />
          </div>

          {/* Voice Mode Panel - appears above input when active */}
          {isVoicePanelOpen && (
            <ThinkerTalkerVoicePanel
              conversationId={activeConversationId || undefined}
              onClose={handleVoicePanelClose}
              onUserMessage={handleVoiceUserMessage}
              onAssistantMessage={handleVoiceAssistantMessage}
              onMetricsUpdate={handleVoiceMetricsUpdate}
            />
          )}

          {/* Unified Input Area */}
          <UnifiedInputArea
            conversationId={activeConversationId}
            onSendMessage={handleSendMessage}
            disabled={connectionStatus !== "connected"}
            onToggleVoicePanel={() => setIsVoicePanelOpen((prev) => !prev)}
            isVoicePanelOpen={isVoicePanelOpen}
          />
        </main>

        {/* Collapsible Context Pane */}
        <CollapsibleContextPane
          isOpen={isContextPaneOpen}
          onToggle={() => setIsContextPaneOpen(!isContextPaneOpen)}
          conversationId={activeConversationId}
        />

        {/* Lazy-loaded Dialogs - wrapped in Suspense for code splitting */}
        <Suspense fallback={null}>
          {/* Keyboard Shortcuts Dialog */}
          {isShortcutsDialogOpen && (
            <KeyboardShortcutsDialog
              isOpen={isShortcutsDialogOpen}
              onClose={() => setIsShortcutsDialogOpen(false)}
            />
          )}

          {/* Export Dialog */}
          {activeConversationId && isExportDialogOpen && (
            <ExportDialog
              isOpen={isExportDialogOpen}
              onClose={() => setIsExportDialogOpen(false)}
              conversationId={activeConversationId}
              conversationTitle={conversation?.title || "New Conversation"}
              messages={mappedMessages}
            />
          )}

          {/* Share Dialog */}
          {activeConversationId && isShareDialogOpen && (
            <ShareDialog
              isOpen={isShareDialogOpen}
              onClose={() => setIsShareDialogOpen(false)}
              conversationId={activeConversationId}
              conversationTitle={conversation?.title || "New Conversation"}
            />
          )}
        </Suspense>
      </div>
    </ChatErrorBoundary>
  );
}

export default UnifiedChatContainer;
