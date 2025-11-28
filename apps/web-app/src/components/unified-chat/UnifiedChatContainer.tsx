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
import { useKeyboardShortcuts } from "../../hooks/useKeyboardShortcuts";

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
import { Loader2, AlertCircle } from "lucide-react";

// ============================================================================
// Types
// ============================================================================

type LoadingState = "idle" | "creating" | "validating" | "loading-history";
type ErrorType =
  | "not-found"
  | "failed-create"
  | "failed-load"
  | "websocket"
  | null;

interface UnifiedChatContainerProps {
  /** Pre-loaded conversation ID from ChatPage */
  conversationId?: string;
  /** Start in voice mode (from ?mode=voice or startVoiceMode location state) */
  startInVoiceMode?: boolean;
  /** Callback when conversation is created/loaded */
  onConversationReady?: (conversationId: string) => void;
}

// ============================================================================
// Skeleton Components
// ============================================================================

function MessageSkeleton({ isUser = false }: { isUser?: boolean }) {
  return (
    <div className={`flex ${isUser ? "justify-end" : "justify-start"} mb-4`}>
      <div
        className={`max-w-[70%] rounded-lg p-4 animate-pulse ${
          isUser ? "bg-primary-100" : "bg-white border border-neutral-200"
        }`}
      >
        <div className={`space-y-2 ${isUser ? "items-end" : "items-start"}`}>
          <div
            className={`h-4 rounded ${isUser ? "bg-primary-200" : "bg-neutral-200"} w-48`}
          />
          <div
            className={`h-4 rounded ${isUser ? "bg-primary-200" : "bg-neutral-200"} w-64`}
          />
          <div
            className={`h-4 rounded ${isUser ? "bg-primary-200" : "bg-neutral-200"} w-32`}
          />
        </div>
      </div>
    </div>
  );
}

function ChatSkeleton() {
  return (
    <div className="flex flex-col h-full">
      {/* Header skeleton */}
      <div className="flex items-center justify-between px-4 py-3 border-b border-neutral-200 bg-white">
        <div className="h-6 w-32 bg-neutral-200 rounded animate-pulse" />
        <div className="flex items-center space-x-2">
          <div className="h-8 w-20 bg-neutral-100 rounded animate-pulse" />
          <div className="h-8 w-20 bg-neutral-100 rounded animate-pulse" />
        </div>
      </div>
      {/* Messages skeleton */}
      <div className="flex-1 overflow-hidden bg-neutral-50 px-4 py-4">
        <MessageSkeleton isUser={true} />
        <MessageSkeleton isUser={false} />
        <MessageSkeleton isUser={true} />
        <MessageSkeleton isUser={false} />
      </div>
      {/* Input skeleton */}
      <div className="border-t border-neutral-200 bg-white px-4 py-3">
        <div className="h-12 bg-neutral-100 rounded-lg animate-pulse" />
      </div>
    </div>
  );
}

// ============================================================================
// Error Components
// ============================================================================

interface ErrorDisplayProps {
  type: ErrorType;
  message: string | null;
  onRetry?: () => void;
  onGoHome?: () => void;
}

function ErrorDisplay({ type, message, onRetry, onGoHome }: ErrorDisplayProps) {
  const errorConfig = {
    "not-found": {
      title: "Conversation not found",
      description:
        "The conversation you're looking for doesn't exist or has been deleted.",
      showRetry: false,
    },
    "failed-create": {
      title: "Failed to create conversation",
      description:
        message || "Unable to start a new conversation. Please try again.",
      showRetry: true,
    },
    "failed-load": {
      title: "Failed to load conversation",
      description:
        message || "Unable to load the conversation. Please try again.",
      showRetry: true,
    },
    websocket: {
      title: "Connection error",
      description:
        message || "Lost connection to the server. Attempting to reconnect...",
      showRetry: true,
    },
  };

  const config = type ? errorConfig[type] : null;
  if (!config) return null;

  return (
    <div className="flex items-center justify-center h-full">
      <div className="text-center max-w-md px-4">
        <div className="w-16 h-16 mx-auto mb-4 rounded-full bg-error-100 flex items-center justify-center">
          <AlertCircle className="w-8 h-8 text-error-600" />
        </div>
        <h3 className="text-lg font-semibold text-neutral-900 mb-2">
          {config.title}
        </h3>
        <p className="text-neutral-600 mb-4">{config.description}</p>
        <div className="flex items-center justify-center gap-3">
          {config.showRetry && onRetry && (
            <button
              onClick={onRetry}
              className="px-4 py-2 bg-primary-600 text-white rounded-lg hover:bg-primary-700 transition-colors"
            >
              Try Again
            </button>
          )}
          {onGoHome && (
            <button
              onClick={onGoHome}
              className="px-4 py-2 bg-neutral-100 text-neutral-700 rounded-lg hover:bg-neutral-200 transition-colors"
            >
              Go Home
            </button>
          )}
        </div>
      </div>
    </div>
  );
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
  const [errorType, setErrorType] = useState<ErrorType>(null);
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
    onToggleVoicePanel: () => {
      // Toggle voice mode
      if (voiceModeActive) {
        useUnifiedConversationStore.getState().deactivateVoiceMode();
      } else {
        useUnifiedConversationStore.getState().activateVoiceMode();
      }
    },
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
      } catch (error: any) {
        console.error("[UnifiedChat] Failed to load conversation:", error);
        if (error?.response?.status === 404) {
          setErrorType("not-found");
        } else {
          setErrorType("failed-load");
        }
        setErrorMessage(
          error instanceof Error ? error.message : "Unknown error",
        );
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

          {/* Unified Input Area */}
          <UnifiedInputArea
            conversationId={activeConversationId}
            onSendMessage={handleSendMessage}
            disabled={connectionStatus !== "connected"}
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
