/**
 * MessageBubble Component
 * Renders a chat message with markdown support, code blocks, and citations
 */

import { memo, useState, useEffect, useCallback } from "react";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import remarkMath from "remark-math";
import rehypeKatex from "rehype-katex";
import { Highlight, themes } from "prism-react-renderer";
import type { Message, Attachment } from "@voiceassist/types";
import { CitationDisplay } from "./CitationDisplay";
import { MessageActionMenu } from "./MessageActionMenu";
import { DeleteConfirmationDialog } from "./DeleteConfirmationDialog";
import {
  RegenerationOptionsDialog,
  type RegenerationOptions,
} from "./RegenerationOptionsDialog";
import { AudioPlayer } from "../voice/AudioPlayer";
import { useAuth } from "../../hooks/useAuth";
import { useToastContext } from "../../contexts/ToastContext";
import { createAttachmentsApi } from "../../lib/api/attachmentsApi";
import { useAuthStore } from "../../stores/authStore";
import "katex/dist/katex.min.css";

export interface MessageBubbleProps {
  message: Message;
  isStreaming?: boolean;
  onEditSave?: (messageId: string, newContent: string) => Promise<void>;
  onRegenerate?: (
    messageId: string,
    options?: RegenerationOptions,
  ) => Promise<void>;
  onDelete?: (messageId: string) => Promise<void>;
  onBranch?: (messageId: string) => Promise<void>;
  /** Whether this message has branches created from it */
  hasBranch?: boolean;
  /** Source of the message (text input, voice input, or system) */
  source?: "text" | "voice" | "system";
  /** Whether audio controls should be shown in compact mode */
  compactAudio?: boolean;
  /** Callback when audio playback is requested */
  onPlayAudio?: (messageId: string) => void;
}

