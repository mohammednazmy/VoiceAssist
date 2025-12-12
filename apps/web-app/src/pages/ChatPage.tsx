/**
 * Chat Page
 * Main chat interface with WebSocket streaming
 *
 * When the unified_chat_voice_ui feature flag is enabled, renders the new
 * UnifiedChatContainer component which merges text and voice modes.
 */

import { useState, useCallback, useEffect, useRef, useMemo } from "react";
import { useParams, useNavigate, useLocation } from "react-router-dom";
import { extractErrorMessage } from "@voiceassist/types";
import { useAuth } from "../hooks/useAuth";
import { useChatSession } from "../hooks/useChatSession";
import { useBranching } from "../hooks/useBranching";
import { useKeyboardShortcuts } from "../hooks/useKeyboardShortcuts";
import { useClinicalContext } from "../hooks/useClinicalContext";
import { useToastContext } from "../contexts/ToastContext";
import { useFeatureFlag } from "../hooks/useExperiment";
import { UI_FLAGS } from "../lib/featureFlags";
import { MessageList } from "../components/chat/MessageList";
import { MessageInput } from "../components/chat/MessageInput";
import { ConnectionStatus } from "../components/chat/ConnectionStatus";
import { ChatErrorBoundary } from "../components/chat/ChatErrorBoundary";
import { BranchSidebar } from "../components/chat/BranchSidebar";
import { BranchPreview } from "../components/chat/BranchPreview";
import { KeyboardShortcutsDialog } from "../components/KeyboardShortcutsDialog";
import { ClinicalContextSidebar } from "../components/clinical/ClinicalContextSidebar";
import { CitationSidebar } from "../components/citations/CitationSidebar";
import { ExportDialog } from "../components/export/ExportDialog";
import { ShareDialog } from "../components/sharing/ShareDialog";
import { SaveAsTemplateDialog } from "../components/templates/SaveAsTemplateDialog";
import { useTemplates } from "../hooks/useTemplates";
import { useAnnouncer } from "../components/accessibility/LiveRegion";
import { UnifiedChatContainer } from "../components/unified-chat";
import {
  backendToFrontend,
  frontendToBackend,
} from "../components/clinical/ClinicalContextAdapter";
import type { ClinicalContext } from "../components/clinical/ClinicalContextPanel";
import type {
  Message,
  WebSocketErrorCode,
  Conversation,
} from "@voiceassist/types";
import type { VoiceMetrics } from "../components/voice/VoiceMetricsDisplay";

type LoadingState = "idle" | "creating" | "validating" | "loading-history";
type ErrorType =
  | "not-found"
  | "failed-create"
  | "failed-load"
  | "websocket"
  | null;

/** Default page size for message pagination */
const MESSAGE_PAGE_SIZE = 50;

/** Skeleton loader for chat messages during history loading */
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

/** Skeleton loader for the entire chat area */
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

