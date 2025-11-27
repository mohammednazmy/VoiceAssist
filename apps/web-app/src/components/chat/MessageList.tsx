/**
 * MessageList Component
 * Virtualized list of messages using react-virtuoso
 *
 * Features:
 * - Virtualized rendering for performance
 * - Scroll-to-load older messages
 * - Auto-scroll to bottom on new messages
 */

import { useEffect, useRef, useCallback } from "react";
import { Virtuoso, VirtuosoHandle } from "react-virtuoso";
import type { Message } from "@voiceassist/types";
import { MessageBubble } from "./MessageBubble";
import { StreamingIndicator } from "./StreamingIndicator";

export interface MessageListProps {
  messages: Message[];
  isTyping?: boolean;
  streamingMessageId?: string;
  onEditSave?: (messageId: string, newContent: string) => Promise<void>;
  onRegenerate?: (messageId: string) => Promise<void>;
  onDelete?: (messageId: string) => Promise<void>;
  onBranch?: (messageId: string) => Promise<void>;
  /** Set of message IDs that have branches created from them */
  branchedMessageIds?: Set<string>;
  /** Pagination: callback to load older messages */
  onLoadMore?: () => void;
  /** Pagination: whether there are more messages to load */
  hasMore?: boolean;
  /** Pagination: whether currently loading more messages */
  isLoadingMore?: boolean;
  /** Total number of messages in conversation */
  totalCount?: number;
}

export function MessageList({
  messages,
  isTyping,
  streamingMessageId,
  onEditSave,
  onRegenerate,
  onDelete,
  onBranch,
  branchedMessageIds,
  onLoadMore,
  hasMore = false,
  isLoadingMore = false,
  totalCount,
}: MessageListProps) {
  const virtuosoRef = useRef<VirtuosoHandle>(null);
  const isLoadingRef = useRef(false);

  // Handle scroll to top - load older messages
  const handleStartReached = useCallback(() => {
    if (hasMore && !isLoadingRef.current && onLoadMore) {
      isLoadingRef.current = true;
      onLoadMore();
    }
  }, [hasMore, onLoadMore]);

  // Reset loading ref when isLoadingMore changes to false
  useEffect(() => {
    if (!isLoadingMore) {
      isLoadingRef.current = false;
    }
  }, [isLoadingMore]);

  // Auto-scroll to bottom when new messages arrive
  useEffect(() => {
    if (messages.length > 0) {
      virtuosoRef.current?.scrollToIndex({
        index: messages.length - 1,
        behavior: "smooth",
        align: "end",
      });
    }
  }, [messages.length]);

  if (messages.length === 0) {
    return (
      <div className="flex items-center justify-center h-full">
        <div className="text-center max-w-md px-4">
          <div className="w-16 h-16 mx-auto mb-4 rounded-full bg-primary-100 flex items-center justify-center">
            <svg
              xmlns="http://www.w3.org/2000/svg"
              fill="none"
              viewBox="0 0 24 24"
              strokeWidth={1.5}
              stroke="currentColor"
              className="w-8 h-8 text-primary-600"
            >
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                d="M8.625 12a.375.375 0 11-.75 0 .375.375 0 01.75 0zm0 0H8.25m4.125 0a.375.375 0 11-.75 0 .375.375 0 01.75 0zm0 0H12m4.125 0a.375.375 0 11-.75 0 .375.375 0 01.75 0zm0 0h-.375M21 12c0 4.556-4.03 8.25-9 8.25a9.764 9.764 0 01-2.555-.337A5.972 5.972 0 015.41 20.97a5.969 5.969 0 01-.474-.065 4.48 4.48 0 00.978-2.025c.09-.457-.133-.901-.467-1.226C3.93 16.178 3 14.189 3 12c0-4.556 4.03-8.25 9-8.25s9 3.694 9 8.25z"
              />
            </svg>
          </div>
          <h3 className="text-lg font-semibold text-neutral-900 mb-2">
            Start a Conversation
          </h3>
          <p className="text-neutral-600">
            Ask me anything about medical information, treatment protocols, or
            healthcare guidance.
          </p>
        </div>
      </div>
    );
  }

  // Loading indicator component for the header
  const LoadingHeader = () => {
    if (isLoadingMore) {
      return (
        <div className="flex justify-center py-3">
          <div className="flex items-center gap-2 text-sm text-neutral-500">
            <svg
              className="animate-spin h-4 w-4"
              xmlns="http://www.w3.org/2000/svg"
              fill="none"
              viewBox="0 0 24 24"
            >
              <circle
                className="opacity-25"
                cx="12"
                cy="12"
                r="10"
                stroke="currentColor"
                strokeWidth="4"
              />
              <path
                className="opacity-75"
                fill="currentColor"
                d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"
              />
            </svg>
            <span>Loading older messages...</span>
          </div>
        </div>
      );
    }

    if (hasMore) {
      return (
        <div className="flex justify-center py-2">
          <span className="text-xs text-neutral-400">
            Scroll up to load more
          </span>
        </div>
      );
    }

    if (totalCount && totalCount > 0) {
      return (
        <div className="flex justify-center py-2">
          <span className="text-xs text-neutral-400">
            Beginning of conversation ({totalCount} messages)
          </span>
        </div>
      );
    }

    return null;
  };

  return (
    <div role="region" aria-label="Message list" className="h-full">
      <Virtuoso
        ref={virtuosoRef}
        data={messages}
        className="h-full"
        initialTopMostItemIndex={messages.length - 1}
        followOutput="smooth"
        startReached={handleStartReached}
        itemContent={(index, message) => (
          <MessageBubble
            key={message.id}
            message={message}
            isStreaming={isTyping && message.id === streamingMessageId}
            onEditSave={onEditSave}
            onRegenerate={onRegenerate}
            onDelete={onDelete}
            onBranch={onBranch}
            hasBranch={branchedMessageIds?.has(message.id)}
          />
        )}
        components={{
          Header: LoadingHeader,
          Footer: () =>
            isTyping && !streamingMessageId ? (
              <div className="flex justify-start mb-4">
                <StreamingIndicator message="AI is thinking..." />
              </div>
            ) : null,
        }}
      />
    </div>
  );
}
