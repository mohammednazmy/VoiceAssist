/**
 * Chat Page
 * Main chat interface with WebSocket streaming
 */

import { useState, useCallback, useEffect } from "react";
import { useParams, useNavigate } from "react-router-dom";
import { useAuth } from "../hooks/useAuth";
import { useChatSession } from "../hooks/useChatSession";
import { useBranching } from "../hooks/useBranching";
import { useKeyboardShortcuts } from "../hooks/useKeyboardShortcuts";
import { MessageList } from "../components/chat/MessageList";
import { MessageInput } from "../components/chat/MessageInput";
import { ConnectionStatus } from "../components/chat/ConnectionStatus";
import { ChatErrorBoundary } from "../components/chat/ChatErrorBoundary";
import { BranchSidebar } from "../components/chat/BranchSidebar";
import { KeyboardShortcutsDialog } from "../components/KeyboardShortcutsDialog";
import { ClinicalContextSidebar } from "../components/clinical/ClinicalContextSidebar";
import { CitationSidebar } from "../components/citations/CitationSidebar";
import { ExportDialog } from "../components/export/ExportDialog";
import { useAnnouncer } from "../components/accessibility/LiveRegion";
import type { ClinicalContext } from "../components/clinical/ClinicalContextPanel";
import type {
  Message,
  WebSocketErrorCode,
  Conversation,
} from "@voiceassist/types";

type LoadingState = "idle" | "creating" | "validating" | "loading-history";
type ErrorType =
  | "not-found"
  | "failed-create"
  | "failed-load"
  | "websocket"
  | null;

