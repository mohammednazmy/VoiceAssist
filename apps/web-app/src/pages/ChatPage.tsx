/**
 * Chat Page
 * Main chat interface with WebSocket streaming
 */

import { useState, useCallback, useEffect } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { useAuth } from '../hooks/useAuth';
import { useChatSession } from '../hooks/useChatSession';
import { MessageList } from '../components/chat/MessageList';
import { MessageInput } from '../components/chat/MessageInput';
import { ConnectionStatus } from '../components/chat/ConnectionStatus';
import { ChatErrorBoundary } from '../components/chat/ChatErrorBoundary';
import type { Message, WebSocketErrorCode } from '@voiceassist/types';

export function ChatPage() {
  const { conversationId } = useParams<{ conversationId: string }>();
  const navigate = useNavigate();
  const { apiClient } = useAuth();

  const [error, setError] = useState<string | null>(null);
  const [isCreatingConversation, setIsCreatingConversation] = useState(false);
  const [activeConversationId, setActiveConversationId] = useState<string | null>(
    conversationId || null
  );

  // Create conversation if needed
  useEffect(() => {
    if (!activeConversationId && !isCreatingConversation) {
      setIsCreatingConversation(true);
      apiClient
        .createConversation('New Conversation')
        .then((conversation) => {
          setActiveConversationId(conversation.id);
          navigate(`/chat/${conversation.id}`, { replace: true });
        })
        .catch((err) => {
          console.error('Failed to create conversation:', err);
          setError('Failed to create conversation');
        })
        .finally(() => {
          setIsCreatingConversation(false);
        });
    }
  }, [activeConversationId, isCreatingConversation, apiClient, navigate]);

  const handleError = useCallback((code: WebSocketErrorCode, message: string) => {
    // Show transient toast for recoverable errors
    if (['RATE_LIMITED', 'BACKEND_ERROR'].includes(code)) {
      setError(`${code}: ${message}`);
      setTimeout(() => setError(null), 5000);
    } else {
      // Persistent error for fatal issues
      setError(`${code}: ${message}`);
    }
  }, []);

  const {
    messages,
    connectionStatus,
    isTyping,
    sendMessage,
    reconnect,
  } = useChatSession({
    conversationId: activeConversationId || '',
    onError: handleError,
  });

  if (!activeConversationId) {
    return (
      <div className="flex items-center justify-center h-full">
        <div className="text-center">
          <div className="w-12 h-12 mx-auto mb-4 rounded-full border-4 border-primary-500 border-t-transparent animate-spin" />
          <p className="text-neutral-600">Creating conversation...</p>
        </div>
      </div>
    );
  }

  return (
    <ChatErrorBoundary
      onError={(err, info) => {
        console.error('[ChatPage] Error:', err, info);
        setError('An unexpected error occurred');
      }}
    >
      <div className="flex flex-col h-full">
        {/* Header */}
        <div className="flex items-center justify-between px-4 py-3 border-b border-neutral-200 bg-white">
          <div className="flex items-center space-x-3">
            <button
              type="button"
              onClick={() => navigate('/')}
              className="p-2 rounded-md hover:bg-neutral-100 transition-colors focus:outline-none focus:ring-2 focus:ring-primary-500"
              aria-label="Back to home"
            >
              <svg
                xmlns="http://www.w3.org/2000/svg"
                fill="none"
                viewBox="0 0 24 24"
                strokeWidth={1.5}
                stroke="currentColor"
                className="w-5 h-5"
              >
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  d="M10.5 19.5L3 12m0 0l7.5-7.5M3 12h18"
                />
              </svg>
            </button>
            <h1 className="text-lg font-semibold text-neutral-900">Chat</h1>
          </div>

          <ConnectionStatus status={connectionStatus} onReconnect={reconnect} />
        </div>

        {/* Error Toast */}
        {error && (
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
              <span className="text-sm text-red-800">{error}</span>
            </div>
            <button
              type="button"
              onClick={() => setError(null)}
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
                <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
              </svg>
            </button>
          </div>
        )}

        {/* Messages */}
        <div className="flex-1 overflow-hidden bg-neutral-50 px-4 py-4">
          <MessageList
            messages={messages}
            isTyping={isTyping}
            streamingMessageId={messages.find((m) => m.role === 'assistant' && isTyping)?.id}
          />
        </div>

        {/* Input */}
        <MessageInput
          onSend={sendMessage}
          disabled={connectionStatus !== 'connected'}
          enableAttachments={false} // Feature flagged
        />
      </div>
    </ChatErrorBoundary>
  );
}