// Memoize to prevent unnecessary re-renders when other messages update
export const MessageBubble = memo(function MessageBubble({
  message,
  isStreaming,
  onEditSave,
  onRegenerate,
  onDelete,
  onBranch,
  hasBranch,
  source,
  compactAudio,
  onPlayAudio,
}: MessageBubbleProps) {
  const isUser = message.role === "user";
  const isSystem = message.role === "system";
  const { apiClient } = useAuth();
  const { tokens } = useAuthStore();
  const toast = useToastContext();

  // Editing state
  const [isEditing, setIsEditing] = useState(false);
  const [editedContent, setEditedContent] = useState(message.content);
  const [isSaving, setIsSaving] = useState(false);
  const [editError, setEditError] = useState<string | null>(null);

  // Audio state
  const [audioBlob, setAudioBlob] = useState<Blob | null>(null);
  const [isSynthesizing, setIsSynthesizing] = useState(false);
  const [synthesisError, setSynthesisError] = useState<string | null>(null);

  // Attachment state
  const [attachments, setAttachments] = useState<Attachment[]>([]);
  const [isLoadingAttachments, setIsLoadingAttachments] = useState(false);
  const [downloadingAttachments, setDownloadingAttachments] = useState<
    Set<string>
  >(new Set());

  // Delete confirmation state
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false);
  const [isDeleting, setIsDeleting] = useState(false);

  // Regeneration dialog state
  const [showRegenerationDialog, setShowRegenerationDialog] = useState(false);

  // Action loading states
  const [isRegenerating, setIsRegenerating] = useState(false);
  const [isBranching, setIsBranching] = useState(false);

  // Save handler
  const handleSave = async () => {
    if (editedContent === message.content) {
      setIsEditing(false);
      return;
    }

    setIsSaving(true);
    setEditError(null);
    try {
      await onEditSave?.(message.id, editedContent);
      setIsEditing(false);
    } catch (error) {
      console.error("Failed to save edit:", error);
      setEditError(
        error instanceof Error ? error.message : "Failed to save changes",
      );
    } finally {
      setIsSaving(false);
    }
  };

  // Cancel handler
  const handleCancel = () => {
    setEditedContent(message.content);
    setEditError(null);
    setIsEditing(false);
  };

  // Copy handler
  const handleCopy = useCallback(async () => {
    try {
      await navigator.clipboard.writeText(message.content);
      toast.success(
        "Copied to clipboard",
        "Message content copied successfully.",
      );
    } catch (err) {
      console.error("Failed to copy:", err);
      toast.error("Copy failed", "Unable to copy to clipboard.");
    }
  }, [message.content, toast]);

  // Delete handler - opens confirmation dialog
  const handleDeleteClick = useCallback(() => {
    setShowDeleteConfirm(true);
  }, []);

  // Confirm delete handler
  const handleDeleteConfirm = useCallback(async () => {
    setIsDeleting(true);
    try {
      await onDelete?.(message.id);
      setShowDeleteConfirm(false);
      toast.success("Message deleted", "The message has been removed.");
    } catch (error) {
      console.error("Failed to delete message:", error);
      toast.error(
        "Delete failed",
        error instanceof Error ? error.message : "Unable to delete message.",
      );
    } finally {
      setIsDeleting(false);
    }
  }, [message.id, onDelete, toast]);

  // Cancel delete handler
  const handleDeleteCancel = useCallback(() => {
    if (!isDeleting) {
      setShowDeleteConfirm(false);
    }
  }, [isDeleting]);

  // Regenerate click handler - opens the options dialog
  const handleRegenerateClick = useCallback(() => {
    setShowRegenerationDialog(true);
  }, []);

  // Regenerate confirm handler - called when user confirms options
  const handleRegenerateConfirm = useCallback(
    async (options: RegenerationOptions) => {
      setShowRegenerationDialog(false);
      setIsRegenerating(true);
      try {
        await onRegenerate?.(message.id, options);
      } catch (error) {
        console.error("Failed to regenerate message:", error);
        toast.error(
          "Regeneration failed",
          error instanceof Error
            ? error.message
            : "Unable to regenerate message.",
        );
      } finally {
        setIsRegenerating(false);
      }
    },
    [message.id, onRegenerate, toast],
  );

  // Regenerate cancel handler
  const handleRegenerateCancel = useCallback(() => {
    if (!isRegenerating) {
      setShowRegenerationDialog(false);
    }
  }, [isRegenerating]);

  // Branch handler
  const handleBranch = useCallback(async () => {
    setIsBranching(true);
    try {
      await onBranch?.(message.id);
      toast.success(
        "Branch created",
        "A new conversation branch has been created.",
      );
    } catch (error) {
      console.error("Failed to branch conversation:", error);
      toast.error(
        "Branch failed",
        error instanceof Error ? error.message : "Unable to create branch.",
      );
    } finally {
      setIsBranching(false);
    }
  }, [message.id, onBranch, toast]);

  // Audio synthesis handler
  const handlePlayAudio = async () => {
    if (audioBlob) {
      // If audio already exists, just play it (AudioPlayer will handle this)
      return;
    }

    setIsSynthesizing(true);
    setSynthesisError(null);
    try {
      const blob = await apiClient.synthesizeSpeech(message.content);
      setAudioBlob(blob);
    } catch (error) {
      console.error("Speech synthesis failed:", error);
      setSynthesisError("Failed to generate audio. Please try again.");
    } finally {
      setIsSynthesizing(false);
    }
  };

  // Fetch attachments when message has attachment IDs
  useEffect(() => {
    if (!message.attachments || message.attachments.length === 0) {
      return;
    }

    const fetchAttachments = async () => {
      setIsLoadingAttachments(true);
      try {
        const attachmentsApi = createAttachmentsApi(
          import.meta.env.VITE_API_URL || "http://localhost:8000",
          () => tokens?.accessToken || null,
        );
        const fetchedAttachments = await attachmentsApi.listMessageAttachments(
          message.id,
        );
        setAttachments(fetchedAttachments);
      } catch (error) {
        console.error("Failed to fetch attachments:", error);
      } finally {
        setIsLoadingAttachments(false);
      }
    };

    fetchAttachments();
  }, [message.id, message.attachments, tokens?.accessToken]);

  // Attachment download handler
  const handleDownloadAttachment = async (attachment: Attachment) => {
    setDownloadingAttachments((prev) => new Set(prev).add(attachment.id));
    try {
      const attachmentsApi = createAttachmentsApi(
        import.meta.env.VITE_API_URL || "http://localhost:8000",
        () => tokens?.accessToken || null,
      );
      const blob = await attachmentsApi.downloadAttachment(attachment.id);

      // Create download link
      const url = URL.createObjectURL(blob);
      const link = document.createElement("a");
      link.href = url;
      link.download = attachment.fileName;
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
      URL.revokeObjectURL(url);
    } catch (error) {
      console.error("Failed to download attachment:", error);
      // Could show a toast/notification here
    } finally {
      setDownloadingAttachments((prev) => {
        const next = new Set(prev);
        next.delete(attachment.id);
        return next;
      });
    }
  };

  // Get file icon based on file type
  const getFileIcon = (fileType: string) => {
    switch (fileType) {
      case "pdf":
        return (
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
              d="M19.5 14.25v-2.625a3.375 3.375 0 00-3.375-3.375h-1.5A1.125 1.125 0 0113.5 7.125v-1.5a3.375 3.375 0 00-3.375-3.375H8.25m2.25 0H5.625c-.621 0-1.125.504-1.125 1.125v17.25c0 .621.504 1.125 1.125 1.125h12.75c.621 0 1.125-.504 1.125-1.125V11.25a9 9 0 00-9-9z"
            />
          </svg>
        );
      case "image":
        return (
          <svg
            xmlns="http://www.w3.org/2000/svg"
            fill="none"
            viewBox="0 0 24 24"
            strokeWidth={1.5}
            stroke="currentColor"
            className="w-5 h-5 text-blue-600"
          >
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              d="M2.25 15.75l5.159-5.159a2.25 2.25 0 013.182 0l5.159 5.159m-1.5-1.5l1.409-1.409a2.25 2.25 0 013.182 0l2.909 2.909m-18 3.75h16.5a1.5 1.5 0 001.5-1.5V6a1.5 1.5 0 00-1.5-1.5H3.75A1.5 1.5 0 002.25 6v12a1.5 1.5 0 001.5 1.5zm10.5-11.25h.008v.008h-.008V8.25zm.375 0a.375.375 0 11-.75 0 .375.375 0 01.75 0z"
            />
          </svg>
        );
      case "document":
      case "text":
      case "markdown":
        return (
          <svg
            xmlns="http://www.w3.org/2000/svg"
            fill="none"
            viewBox="0 0 24 24"
            strokeWidth={1.5}
            stroke="currentColor"
            className="w-5 h-5 text-neutral-600"
          >
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              d="M19.5 14.25v-2.625a3.375 3.375 0 00-3.375-3.375h-1.5A1.125 1.125 0 0113.5 7.125v-1.5a3.375 3.375 0 00-3.375-3.375H8.25m0 12.75h7.5m-7.5 3H12M10.5 2.25H5.625c-.621 0-1.125.504-1.125 1.125v17.25c0 .621.504 1.125 1.125 1.125h12.75c.621 0 1.125-.504 1.125-1.125V11.25a9 9 0 00-9-9z"
            />
          </svg>
        );
      default:
        return (
          <svg
            xmlns="http://www.w3.org/2000/svg"
            fill="none"
            viewBox="0 0 24 24"
            strokeWidth={1.5}
            stroke="currentColor"
            className="w-5 h-5 text-neutral-600"
          >
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              d="M18.375 12.739l-7.693 7.693a4.5 4.5 0 01-6.364-6.364l10.94-10.94A3 3 0 1119.5 7.372L8.552 18.32m.009-.01l-.01.01m5.699-9.941l-7.81 7.81a1.5 1.5 0 002.112 2.13"
            />
          </svg>
        );
    }
  };

  // Format file size
  const formatFileSize = (bytes: number): string => {
    if (bytes === 0) return "0 Bytes";
    const k = 1024;
    const sizes = ["Bytes", "KB", "MB"];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return Math.round((bytes / Math.pow(k, i)) * 100) / 100 + " " + sizes[i];
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
              !isUser && !isSystem ? handleRegenerateClick : undefined
            }
            onDelete={onDelete ? handleDeleteClick : undefined}
            onCopy={handleCopy}
            onBranch={!isSystem && onBranch ? handleBranch : undefined}
            isDeleting={isDeleting}
            isRegenerating={isRegenerating}
            isBranching={isBranching}
          />
        </div>

        {/* Delete Confirmation Dialog */}
        <DeleteConfirmationDialog
          isOpen={showDeleteConfirm}
          messageContent={message.content}
          messageRole={message.role as "user" | "assistant"}
          onConfirm={handleDeleteConfirm}
          onCancel={handleDeleteCancel}
          isDeleting={isDeleting}
        />

        {/* Regeneration Options Dialog */}
        <RegenerationOptionsDialog
          isOpen={showRegenerationDialog}
          onClose={handleRegenerateCancel}
          onRegenerate={handleRegenerateConfirm}
          originalContent={message.content}
          isRegenerating={isRegenerating}
          hasClinicalContext={false}
        />

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
              aria-invalid={editError ? "true" : "false"}
              aria-describedby={editError ? "edit-error" : undefined}
            />
            {editError && (
              <div
                id="edit-error"
                role="alert"
                className="text-sm text-red-600 bg-red-50 px-3 py-2 rounded border border-red-200"
              >
                {editError}
              </div>
            )}
            <div className="flex justify-end space-x-2">
              <button
                onClick={handleCancel}
                disabled={isSaving}
                className="px-3 py-1.5 text-sm border border-neutral-300 rounded hover:bg-neutral-50 disabled:opacity-50 disabled:cursor-not-allowed text-neutral-700"
                aria-label="Cancel editing"
              >
                Cancel
              </button>
              <button
                onClick={handleSave}
                disabled={isSaving || editedContent.trim() === ""}
                className="px-3 py-1.5 text-sm bg-primary-500 text-white rounded hover:bg-primary-600 disabled:opacity-50 disabled:cursor-not-allowed flex items-center gap-2"
                aria-label={isSaving ? "Saving changes" : "Save changes"}
              >
                {isSaving && (
                  <svg
                    className="animate-spin h-4 w-4"
                    xmlns="http://www.w3.org/2000/svg"
                    fill="none"
                    viewBox="0 0 24 24"
                    aria-hidden="true"
                  >
                    <circle
                      className="opacity-25"
                      cx="12"
                      cy="12"
                      r="10"
                      stroke="currentColor"
                      strokeWidth="4"
                    ></circle>
                    <path
                      className="opacity-75"
                      fill="currentColor"
                      d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"
                    ></path>
                  </svg>
                )}
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
                // In react-markdown v10+, we detect code blocks by checking if className exists
                // (fenced code blocks have language-xxx class) or if content has newlines
                code({ className, children, ...props }) {
                  const match = /language-(\w+)/.exec(className || "");
                  const language = match ? match[1] : "";
                  const codeString = String(children).replace(/\n$/, "");

                  // Detect if this is a code block (fenced with ```) vs inline code
                  // Code blocks have a language class OR contain newlines OR are inside pre
                  const isCodeBlock =
                    match ||
                    codeString.includes("\n") ||
                    (props.node?.tagName === "code" &&
                      props.node?.position?.start?.line !==
                        props.node?.position?.end?.line);

                  if (!isCodeBlock) {
                    // Inline code
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

                  // Code block with syntax highlighting
                  return (
                    <div className="my-2 rounded-md overflow-hidden">
                      <Highlight
                        theme={themes.vsDark}
                        code={codeString}
                        language={(language || "text") as any}
                      >
                        {({
                          className: highlightClassName,
                          style,
                          tokens,
                          getLineProps,
                          getTokenProps,
                        }) => (
                          <pre
                            className={highlightClassName}
                            style={{
                              ...style,
                              margin: 0,
                              borderRadius: "0.375rem",
                              fontSize: "0.875rem",
                              padding: "1rem",
                            }}
                          >
                            <code>
                              {tokens.map((line, i) => (
                                <div key={i} {...getLineProps({ line })}>
                                  {line.map((token, key) => (
                                    <span
                                      key={key}
                                      {...getTokenProps({ token })}
                                    />
                                  ))}
                                </div>
                              ))}
                            </code>
                          </pre>
                        )}
                      </Highlight>
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

            {/* Attachments */}
            {message.attachments && message.attachments.length > 0 && (
              <div className="mt-3 pt-3 border-t border-neutral-200">
                <div className="text-xs font-semibold text-neutral-700 mb-2">
                  Attachments ({attachments.length})
                </div>
                {isLoadingAttachments && (
                  <div className="flex items-center space-x-2 text-sm text-neutral-600">
                    <div className="w-4 h-4 rounded-full border-2 border-primary-500 border-t-transparent animate-spin" />
                    <span>Loading attachments...</span>
                  </div>
                )}
                {!isLoadingAttachments && attachments.length > 0 && (
                  <div className="space-y-2">
                    {attachments.map((attachment) => (
                      <button
                        key={attachment.id}
                        type="button"
                        onClick={() => handleDownloadAttachment(attachment)}
                        disabled={downloadingAttachments.has(attachment.id)}
                        className="flex items-center space-x-3 w-full p-2 rounded bg-neutral-50 hover:bg-neutral-100 transition-colors disabled:opacity-50 disabled:cursor-not-allowed text-left border border-neutral-200"
                        aria-label={`Download ${attachment.fileName}`}
                      >
                        {/* File Icon */}
                        <div className="flex-shrink-0">
                          {getFileIcon(attachment.fileType)}
                        </div>

                        {/* File Info */}
                        <div className="flex-1 min-w-0">
                          <div className="text-sm font-medium text-neutral-900 truncate">
                            {attachment.fileName}
                          </div>
                          <div className="text-xs text-neutral-500">
                            {formatFileSize(attachment.fileSize)}
                          </div>
                        </div>

                        {/* Download Icon */}
                        <div className="flex-shrink-0">
                          {downloadingAttachments.has(attachment.id) ? (
                            <div className="w-5 h-5 rounded-full border-2 border-primary-500 border-t-transparent animate-spin" />
                          ) : (
                            <svg
                              xmlns="http://www.w3.org/2000/svg"
                              fill="none"
                              viewBox="0 0 24 24"
                              strokeWidth={1.5}
                              stroke="currentColor"
                              className="w-5 h-5 text-primary-600"
                            >
                              <path
                                strokeLinecap="round"
                                strokeLinejoin="round"
                                d="M3 16.5v2.25A2.25 2.25 0 005.25 21h13.5A2.25 2.25 0 0021 18.75V16.5M16.5 12L12 16.5m0 0L7.5 12m4.5 4.5V3"
                              />
                            </svg>
                          )}
                        </div>
                      </button>
                    ))}
                  </div>
                )}
                {!isLoadingAttachments &&
                  attachments.length === 0 &&
                  message.attachments.length > 0 && (
                    <div className="text-sm text-neutral-500">
                      Failed to load attachments
                    </div>
                  )}
              </div>
            )}

            {/* Audio Playback (Assistant messages only) */}
            {!isUser && !isSystem && !isStreaming && (
              <div className="mt-3 space-y-2">
                {/* Audio Player */}
                {audioBlob && (
                  <AudioPlayer
                    audioBlob={audioBlob}
                    autoPlay={false}
                    onPlaybackEnd={() => {
                      // Optional: track playback completion
                    }}
                  />
                )}

                {/* Play Audio Button */}
                {!audioBlob && !isSynthesizing && (
                  <button
                    type="button"
                    onClick={handlePlayAudio}
                    className="flex items-center space-x-2 text-sm text-primary-600 hover:text-primary-700 focus:outline-none focus:ring-2 focus:ring-primary-500 rounded px-2 py-1 hover:bg-primary-50 transition-colors"
                    aria-label="Play audio"
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
                        d="M19.114 5.636a9 9 0 010 12.728M16.463 8.288a5.25 5.25 0 010 7.424M6.75 8.25l4.72-4.72a.75.75 0 011.28.53v15.88a.75.75 0 01-1.28.53l-4.72-4.72H4.51c-.88 0-1.704-.507-1.938-1.354A9.01 9.01 0 012.25 12c0-.83.112-1.633.322-2.396C2.806 8.756 3.63 8.25 4.51 8.25H6.75z"
                      />
                    </svg>
                    <span>Play Audio</span>
                  </button>
                )}

                {/* Synthesizing Indicator */}
                {isSynthesizing && (
                  <div className="flex items-center space-x-2 text-sm text-neutral-600">
                    <div className="w-4 h-4 rounded-full border-2 border-primary-500 border-t-transparent animate-spin" />
                    <span>Generating audio...</span>
                  </div>
                )}

                {/* Synthesis Error */}
                {synthesisError && (
                  <div className="flex items-start space-x-2 text-sm text-red-600 bg-red-50 p-2 rounded border border-red-200">
                    <svg
                      xmlns="http://www.w3.org/2000/svg"
                      fill="none"
                      viewBox="0 0 24 24"
                      strokeWidth={1.5}
                      stroke="currentColor"
                      className="w-4 h-4 flex-shrink-0 mt-0.5"
                    >
                      <path
                        strokeLinecap="round"
                        strokeLinejoin="round"
                        d="M12 9v3.75m9-.75a9 9 0 11-18 0 9 9 0 0118 0zm-9 3.75h.008v.008H12v-.008z"
                      />
                    </svg>
                    <div className="flex-1">
                      <p>{synthesisError}</p>
                    </div>
                    <button
                      type="button"
                      onClick={() => setSynthesisError(null)}
                      className="text-red-600 hover:text-red-700 focus:outline-none"
                      aria-label="Dismiss error"
                    >
                      <svg
                        xmlns="http://www.w3.org/2000/svg"
                        fill="none"
                        viewBox="0 0 24 24"
                        strokeWidth={2}
                        stroke="currentColor"
                        className="w-4 h-4"
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
              </div>
            )}

            {/* Timestamp, Source Indicator, and Branch Indicator */}
            <div
              className={`flex items-center gap-2 text-xs mt-2 ${
                isUser ? "text-primary-100" : "text-neutral-500"
              }`}
            >
              {/* Voice Source Indicator */}
              {source === "voice" && (
                <span
                  className={`inline-flex items-center gap-0.5 ${
                    isUser ? "text-primary-100" : "text-neutral-500"
                  }`}
                  aria-label="Voice message"
                  title="Sent via voice"
                >
                  <svg
                    xmlns="http://www.w3.org/2000/svg"
                    fill="none"
                    viewBox="0 0 24 24"
                    strokeWidth={1.5}
                    stroke="currentColor"
                    className="w-3.5 h-3.5"
                    aria-hidden="true"
                  >
                    <path
                      strokeLinecap="round"
                      strokeLinejoin="round"
                      d="M12 18.75a6 6 0 006-6v-1.5m-6 7.5a6 6 0 01-6-6v-1.5m6 7.5v3.75m-3.75 0h7.5M12 15.75a3 3 0 01-3-3V4.5a3 3 0 116 0v8.25a3 3 0 01-3 3z"
                    />
                  </svg>
                </span>
              )}
              <span>
                {new Date(message.timestamp).toLocaleTimeString("en-US", {
                  hour: "2-digit",
                  minute: "2-digit",
                })}
              </span>
              {hasBranch && (
                <span
                  className={`inline-flex items-center gap-1 px-1.5 py-0.5 rounded text-xs font-medium ${
                    isUser
                      ? "bg-primary-400/30 text-primary-100"
                      : "bg-amber-100 text-amber-700"
                  }`}
                  aria-label="This message has branches"
                  data-testid="branch-indicator"
                >
                  <svg
                    xmlns="http://www.w3.org/2000/svg"
                    fill="none"
                    viewBox="0 0 24 24"
                    strokeWidth={1.5}
                    stroke="currentColor"
                    className="w-3 h-3"
                    aria-hidden="true"
                  >
                    <path
                      strokeLinecap="round"
                      strokeLinejoin="round"
                      d="M9 6.75V15m6-6v8.25m.503 3.498l4.875-2.437c.381-.19.622-.58.622-1.006V4.82c0-.836-.88-1.38-1.628-1.006l-3.869 1.934c-.317.159-.69.159-1.006 0L9.503 3.252a1.125 1.125 0 00-1.006 0L3.622 5.689C3.24 5.88 3 6.27 3 6.695V19.18c0 .836.88 1.38 1.628 1.006l3.869-1.934c.317-.159.69-.159 1.006 0l4.994 2.497c.317.158.69.158 1.006 0z"
                    />
                  </svg>
                  Branched
                </span>
              )}
            </div>
          </div>
        )}
      </div>
    </div>
  );
});
