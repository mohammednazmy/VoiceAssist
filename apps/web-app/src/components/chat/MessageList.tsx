/**
 * MessageList Component
 * Virtualized list of messages using react-virtuoso
 *
 * TODO: Performance Improvements
 * - Add pagination for conversations with >1000 messages
 * - Implement lazy loading of older messages on scroll to top
 * - Add message caching/indexing for very large histories
 */

import { useEffect, useRef } from 'react';
import { Virtuoso, VirtuosoHandle } from 'react-virtuoso';
import type { Message } from '@voiceassist/types';
import { MessageBubble } from './MessageBubble';

export interface MessageListProps {
  messages: Message[];
  isTyping?: boolean;
  streamingMessageId?: string;
}

export function MessageList({ messages, isTyping, streamingMessageId }: MessageListProps) {
  const virtuosoRef = useRef<VirtuosoHandle>(null);

  // Auto-scroll to bottom when new messages arrive
  useEffect(() => {
    if (messages.length > 0) {
      virtuosoRef.current?.scrollToIndex({
        index: messages.length - 1,
        behavior: 'smooth',
        align: 'end',
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
            Ask me anything about medical information, treatment protocols, or healthcare guidance.
          </p>
        </div>
      </div>
    );
  }

  return (
    <div role="region" aria-label="Message list" className="h-full">
      <Virtuoso
        ref={virtuosoRef}
        data={messages}
        className="h-full"
        initialTopMostItemIndex={messages.length - 1}
        followOutput="smooth"
        itemContent={(index, message) => (
          <MessageBubble
            key={message.id}
            message={message}
            isStreaming={isTyping && message.id === streamingMessageId}
          />
        )}
        components={{
          Footer: () =>
            isTyping && !streamingMessageId ? (
              <div className="flex justify-start mb-4" role="status" aria-live="polite" aria-label="Assistant is typing">
                <div className="bg-white border border-neutral-200 shadow-sm rounded-lg px-4 py-3">
                  <div className="flex items-center space-x-1">
                    <div className="w-2 h-2 bg-neutral-400 rounded-full animate-bounce" />
                    <div
                      className="w-2 h-2 bg-neutral-400 rounded-full animate-bounce"
                      style={{ animationDelay: '0.1s' }}
                    />
                    <div
                      className="w-2 h-2 bg-neutral-400 rounded-full animate-bounce"
                      style={{ animationDelay: '0.2s' }}
                    />
                  </div>
                </div>
              </div>
            ) : null,
        }}
      />
    </div>
  );
}
