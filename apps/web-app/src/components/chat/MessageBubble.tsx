/**
 * MessageBubble Component
 * Renders a chat message with markdown support, code blocks, and citations
 */

import { memo } from 'react';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import remarkMath from 'remark-math';
import rehypeKatex from 'rehype-katex';
import { Prism as SyntaxHighlighter } from 'react-syntax-highlighter';
import { vscDarkPlus } from 'react-syntax-highlighter/dist/esm/styles/prism';
import type { Message } from '@voiceassist/types';
import { CitationDisplay } from './CitationDisplay';
import 'katex/dist/katex.min.css';

export interface MessageBubbleProps {
  message: Message;
  isStreaming?: boolean;
}

// Memoize to prevent unnecessary re-renders when other messages update
export const MessageBubble = memo(function MessageBubble({ message, isStreaming }: MessageBubbleProps) {
  const isUser = message.role === 'user';
  const isSystem = message.role === 'system';

  return (
    <div
      className={`flex ${isUser ? 'justify-end' : 'justify-start'} mb-4`}
      data-message-id={message.id}
      role="article"
      aria-label={`${message.role === 'user' ? 'Your' : message.role === 'assistant' ? 'Assistant' : 'System'} message`}
    >
      <div
        className={`max-w-[80%] rounded-lg px-4 py-3 ${
          isUser
            ? 'bg-primary-500 text-white'
            : isSystem
            ? 'bg-neutral-100 text-neutral-700 border border-neutral-300'
            : 'bg-white text-neutral-900 border border-neutral-200 shadow-sm'
        }`}
      >
        {/* Message Content */}
        <div className="prose prose-sm max-w-none">
          <ReactMarkdown
            remarkPlugins={[remarkGfm, remarkMath]}
            rehypePlugins={[rehypeKatex]}
            components={{
              // Code blocks with syntax highlighting
              code({ node, inline, className, children, ...props }) {
                const match = /language-(\w+)/.exec(className || '');
                const language = match ? match[1] : '';

                if (inline) {
                  return (
                    <code
                      className={`px-1.5 py-0.5 rounded text-sm font-mono ${
                        isUser
                          ? 'bg-primary-600 text-white'
                          : 'bg-neutral-100 text-neutral-800'
                      }`}
                      {...props}
                    >
                      {children}
                    </code>
                  );
                }

                return (
                  <div className="my-2 rounded-md overflow-hidden">
                    <SyntaxHighlighter
                      language={language || 'text'}
                      style={vscDarkPlus}
                      customStyle={{
                        margin: 0,
                        borderRadius: '0.375rem',
                        fontSize: '0.875rem',
                      }}
                      {...props}
                    >
                      {String(children).replace(/\n$/, '')}
                    </SyntaxHighlighter>
                  </div>
                );
              },

              // Links
              a({ children, href, ...props }) {
                return (
                  <a
                    href={href}
                    target="_blank"
                    rel="noopener noreferrer"
                    className={`underline ${
                      isUser
                        ? 'text-primary-100 hover:text-white'
                        : 'text-primary-600 hover:text-primary-700'
                    }`}
                    {...props}
                  >
                    {children}
                  </a>
                );
              },

              // Blockquotes
              blockquote({ children, ...props }) {
                return (
                  <blockquote
                    className={`border-l-4 pl-4 my-2 ${
                      isUser
                        ? 'border-primary-300 text-primary-100'
                        : 'border-neutral-300 text-neutral-600'
                    }`}
                    {...props}
                  >
                    {children}
                  </blockquote>
                );
              },

              // Tables
              table({ children, ...props }) {
                return (
                  <div className="overflow-x-auto my-2">
                    <table
                      className="min-w-full divide-y divide-neutral-200 border border-neutral-200 rounded"
                      {...props}
                    >
                      {children}
                    </table>
                  </div>
                );
              },

              // Paragraphs
              p({ children, ...props }) {
                return (
                  <p className={`mb-2 ${isUser ? 'text-white' : 'text-neutral-900'}`} {...props}>
                    {children}
                  </p>
                );
              },

              // Lists
              ul({ children, ...props }) {
                return (
                  <ul
                    className={`list-disc list-inside mb-2 ${
                      isUser ? 'text-white' : 'text-neutral-900'
                    }`}
                    {...props}
                  >
                    {children}
                  </ul>
                );
              },
              ol({ children, ...props }) {
                return (
                  <ol
                    className={`list-decimal list-inside mb-2 ${
                      isUser ? 'text-white' : 'text-neutral-900'
                    }`}
                    {...props}
                  >
                    {children}
                  </ol>
                );
              },
            }}
          >
            {message.content}
          </ReactMarkdown>
        </div>

        {/* Streaming Indicator */}
        {isStreaming && (
          <div className="mt-2 flex items-center space-x-1" role="status" aria-live="polite" aria-label="Message is being generated">
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
        )}

        {/* Citations */}
        {message.citations && message.citations.length > 0 && (
          <div className="mt-3 pt-3 border-t border-neutral-200">
            <CitationDisplay citations={message.citations} />
          </div>
        )}

        {/* Timestamp */}
        <div
          className={`text-xs mt-2 ${
            isUser ? 'text-primary-100' : 'text-neutral-500'
          }`}
        >
          {new Date(message.timestamp).toLocaleTimeString('en-US', {
            hour: '2-digit',
            minute: '2-digit',
          })}
        </div>
      </div>
    </div>
  );
});