export function ChatPage() {
  const { conversationId } = useParams<{ conversationId: string }>();
  const navigate = useNavigate();
  const location = useLocation();
  const { apiClient } = useAuth();

  // Check if unified chat/voice UI feature flag is enabled
  const { isEnabled: useUnifiedUI, isLoading: isFeatureFlagLoading } =
    useFeatureFlag(UI_FLAGS.UNIFIED_CHAT_VOICE);

  // Check if we should auto-open voice mode (from Home page Voice Mode card)
  // Support both query param (?mode=voice) and location state for backwards compatibility
  const searchParams = new URLSearchParams(location.search);
  const startVoiceMode =
    searchParams.get("mode") === "voice" ||
    (location.state as { startVoiceMode?: boolean } | null)?.startVoiceMode ===
      true;
  const { createFromConversation } = useTemplates();
  const toast = useToastContext();

  const [loadingState, setLoadingState] = useState<LoadingState>("idle");
  const [errorType, setErrorType] = useState<ErrorType>(null);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [activeConversationId, setActiveConversationId] = useState<
    string | null
  >(null);
  const [conversation, setConversation] = useState<Conversation | null>(null);
  const [initialMessages, setInitialMessages] = useState<Message[]>([]);

  // Pagination state for loading older messages
  const [hasMoreMessages, setHasMoreMessages] = useState(false);
  const [isLoadingMoreMessages, setIsLoadingMoreMessages] = useState(false);
  const [totalMessageCount, setTotalMessageCount] = useState(0);
  const [oldestLoadedPage, setOldestLoadedPage] = useState(1);
  const [isBranchSidebarOpen, setIsBranchSidebarOpen] = useState(false);
  const [isShortcutsDialogOpen, setIsShortcutsDialogOpen] = useState(false);
  const [isClinicalContextOpen, setIsClinicalContextOpen] = useState(false);
  const [isCitationSidebarOpen, setIsCitationSidebarOpen] = useState(false);
  const [isExportDialogOpen, setIsExportDialogOpen] = useState(false);
  const [isShareDialogOpen, setIsShareDialogOpen] = useState(false);
  const [isSaveTemplateDialogOpen, setIsSaveTemplateDialogOpen] =
    useState(false);
  const [isVoicePanelOpen, setIsVoicePanelOpen] = useState(false);

  // Branch preview state
  const [branchPreviewMessageId, setBranchPreviewMessageId] = useState<
    string | null
  >(null);
  const [isCreatingBranch, setIsCreatingBranch] = useState(false);

  // Clinical context management
  const clinicalContextHook = useClinicalContext(
    activeConversationId || undefined,
  );
  const [localClinicalContext, setLocalClinicalContext] =
    useState<ClinicalContext>({});
  const saveTimeoutRef = useRef<NodeJS.Timeout>();

  // Merge backend context with local edits (local takes precedence for optimistic updates)
  const clinicalContext = {
    ...backendToFrontend(clinicalContextHook.context),
    ...localClinicalContext,
  };

  // Update local context when backend context loads
  useEffect(() => {
    if (clinicalContextHook.context && !clinicalContextHook.isLoading) {
      setLocalClinicalContext({});
    }
  }, [clinicalContextHook.context, clinicalContextHook.isLoading]);

  // Accessibility: Screen reader announcements
  const { announce, LiveRegion: AnnouncementRegion } = useAnnouncer("polite");

  // Track if we're currently initializing to prevent duplicate calls
  const isInitializingRef = useRef(false);

  // Handle conversation initialization and validation
  useEffect(() => {
    // Skip initialization while feature flag is loading - we don't yet know
    // whether to use the legacy ChatPage flow or the unified UI.
    if (isFeatureFlagLoading) return;

    // Skip if unified UI is enabled - UnifiedChatContainer handles its own initialization
    if (useUnifiedUI) return;

    const initializeConversation = async () => {
      // Prevent duplicate initialization
      if (isInitializingRef.current) return;

      // If no conversationId in URL, auto-create and redirect
      if (!conversationId) {
        isInitializingRef.current = true;
        setLoadingState("creating");
        setErrorType(null);
        try {
          const newConversation =
            await apiClient.createConversation("New Conversation");
          navigate(`/chat/${newConversation.id}`, { replace: true });
        } catch (err) {
          console.error("Failed to create conversation:", err);
          setErrorType("failed-create");
          setErrorMessage("Failed to create conversation. Please try again.");
          setLoadingState("idle");
        } finally {
          isInitializingRef.current = false;
        }
        return;
      }

      // If conversationId changed, validate and load
      if (conversationId !== activeConversationId) {
        isInitializingRef.current = true;
        setLoadingState("validating");
        setErrorType(null);
        setActiveConversationId(null);
        setConversation(null);
        setInitialMessages([]);
        // Reset pagination state
        setHasMoreMessages(false);
        setTotalMessageCount(0);
        setOldestLoadedPage(1);

        try {
          // Validate conversation exists
          const conv = await apiClient.getConversation(conversationId);
          setConversation(conv);

          // Load conversation history (start with first page to get total count)
          setLoadingState("loading-history");
          const firstPageResponse = await apiClient.getMessages(
            conversationId,
            1,
            MESSAGE_PAGE_SIZE,
          );

          // Ensure total defaults to 0 if undefined to prevent NaN pagination calculations
          const total = firstPageResponse.totalCount ?? 0;
          setTotalMessageCount(total);

          if (total === 0) {
            // Empty conversation
            setInitialMessages([]);
            setHasMoreMessages(false);
            setOldestLoadedPage(1);
          } else {
            // Calculate last page (most recent messages)
            const lastPage = Math.ceil(total / MESSAGE_PAGE_SIZE);

            if (lastPage === 1) {
              // Only one page, use the response we already have
              setInitialMessages(firstPageResponse.items);
              setHasMoreMessages(false);
              setOldestLoadedPage(1);
            } else {
              // Fetch the last page (most recent messages)
              const lastPageResponse = await apiClient.getMessages(
                conversationId,
                lastPage,
                MESSAGE_PAGE_SIZE,
              );
              setInitialMessages(lastPageResponse.items);
              setHasMoreMessages(lastPage > 1);
              setOldestLoadedPage(lastPage);
            }
          }

          // Set active conversation (will trigger WebSocket connection)
          setActiveConversationId(conversationId);
          setLoadingState("idle");
        } catch (err: unknown) {
          console.error("Failed to load conversation:", err);

          const errorResponse = (err as { response?: { status?: number } })
            ?.response;
          if (errorResponse?.status === 404) {
            setErrorType("not-found");
            setErrorMessage(
              "This conversation could not be found. It may have been deleted.",
            );
          } else {
            setErrorType("failed-load");
            setErrorMessage(extractErrorMessage(err));
          }
          setLoadingState("idle");
        } finally {
          isInitializingRef.current = false;
        }
      }
    };

    initializeConversation();
    // Note: loadingState intentionally excluded to prevent infinite loops
  }, [
    conversationId,
    activeConversationId,
    apiClient,
    navigate,
    useUnifiedUI,
    isFeatureFlagLoading,
  ]);

  // Load older messages (pagination)
  const loadOlderMessages = useCallback(async () => {
    if (
      !activeConversationId ||
      isLoadingMoreMessages ||
      !hasMoreMessages ||
      oldestLoadedPage <= 1
    ) {
      return;
    }

    setIsLoadingMoreMessages(true);

    try {
      const nextPage = oldestLoadedPage - 1;
      const response = await apiClient.getMessages(
        activeConversationId,
        nextPage,
        MESSAGE_PAGE_SIZE,
      );

      // Prepend older messages to the list
      setInitialMessages((prev) => {
        // Avoid duplicates by filtering based on ID
        const existingIds = new Set(prev.map((m) => m.id));
        const newMessages = response.items.filter(
          (m) => !existingIds.has(m.id),
        );
        // Sort by timestamp (oldest first)
        return [...newMessages, ...prev].sort(
          (a, b) => a.timestamp - b.timestamp,
        );
      });

      setOldestLoadedPage(nextPage);
      setHasMoreMessages(nextPage > 1);
    } catch (err) {
      console.error("Failed to load older messages:", err);
      toast.error("Failed to load messages", "Please try again.");
    } finally {
      setIsLoadingMoreMessages(false);
    }
  }, [
    activeConversationId,
    isLoadingMoreMessages,
    hasMoreMessages,
    oldestLoadedPage,
    apiClient,
    toast,
  ]);

  const handleError = useCallback(
    (code: WebSocketErrorCode, message: string) => {
      console.error(`[ChatPage] WebSocket error: ${code} - ${message}`);

      // Show toast notification for better visibility
      switch (code) {
        case "AUTH_FAILED":
          toast.error(
            "Authentication Failed",
            "Please log in again to continue.",
          );
          navigate("/login");
          break;
        case "RATE_LIMITED":
          toast.warning(
            "Rate Limited",
            "Please wait a moment before sending more messages.",
          );
          break;
        case "QUOTA_EXCEEDED":
          toast.error("Quota Exceeded", "You have reached your usage limit.");
          break;
        case "BACKEND_ERROR":
          toast.error(
            "Server Error",
            message || "The server encountered an error. Please try again.",
          );
          break;
        case "CONNECTION_DROPPED":
          toast.warning("Connection Lost", "Reconnecting to the server...");
          break;
        default:
          toast.error(
            "Connection Error",
            message || "An unexpected error occurred.",
          );
      }

      // Also update error state for persistent display in UI
      setErrorType("websocket");
      setErrorMessage(`${code}: ${message}`);

      // Auto-clear transient errors after 5 seconds
      if (
        ["RATE_LIMITED", "BACKEND_ERROR", "CONNECTION_DROPPED"].includes(code)
      ) {
        setTimeout(() => {
          setErrorType(null);
          setErrorMessage(null);
        }, 5000);
      }
    },
    [toast, navigate],
  );

  // NOTE: When useUnifiedUI is true, UnifiedChatContainer manages its own
  // useChatSession. We pass undefined for conversationId here to prevent
  // ChatPage from creating a duplicate WebSocket connection that would
  // cause duplicate messages in the chat.
  const {
    messages,
    connectionStatus,
    isTyping,
    sendMessage,
    editMessage,
    regenerateMessage,
    deleteMessage,
    reconnect,
    addMessage: _addMessage,
  } = useChatSession({
    conversationId: useUnifiedUI
      ? undefined
      : (activeConversationId ?? undefined),
    onError: handleError,
    initialMessages: useUnifiedUI ? [] : initialMessages,
  });

  // Voice mode message handlers - informational callbacks only
  // NOTE: The useThinkerTalkerVoiceMode hook already handles adding messages
  // to the conversation store. These callbacks are for any additional
  // processing (e.g., analytics, logging) but should NOT add messages
  // to avoid duplicates.
  const handleVoiceUserMessage = useCallback((_content: string) => {
    // Message already added by useThinkerTalkerVoiceMode hook
    // This callback is available for additional processing if needed
  }, []);

  const handleVoiceAssistantMessage = useCallback((_content: string) => {
    // Message already added by useThinkerTalkerVoiceMode hook
    // This callback is available for additional processing if needed
  }, []);

  /**
   * Handle voice metrics update - export to backend for observability
   * Only sends in production when VITE_ENABLE_VOICE_METRICS is set
   */
  const handleVoiceMetricsUpdate = useCallback(
    (metrics: VoiceMetrics) => {
      // Send metrics by default; allow opt-out via VITE_ENABLE_VOICE_METRICS="false"
      const shouldSendMetrics =
        import.meta.env.VITE_ENABLE_VOICE_METRICS !== "false";

      if (!shouldSendMetrics) {
        return;
      }

      try {
        const payload = {
          conversation_id: activeConversationId ?? undefined,
          connection_time_ms: metrics.connectionTimeMs,
          time_to_first_transcript_ms: metrics.timeToFirstTranscriptMs,
          last_stt_latency_ms: metrics.lastSttLatencyMs,
          last_response_latency_ms: metrics.lastResponseLatencyMs,
          session_duration_ms: metrics.sessionDurationMs,
          user_transcript_count: metrics.userTranscriptCount,
          ai_response_count: metrics.aiResponseCount,
          reconnect_count: metrics.reconnectCount,
          session_started_at: metrics.sessionStartedAt,
        };

        // Use sendBeacon for reliability (survives page navigation)
        if (navigator.sendBeacon) {
          const blob = new Blob([JSON.stringify(payload)], {
            type: "application/json",
          });
          navigator.sendBeacon("/api/voice/metrics", blob);
        } else {
          // Fallback to fetch with keepalive
          void fetch("/api/voice/metrics", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify(payload),
            keepalive: true,
          });
        }
      } catch (err) {
        console.warn("[VoiceMetrics] Failed to send metrics", err);
      }
    },
    [activeConversationId],
  );

  // Branching functionality
  const { branches, createBranch } = useBranching(activeConversationId);

  // Compute set of message IDs that have branches
  const branchedMessageIds = useMemo(
    () =>
      new Set(
        (branches || [])
          .map((b) => b.parentMessageId)
          .filter((id): id is string => Boolean(id)),
      ),
    [branches],
  );

  // Handle branch request from message - shows preview instead of directly creating
  const handleBranchFromMessage = useCallback(
    async (messageId: string): Promise<void> => {
      setBranchPreviewMessageId(messageId);
    },
    [],
  );

  // Handle branch creation confirmation
  const handleConfirmBranch = useCallback(async () => {
    if (!branchPreviewMessageId) return;

    setIsCreatingBranch(true);
    try {
      const branch = await createBranch(branchPreviewMessageId);
      if (branch) {
        // Show branch sidebar after creating
        setIsBranchSidebarOpen(true);
        toast.success(
          "Branch created",
          "You can now explore an alternative conversation path.",
        );
      }
      setBranchPreviewMessageId(null);
    } catch (error) {
      console.error("Failed to create branch:", error);
      toast.error("Branch creation failed", "Please try again.");
    } finally {
      setIsCreatingBranch(false);
    }
  }, [branchPreviewMessageId, createBranch, toast]);

  // Handle branch preview cancel
  const handleCancelBranchPreview = useCallback(() => {
    setBranchPreviewMessageId(null);
  }, []);

  // Keyboard shortcuts
  useKeyboardShortcuts({
    onToggleBranchSidebar: () => setIsBranchSidebarOpen((prev) => !prev),
    onCreateBranch: () => {
      // Get the last message ID for branching
      if (messages.length > 0) {
        const lastMessage = messages[messages.length - 1];
        handleBranchFromMessage(lastMessage.id);
      }
    },
    onShowShortcuts: () => setIsShortcutsDialogOpen(true),
    onToggleCitations: () => setIsCitationSidebarOpen((prev) => !prev),
    onToggleClinicalContext: () => setIsClinicalContextOpen((prev) => !prev),
    onToggleVoicePanel: () => setIsVoicePanelOpen((prev) => !prev),
    onCloseVoicePanel: () => setIsVoicePanelOpen(false),
    isVoicePanelOpen,
  });

  // Handle clinical context changes with debounced save
  const handleClinicalContextChange = useCallback(
    (newContext: ClinicalContext) => {
      setLocalClinicalContext(newContext);

      // Clear existing timeout
      if (saveTimeoutRef.current) {
        clearTimeout(saveTimeoutRef.current);
      }

      // Debounce save to backend (1 second)
      saveTimeoutRef.current = setTimeout(async () => {
        try {
          const backendData = frontendToBackend(newContext);
          await clinicalContextHook.saveContext(backendData);
        } catch (err) {
          console.error("Failed to save clinical context:", err);
          toast.error(
            "Failed to save clinical context",
            "Your changes may not be saved. Please try again.",
          );
        }
      }, 1000);
    },
    [clinicalContextHook],
  );

  // Cleanup timeout on unmount
  useEffect(() => {
    return () => {
      if (saveTimeoutRef.current) {
        clearTimeout(saveTimeoutRef.current);
      }
    };
  }, []);

  // Accessibility: Announce new assistant messages to screen readers
  useEffect(() => {
    if (messages.length > 0) {
      const lastMessage = messages[messages.length - 1];
      if (lastMessage.role === "assistant" && lastMessage.content) {
        // Announce first 100 characters of assistant response
        const preview = lastMessage.content.substring(0, 100);
        announce(
          `New message from assistant: ${preview}${lastMessage.content.length > 100 ? "..." : ""}`,
        );
      }
    }
  }, [messages, announce]);

  // Debug: Log early in render to catch what's happening
  console.log("[ChatPage] Early render check:", {
    loadingState,
    isFeatureFlagLoading,
    useUnifiedUI,
  });

  // Loading states - use skeleton loaders for better UX
  // BUT: Skip this check if unified UI is enabled - UnifiedChatContainer handles its own loading
  if (
    !useUnifiedUI &&
    (loadingState === "creating" ||
      loadingState === "validating" ||
      loadingState === "loading-history")
  ) {
    console.log("[ChatPage] Showing skeleton - loadingState:", loadingState);
    return <ChatSkeleton />;
  }

  // Error states
  if (errorType === "not-found") {
    return (
      <div className="flex items-center justify-center h-full p-4">
        <div className="text-center max-w-md">
          <div className="w-16 h-16 mx-auto mb-4 rounded-full bg-red-100 flex items-center justify-center">
            <svg
              xmlns="http://www.w3.org/2000/svg"
              fill="none"
              viewBox="0 0 24 24"
              strokeWidth={1.5}
              stroke="currentColor"
              className="w-8 h-8 text-red-600"
            >
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                d="M12 9v3.75m9-.75a9 9 0 11-18 0 9 9 0 0118 0zm-9 3.75h.008v.008H12v-.008z"
              />
            </svg>
          </div>
          <h3 className="text-lg font-semibold text-neutral-900 mb-2">
            Conversation Not Found
          </h3>
          <p className="text-sm text-neutral-600 mb-6">{errorMessage}</p>
          <button
            type="button"
            onClick={() => navigate("/chat")}
            className="inline-flex items-center px-4 py-2 text-sm font-medium text-white bg-primary-500 rounded-md hover:bg-primary-600 transition-colors"
          >
            <svg
              xmlns="http://www.w3.org/2000/svg"
              fill="none"
              viewBox="0 0 24 24"
              strokeWidth={2}
              stroke="currentColor"
              className="w-4 h-4 mr-2"
            >
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                d="M10.5 19.5L3 12m0 0l7.5-7.5M3 12h18"
              />
            </svg>
            Back to Conversations
          </button>
        </div>
      </div>
    );
  }

  if (errorType === "failed-create" || errorType === "failed-load") {
    return (
      <div className="flex items-center justify-center h-full p-4">
        <div className="text-center max-w-md">
          <div className="w-16 h-16 mx-auto mb-4 rounded-full bg-red-100 flex items-center justify-center">
            <svg
              xmlns="http://www.w3.org/2000/svg"
              fill="none"
              viewBox="0 0 24 24"
              strokeWidth={1.5}
              stroke="currentColor"
              className="w-8 h-8 text-red-600"
            >
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                d="M12 9v3.75m9-.75a9 9 0 11-18 0 9 9 0 0118 0zm-9 3.75h.008v.008H12v-.008z"
              />
            </svg>
          </div>
          <h3 className="text-lg font-semibold text-neutral-900 mb-2">
            {errorType === "failed-create"
              ? "Failed to Create Conversation"
              : "Failed to Load Conversation"}
          </h3>
          <p className="text-sm text-neutral-600 mb-6">{errorMessage}</p>
          <button
            type="button"
            onClick={() => window.location.reload()}
            className="inline-flex items-center px-4 py-2 text-sm font-medium text-white bg-primary-500 rounded-md hover:bg-primary-600 transition-colors"
          >
            Try Again
          </button>
        </div>
      </div>
    );
  }

  // Debug logging for render path
  console.log("[ChatPage] Render state:", {
    isFeatureFlagLoading,
    useUnifiedUI,
    conversationId,
    activeConversationId,
    loadingState,
  });

  // Show loading while checking feature flag
  if (isFeatureFlagLoading) {
    console.log("[ChatPage] Showing skeleton - feature flag loading");
    return <ChatSkeleton />;
  }

  // Render unified chat/voice UI when feature flag is enabled
  // UnifiedChatContainer handles its own conversation creation/loading
  // NOTE: We pass conversationId from URL params directly (not activeConversationId state)
  // to ensure immediate updates when user clicks a different conversation in sidebar.
  // UnifiedChatContainer will read from URL params and handle loading internally.
  if (useUnifiedUI) {
    console.log("[ChatPage] Rendering UnifiedChatContainer", {
      conversationId,
    });
    return (
      <UnifiedChatContainer
        // Use key to force complete remount when conversation changes
        // This ensures all state (WebSocket, messages, etc.) is reset cleanly
        key={conversationId || "new"}
        conversationId={conversationId || undefined}
        startInVoiceMode={startVoiceMode}
        // Keep ChatPage's activeConversationId in sync so shared hooks
        // (e.g., clinical context, analytics) see the correct session when
        // using the unified UI.
        onConversationReady={(id) => {
          setActiveConversationId(id);
        }}
      />
    );
  }

  // For legacy UI: show loading while creating/loading conversation
  if (!activeConversationId) {
    console.log(
      "[ChatPage] Showing legacy loading spinner - no activeConversationId",
    );
    return (
      <div className="flex items-center justify-center h-full">
        <div className="text-center">
          <div className="w-12 h-12 mx-auto mb-4 rounded-full border-4 border-primary-500 border-t-transparent animate-spin" />
          <p className="text-neutral-600">Loading...</p>
        </div>
      </div>
    );
  }

  return (
    <ChatErrorBoundary
      onError={(err, info) => {
        console.error("[ChatPage] Error:", err, info);
        setErrorType("websocket");
        setErrorMessage("An unexpected error occurred");
      }}
    >
      <div className="flex h-full">
        {/* Main Chat Area */}
        <div className="flex flex-col flex-1 min-w-0">
          {/* Header */}
          <div className="flex items-center justify-between px-4 py-3 border-b border-neutral-200 bg-white">
            <div className="flex items-center space-x-3">
              <h1 className="text-lg font-semibold text-neutral-900">
                {conversation?.title || "Chat"}
              </h1>
            </div>

            <div className="flex items-center space-x-3">
              <ConnectionStatus
                status={connectionStatus}
                onReconnect={reconnect}
              />

              {/* Clinical Context Toggle */}
              <button
                type="button"
                onClick={() => setIsClinicalContextOpen((prev) => !prev)}
                className="flex items-center gap-2 px-3 py-1.5 text-sm font-medium text-neutral-700 bg-neutral-100 hover:bg-neutral-200 rounded-md transition-colors"
                aria-label="Toggle clinical context"
                title="Clinical context (⌘I)"
              >
                <svg
                  xmlns="http://www.w3.org/2000/svg"
                  fill="none"
                  viewBox="0 0 24 24"
                  strokeWidth={1.5}
                  stroke="currentColor"
                  className="w-4 h-4"
                >
                  <path
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    d="M19.5 14.25v-2.625a3.375 3.375 0 00-3.375-3.375h-1.5A1.125 1.125 0 0113.5 7.125v-1.5a3.375 3.375 0 00-3.375-3.375H8.25m0 12.75h7.5m-7.5 3H12M10.5 2.25H5.625c-.621 0-1.125.504-1.125 1.125v17.25c0 .621.504 1.125 1.125 1.125h12.75c.621 0 1.125-.504 1.125-1.125V11.25a9 9 0 00-9-9z"
                  />
                </svg>
                <span className="hidden sm:inline">Context</span>
              </button>

              {/* Citations Toggle */}
              <button
                type="button"
                onClick={() => setIsCitationSidebarOpen((prev) => !prev)}
                className="flex items-center gap-2 px-3 py-1.5 text-sm font-medium text-neutral-700 bg-neutral-100 hover:bg-neutral-200 rounded-md transition-colors"
                aria-label="Toggle citations"
                title="Citations (⌘C)"
              >
                <svg
                  xmlns="http://www.w3.org/2000/svg"
                  fill="none"
                  viewBox="0 0 24 24"
                  strokeWidth={1.5}
                  stroke="currentColor"
                  className="w-4 h-4"
                >
                  <path
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    d="M12 6.042A8.967 8.967 0 006 3.75c-1.052 0-2.062.18-3 .512v14.25A8.987 8.987 0 016 18c2.305 0 4.408.867 6 2.292m0-14.25a8.966 8.966 0 016-2.292c1.052 0 2.062.18 3 .512v14.25A8.987 8.987 0 0018 18a8.967 8.967 0 00-6 2.292m0-14.25v14.25"
                  />
                </svg>
                <span className="hidden sm:inline">Citations</span>
              </button>

              {/* Branch Sidebar Toggle */}
              <button
                type="button"
                onClick={() => setIsBranchSidebarOpen((prev) => !prev)}
                className="flex items-center gap-2 px-3 py-1.5 text-sm font-medium text-neutral-700 bg-neutral-100 hover:bg-neutral-200 rounded-md transition-colors"
                aria-label="Toggle branch sidebar"
                title="Toggle branches (⌘B)"
              >
                <svg
                  xmlns="http://www.w3.org/2000/svg"
                  fill="none"
                  viewBox="0 0 24 24"
                  strokeWidth={1.5}
                  stroke="currentColor"
                  className="w-4 h-4"
                >
                  <path
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    d="M9 6.75V15m6-6v8.25m.503 3.498l4.875-2.437c.381-.19.622-.58.622-1.006V4.82c0-.836-.88-1.38-1.628-1.006l-3.869 1.934c-.317.159-.69.159-1.006 0L9.503 3.252a1.125 1.125 0 00-1.006 0L3.622 5.689C3.24 5.88 3 6.27 3 6.695V19.18c0 .836.88 1.38 1.628 1.006l3.869-1.934c.317-.159.69-.159 1.006 0l4.994 2.497c.317.158.69.158 1.006 0z"
                  />
                </svg>
                <span className="hidden sm:inline">Branches</span>
              </button>

              {/* Export Button */}
              <button
                type="button"
                onClick={() => setIsExportDialogOpen(true)}
                className="flex items-center gap-2 px-3 py-1.5 text-sm font-medium text-neutral-700 bg-neutral-100 hover:bg-neutral-200 rounded-md transition-colors"
                aria-label="Export conversation"
                title="Export conversation"
              >
                <svg
                  xmlns="http://www.w3.org/2000/svg"
                  fill="none"
                  viewBox="0 0 24 24"
                  strokeWidth={1.5}
                  stroke="currentColor"
                  className="w-4 h-4"
                >
                  <path
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    d="M3 16.5v2.25A2.25 2.25 0 005.25 21h13.5A2.25 2.25 0 0021 18.75V16.5M16.5 12L12 16.5m0 0L7.5 12m4.5 4.5V3"
                  />
                </svg>
                <span className="hidden sm:inline">Export</span>
              </button>

              {/* Share Button */}
              <button
                type="button"
                onClick={() => setIsShareDialogOpen(true)}
                className="flex items-center gap-2 px-3 py-1.5 text-sm font-medium text-neutral-700 bg-neutral-100 hover:bg-neutral-200 rounded-md transition-colors"
                aria-label="Share conversation"
                title="Share conversation"
              >
                <svg
                  xmlns="http://www.w3.org/2000/svg"
                  fill="none"
                  viewBox="0 0 24 24"
                  strokeWidth={1.5}
                  stroke="currentColor"
                  className="w-4 h-4"
                >
                  <path
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    d="M7.217 10.907a2.25 2.25 0 100 2.186m0-2.186c.18.324.283.696.283 1.093s-.103.77-.283 1.093m0-2.186l9.566-5.314m-9.566 7.5l9.566 5.314m0 0a2.25 2.25 0 103.935 2.186 2.25 2.25 0 00-3.935-2.186zm0-12.814a2.25 2.25 0 103.933-2.185 2.25 2.25 0 00-3.933 2.185z"
                  />
                </svg>
                <span className="hidden sm:inline">Share</span>
              </button>

              {/* Save as Template Button */}
              <button
                type="button"
                onClick={() => setIsSaveTemplateDialogOpen(true)}
                className="flex items-center gap-2 px-3 py-1.5 text-sm font-medium text-neutral-700 bg-neutral-100 hover:bg-neutral-200 rounded-md transition-colors"
                aria-label="Save as template"
                title="Save as template"
              >
                <svg
                  xmlns="http://www.w3.org/2000/svg"
                  fill="none"
                  viewBox="0 0 24 24"
                  strokeWidth={1.5}
                  stroke="currentColor"
                  className="w-4 h-4"
                >
                  <path
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    d="M17.593 3.322c1.1.128 1.907 1.077 1.907 2.185V21L12 17.25 4.5 21V5.507c0-1.108.806-2.057 1.907-2.185a48.507 48.507 0 0111.186 0z"
                  />
                </svg>
                <span className="hidden sm:inline">Template</span>
              </button>
            </div>
          </div>

          {/* Error Toast */}
          {errorType === "websocket" && errorMessage && (
            <div className="px-4 py-3 bg-red-50 border-b border-red-200 flex items-center justify-between">
              <div className="flex items-center space-x-2">
                <svg
                  xmlns="http://www.w3.org/2000/svg"
                  fill="none"
                  viewBox="0 0 24 24"
                  strokeWidth={1.5}
                  stroke="currentColor"
                  className="w-5 h-5 text-red-600"
                >
                  <path
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    d="M12 9v3.75m9-.75a9 9 0 11-18 0 9 9 0 0118 0zm-9 3.75h.008v.008H12v-.008z"
                  />
                </svg>
                <span className="text-sm text-red-800">{errorMessage}</span>
              </div>
              <button
                type="button"
                onClick={() => {
                  setErrorType(null);
                  setErrorMessage(null);
                }}
                className="text-red-600 hover:text-red-700 focus:outline-none focus:ring-2 focus:ring-red-500 rounded"
                aria-label="Dismiss error"
              >
                <svg
                  xmlns="http://www.w3.org/2000/svg"
                  fill="none"
                  viewBox="0 0 24 24"
                  strokeWidth={2}
                  stroke="currentColor"
                  className="w-5 h-5"
                >
                  <path
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    d="M6 18L18 6M6 6l12 12"
                  />
                </svg>
              </button>
            </div>
          )}
          {/* Branch Preview */}
          {branchPreviewMessageId && (
            <div className="px-4 py-3 border-b border-neutral-200">
              <BranchPreview
                messages={messages}
                parentMessageId={branchPreviewMessageId}
                isCreating={isCreatingBranch}
                onConfirm={handleConfirmBranch}
                onCancel={handleCancelBranchPreview}
              />
            </div>
          )}

          {/* Messages */}
          <div className="flex-1 overflow-hidden bg-neutral-50 px-4 py-4">
            <MessageList
              messages={messages}
              isTyping={isTyping}
              streamingMessageId={
                messages.find((m) => m.role === "assistant" && isTyping)?.id
              }
              onEditSave={editMessage}
              onRegenerate={regenerateMessage}
              onDelete={deleteMessage}
              onBranch={handleBranchFromMessage}
              branchedMessageIds={branchedMessageIds}
              onLoadMore={loadOlderMessages}
              hasMore={hasMoreMessages}
              isLoadingMore={isLoadingMoreMessages}
              totalCount={totalMessageCount}
            />
          </div>

          {/* Input */}
          <MessageInput
            onSend={sendMessage}
            disabled={connectionStatus !== "connected"}
            enableAttachments={true} // Phase 4: File upload enabled
            enableVoiceInput={true} // Phase 3: Voice features
            enableRealtimeVoice={true} // Realtime voice mode (OpenAI Realtime API)
            autoOpenRealtimeVoice={startVoiceMode} // Auto-open voice mode when navigating from Voice Mode card
            conversationId={activeConversationId || undefined}
            onVoiceUserMessage={handleVoiceUserMessage}
            onVoiceAssistantMessage={handleVoiceAssistantMessage}
            onVoiceMetricsUpdate={handleVoiceMetricsUpdate}
            isVoicePanelOpen={isVoicePanelOpen}
            onVoicePanelChange={setIsVoicePanelOpen}
          />
        </div>

        {/* Clinical Context Sidebar */}
        {isClinicalContextOpen && (
          <ClinicalContextSidebar
            isOpen={isClinicalContextOpen}
            onClose={() => setIsClinicalContextOpen(false)}
            context={clinicalContext}
            onChange={handleClinicalContextChange}
          />
        )}

        {/* Citation Sidebar */}
        {isCitationSidebarOpen && (
          <CitationSidebar
            isOpen={isCitationSidebarOpen}
            onClose={() => setIsCitationSidebarOpen(false)}
            messages={messages}
            onJumpToMessage={(messageId) => {
              const el = document.querySelector<HTMLElement>(
                `[data-message-id="${messageId}"]`,
              );
              if (el) {
                el.scrollIntoView({ behavior: "smooth", block: "center" });
                el.classList.add("ring-2", "ring-primary-500");
                setTimeout(() => {
                  el.classList.remove("ring-2", "ring-primary-500");
                }, 2000);
              }
            }}
          />
        )}

        {/* Branch Sidebar */}
        {isBranchSidebarOpen && (
          <BranchSidebar
            sessionId={activeConversationId}
            isOpen={isBranchSidebarOpen}
            onClose={() => setIsBranchSidebarOpen(false)}
          />
        )}
      </div>

      {/* Keyboard Shortcuts Dialog */}
      <KeyboardShortcutsDialog
        isOpen={isShortcutsDialogOpen}
        onClose={() => setIsShortcutsDialogOpen(false)}
      />

      {/* Export Dialog */}
      {activeConversationId && (
        <ExportDialog
          isOpen={isExportDialogOpen}
          onClose={() => setIsExportDialogOpen(false)}
          conversationId={activeConversationId}
          conversationTitle={conversation?.title || "Conversation"}
          messages={messages}
        />
      )}

      {/* Share Dialog */}
      {activeConversationId && (
        <ShareDialog
          isOpen={isShareDialogOpen}
          onClose={() => setIsShareDialogOpen(false)}
          conversationId={activeConversationId}
          conversationTitle={conversation?.title || "Conversation"}
        />
      )}

      {/* Save as Template Dialog */}
      <SaveAsTemplateDialog
        isOpen={isSaveTemplateDialogOpen}
        onClose={() => setIsSaveTemplateDialogOpen(false)}
        onSave={async (name, description, category, icon, color) => {
          if (activeConversationId && conversation) {
            await createFromConversation(
              activeConversationId,
              conversation.title,
              messages,
              { name, description, category, icon, color },
            );
            announce("Template saved successfully");
          }
        }}
        conversationTitle={conversation?.title || "Conversation"}
      />

      {/* Accessibility: Live Region for Screen Reader Announcements */}
      <AnnouncementRegion />
    </ChatErrorBoundary>
  );
}
