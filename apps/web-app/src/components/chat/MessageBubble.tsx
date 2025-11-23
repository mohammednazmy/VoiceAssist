/**
 * MessageBubble Component
 * Renders a chat message with markdown support, code blocks, and citations
 */

import { memo, useState } from "react";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import remarkMath from "remark-math";
import rehypeKatex from "rehype-katex";
import { Prism as SyntaxHighlighter } from "react-syntax-highlighter";
import { vscDarkPlus } from "react-syntax-highlighter/dist/esm/styles/prism";
import type { Message } from "@voiceassist/types";
import { CitationDisplay } from "./CitationDisplay";
import { MessageActionMenu } from "./MessageActionMenu";
import "katex/dist/katex.min.css";

export interface MessageBubbleProps {
  message: Message;
  isStreaming?: boolean;
  onEditSave?: (messageId: string, newContent: string) => Promise<void>;
  onRegenerate?: (messageId: string) => Promise<void>;
  onDelete?: (messageId: string) => Promise<void>;
}

// Memoize to prevent unnecessary re-renders when other messages update
export const MessageBubble = memo(function MessageBubble({
  message,
  isStreaming,
  onEditSave,
  onRegenerate,
  onDelete,
}: MessageBubbleProps) {
  const isUser = message.role === "user";
  const isSystem = message.role === "system";

  // Editing state
  const [isEditing, setIsEditing] = useState(false);
  const [editedContent, setEditedContent] = useState(message.content);
  const [isSaving, setIsSaving] = useState(false);

  // Save handler
  const handleSave = async () => {
    if (editedContent === message.content) {
      setIsEditing(false);
      return;
    }

    setIsSaving(true);
    try {
      await onEditSave?.(message.id, editedContent);
      setIsEditing(false);
    } catch (error) {
      console.error("Failed to save edit:", error);
      // TODO: Show error toast notification
    } finally {
      setIsSaving(false);
    }
  };

  // Cancel handler
  const handleCancel = () => {
    setEditedContent(message.content);
    setIsEditing(false);
  };

  // Copy handler
  const handleCopy = () => {
    navigator.clipboard.writeText(message.content);
  };

  return (
    <div
      className={`flex ${isUser ? "justify-end" : "justify-start"} mb-4 group`}
      data-message-id={message.id}
      role="article"
      aria-label={`${message.role === "user" ? "Your" : message.role === "assistant" ? "Assistant" : "System"} message`}
    >
      <div
        className={`relative max-w-[80%] rounded-lg px-4 py-3 ${
          isUser
            ? "bg-primary-500 text-white"
            : isSystem
              ? "bg-neutral-100 text-neutral-700 border border-neutral-300"
              : "bg-white text-neutral-900 border border-neutral-200 shadow-sm"
        }`}
      >
        {/* Action Menu */}
        <div className="absolute top-2 right-2">
          <MessageActionMenu
            messageId={message.id}
            role={message.role as "user" | "assistant" | "system"}
            onEdit={isUser ? () => setIsEditing(true) : undefined}
            onRegenerate={
              !isUser && !isSystem
                ? () => onRegenerate?.(message.id)
                : undefined
            }
            onDelete={() => onDelete?.(message.id)}
            onCopy={handleCopy}
          />
        </div>

        {/* Message Content - Editing Mode or Display Mode */}
        {isEditing ? (
          <div className="space-y-2">
            <textarea
              value={editedContent}
              onChange={(e) => setEditedContent(e.target.value)}
              className="w-full min-h-[100px] p-2 border border-neutral-300 rounded bg-white text-neutral-900 focus:outline-none focus:ring-2 focus:ring-primary-500"
              autoFocus
              onKeyDown={(e) => {
                if (e.key === "Enter" && (e.ctrlKey || e.metaKey)) {
                  e.preventDefault();
                  handleSave();
                } else if (e.key === "Escape") {
                  e.preventDefault();
                  handleCancel();
                }
              }}
              aria-label="Edit message"
            />
            <div className="flex justify-end space-x-2">
              <button
                onClick={handleCancel}
                disabled={isSaving}
                className="px-3 py-1.5 text-sm border border-neutral-300 rounded hover:bg-neutral-50 disabled:opacity-50 disabled:cursor-not-allowed text-neutral-700"
              >
                Cancel
              </button>
              <button
                onClick={handleSave}
                disabled={isSaving}
                className="px-3 py-1.5 text-sm bg-primary-500 text-white rounded hover:bg-primary-600 disabled:opacity-50 disabled:cursor-not-allowed"
              >
                {isSaving ? "Saving..." : "Save"}
              </button>
            </div>
          </div>
        ) : (
          <div className="prose prose-sm max-w-none">
            <ReactMarkdown
              remarkPlugins={[remarkGfm, remarkMath]}
              rehypePlugins={[rehypeKatex]}
              components={{
                // Code blocks with syntax highlighting
                code({ inline, className, children, ...props }) {
                  const match = /language-(\w+)/.exec(className || "");
                  const language = match ? match[1] : "";

                  if (inline) {
                    return (
                      <code
                        className={`px-1.5 py-0.5 rounded text-sm font-mono ${
                          isUser
                            ? "bg-primary-600 text-white"
                            : "bg-neutral-100 text-neutral-800"
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
                        language={language || "text"}
                        style={vscDarkPlus}
                        customStyle={{
                          margin: 0,
                          borderRadius: "0.375rem",
                          fontSize: "0.875rem",
                        }}
                        {...props}
                      >
                        {String(children).replace(/\n$/, "")}
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
                          ? "text-primary-100 hover:text-white"
                          : "text-primary-600 hover:text-primary-700"
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
                          ? "border-primary-300 text-primary-100"
                          : "border-neutral-300 text-neutral-600"
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
                    <p
                      className={`mb-2 ${isUser ? "text-white" : "text-neutral-900"}`}
                      {...props}
                    >
                      {children}
                    </p>
                  );
                },

                // Lists
                ul({ children, ...props }) {
                  return (
                    <ul
                      className={`list-disc list-inside mb-2 ${
                        isUser ? "text-white" : "text-neutral-900"
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
                        isUser ? "text-white" : "text-neutral-900"
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

            {/* Streaming Indicator */}
            {isStreaming && (
              <div
                className="mt-2 flex items-center space-x-1"
                role="status"
                aria-live="polite"
                aria-label="Message is being generated"
              >
                <div className="w-2 h-2 bg-neutral-400 rounded-full animate-bounce" />
                <div
                  className="w-2 h-2 bg-neutral-400 rounded-full animate-bounce"
                  style={{ animationDelay: "0.1s" }}
                />
                <div
                  className="w-2 h-2 bg-neutral-400 rounded-full animate-bounce"
                  style={{ animationDelay: "0.2s" }}
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
                isUser ? "text-primary-100" : "text-neutral-500"
              }`}
            >
              {new Date(message.timestamp).toLocaleTimeString("en-US", {
                hour: "2-digit",
                minute: "2-digit",
              })}
            </div>
          </div>
        )}
      </div>
    </div>
  );
});