export function ChatPage() {
  const { conversationId } = useParams<{ conversationId: string }>();
  const navigate = useNavigate();
  const { apiClient } = useAuth();

  const [loadingState, setLoadingState] = useState<LoadingState>("idle");
  const [errorType, setErrorType] = useState<ErrorType>(null);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [activeConversationId, setActiveConversationId] = useState<
    string | null
  >(null);
  const [conversation, setConversation] = useState<Conversation | null>(null);
  const [initialMessages, setInitialMessages] = useState<Message[]>([]);
  const [isBranchSidebarOpen, setIsBranchSidebarOpen] = useState(false);
  const [isShortcutsDialogOpen, setIsShortcutsDialogOpen] = useState(false);
  const [isClinicalContextOpen, setIsClinicalContextOpen] = useState(false);
  const [isCitationSidebarOpen, setIsCitationSidebarOpen] = useState(false);
  const [isExportDialogOpen, setIsExportDialogOpen] = useState(false);
  const [clinicalContext, setClinicalContext] = useState<ClinicalContext>(
    () => {
      // Load from localStorage
      const saved = localStorage.getItem("voiceassist:clinical-context");
      return saved ? JSON.parse(saved) : {};
    },
  );

  // Accessibility: Screen reader announcements
  const { announce, LiveRegion: AnnouncementRegion } = useAnnouncer("polite");

  // Handle conversation initialization and validation
  useEffect(() => {
    const initializeConversation = async () => {
      // If no conversationId in URL, auto-create and redirect
      if (!conversationId) {
        if (loadingState === "creating") return; // Already creating

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
        }
        return;
      }

      // If conversationId changed, validate and load
      if (conversationId !== activeConversationId) {
        setLoadingState("validating");
        setErrorType(null);
        setActiveConversationId(null);
        setConversation(null);
        setInitialMessages([]);

        try {
          // Validate conversation exists
          const conv = await apiClient.getConversation(conversationId);
          setConversation(conv);

          // Load conversation history
          setLoadingState("loading-history");
          const messagesResponse = await apiClient.getMessages(
            conversationId,
            1,
            50,
          );
          setInitialMessages(messagesResponse.items);

          // Set active conversation (will trigger WebSocket connection)
          setActiveConversationId(conversationId);
          setLoadingState("idle");
        } catch (err: any) {
          console.error("Failed to load conversation:", err);

          if (err.response?.status === 404) {
            setErrorType("not-found");
            setErrorMessage(
              "This conversation could not be found. It may have been deleted.",
            );
          } else {
            setErrorType("failed-load");
            setErrorMessage("Failed to load conversation. Please try again.");
          }
          setLoadingState("idle");
        }
      }
    };

    initializeConversation();
  }, [conversationId, activeConversationId, apiClient, navigate, loadingState]);

  const handleError = useCallback(
    (code: WebSocketErrorCode, message: string) => {
      setErrorType("websocket");
      // Show transient toast for recoverable errors
      if (["RATE_LIMITED", "BACKEND_ERROR"].includes(code)) {
        setErrorMessage(`${code}: ${message}`);
        setTimeout(() => {
          setErrorType(null);
          setErrorMessage(null);
        }, 5000);
      } else {
        // Persistent error for fatal issues
        setErrorMessage(`${code}: ${message}`);
      }
    },
    [],
  );

  const {
    messages,
    connectionStatus,
    isTyping,
    sendMessage,
    editMessage,
    regenerateMessage,
    deleteMessage,
    reconnect,
  } = useChatSession({
    conversationId: activeConversationId || "",
    onError: handleError,
    initialMessages,
  });

  // Branching functionality
  const { createBranch } = useBranching(activeConversationId);

  // Handle branch creation from message
  const handleBranchFromMessage = useCallback(
    async (messageId: string) => {
      try {
        const branch = await createBranch(messageId);
        if (branch) {
          // Show branch sidebar after creating
          setIsBranchSidebarOpen(true);
        }
      } catch (error) {
        console.error("Failed to create branch:", error);
        setErrorType("websocket");
        setErrorMessage("Failed to create branch. Please try again.");
      }
    },
    [createBranch],
  );

  // Keyboard shortcuts (pass function that opens dialog via Cmd+/)
  useKeyboardShortcuts({
    onToggleBranchSidebar: () => setIsBranchSidebarOpen((prev) => !prev),
    onCreateBranch: () => {
      // Get the last message ID for branching
      if (messages.length > 0) {
        const lastMessage = messages[messages.length - 1];
        handleBranchFromMessage(lastMessage.id);
      }
    },
  });

  // Override keyboard shortcut dialog handler
  useEffect(() => {
    const handleKeyDown = (event: KeyboardEvent) => {
      const isMac = navigator.platform.toUpperCase().indexOf("MAC") >= 0;
      const modKey = isMac ? event.metaKey : event.ctrlKey;

      // Cmd/Ctrl + /: Show keyboard shortcuts
      if (modKey && event.key === "/") {
        event.preventDefault();
        setIsShortcutsDialogOpen(true);
      }

      // Cmd/Ctrl + I: Toggle clinical context sidebar
      if (modKey && event.key === "i") {
        event.preventDefault();
        setIsClinicalContextOpen((prev) => !prev);
      }

      // Cmd/Ctrl + C: Toggle citation sidebar
      if (modKey && event.key === "c") {
        event.preventDefault();
        setIsCitationSidebarOpen((prev) => !prev);
      }
    };

    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, []);

  // Save clinical context to localStorage
  useEffect(() => {
    localStorage.setItem(
      "voiceassist:clinical-context",
      JSON.stringify(clinicalContext),
    );
  }, [clinicalContext]);

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
  // Loading states
  if (loadingState === "creating") {
    return (
      <div className="flex items-center justify-center h-full">
        <div className="text-center">
          <div className="w-12 h-12 mx-auto mb-4 rounded-full border-4 border-primary-500 border-t-transparent animate-spin" />
          <p className="text-neutral-600">Creating conversation...</p>
        </div>
      </div>
    );
  }

  if (loadingState === "validating" || loadingState === "loading-history") {
    return (
      <div className="flex items-center justify-center h-full">
        <div className="text-center">
          <div className="w-12 h-12 mx-auto mb-4 rounded-full border-4 border-primary-500 border-t-transparent animate-spin" />
          <p className="text-neutral-600">Loading conversation...</p>
        </div>
      </div>
    );
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

  if (!activeConversationId) {
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
            />
          </div>

          {/* Input */}
          <MessageInput
            onSend={sendMessage}
            disabled={connectionStatus !== "connected"}
            enableAttachments={true} // Phase 4: File upload enabled
            enableVoiceInput={true} // Phase 3: Voice features
          />
        </div>

        {/* Clinical Context Sidebar */}
        {isClinicalContextOpen && (
          <ClinicalContextSidebar
            isOpen={isClinicalContextOpen}
            onClose={() => setIsClinicalContextOpen(false)}
            context={clinicalContext}
            onChange={setClinicalContext}
          />
        )}

        {/* Citation Sidebar */}
        {isCitationSidebarOpen && (
          <CitationSidebar
            isOpen={isCitationSidebarOpen}
            onClose={() => setIsCitationSidebarOpen(false)}
            messages={messages}
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
      <ExportDialog
        isOpen={isExportDialogOpen}
        onClose={() => setIsExportDialogOpen(false)}
        conversationTitle={conversation?.title || "Conversation"}
        messages={messages}
      />

      {/* Accessibility: Live Region for Screen Reader Announcements */}
      <AnnouncementRegion />
    </ChatErrorBoundary>
  );
}
