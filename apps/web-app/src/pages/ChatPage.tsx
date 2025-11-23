/**
 * Chat Page
 * Main chat interface with WebSocket streaming
 */

import { useState, useCallback, useEffect } from "react";
import { useParams, useNavigate } from "react-router-dom";
import { useAuth } from "../hooks/useAuth";
import { useChatSession } from "../hooks/useChatSession";
import { MessageList } from "../components/chat/MessageList";
import { MessageInput } from "../components/chat/MessageInput";
import { ConnectionStatus } from "../components/chat/ConnectionStatus";
import { ChatErrorBoundary } from "../components/chat/ChatErrorBoundary";
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
      <div className="flex flex-col h-full">
        {/* Header */}
        <div className="flex items-center justify-between px-4 py-3 border-b border-neutral-200 bg-white">
          <div className="flex items-center space-x-3">
            <h1 className="text-lg font-semibold text-neutral-900">
              {conversation?.title || "Chat"}
            </h1>
          </div>

          <ConnectionStatus status={connectionStatus} onReconnect={reconnect} />
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
          />
        </div>

        {/* Input */}
        <MessageInput
          onSend={sendMessage}
          disabled={connectionStatus !== "connected"}
          enableAttachments={false} // Feature flagged
          enableVoiceInput={true} // Phase 1: Basic voice mode
        />
      </div>
    </ChatErrorBoundary>
  );
}
