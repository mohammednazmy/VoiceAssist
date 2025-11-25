/**
 * MessageInput Component
 * Markdown-aware message input with auto-expanding textarea and voice input
 */

import { useState, useRef, useEffect, KeyboardEvent } from "react";
import { VoiceInput } from "../voice/VoiceInput";
import { VoiceModePanel } from "../voice/VoiceModePanel";
import { ChatAttachmentUpload, type PendingFile } from "./ChatAttachmentUpload";
import { useVoiceSettingsStore } from "../../stores/voiceSettingsStore";
import type { VoiceMetrics } from "../../hooks/useRealtimeVoiceSession";

export interface MessageInputProps {
  onSend: (content: string, files?: File[]) => void;
  disabled?: boolean;
  placeholder?: string;
  enableAttachments?: boolean;
  enableVoiceInput?: boolean;
  enableRealtimeVoice?: boolean;
  /** Auto-open the realtime voice panel when component mounts (e.g., from Home Voice Mode card) */
  autoOpenRealtimeVoice?: boolean;
  conversationId?: string;
  /** Called when a voice user message should be added to chat (user spoke) */
  onVoiceUserMessage?: (content: string) => void;
  /** Called when a voice assistant message should be added to chat (AI responded) */
  onVoiceAssistantMessage?: (content: string) => void;
  /** Called when voice metrics are updated (for backend export) */
  onVoiceMetricsUpdate?: (metrics: VoiceMetrics) => void;
}

export function MessageInput({
  onSend,
  disabled = false,
  placeholder = "Type a message... (Shift+Enter for new line)",
  enableAttachments = false,
  enableVoiceInput = true,
  enableRealtimeVoice = false,
  autoOpenRealtimeVoice = false,
  conversationId,
  onVoiceUserMessage,
  onVoiceAssistantMessage,
  onVoiceMetricsUpdate,
}: MessageInputProps) {
  const [content, setContent] = useState("");
  const [showVoiceInput, setShowVoiceInput] = useState(false);
  const [showRealtimeVoice, setShowRealtimeVoice] = useState(false);
  const [showFileUpload, setShowFileUpload] = useState(false);
  const [pendingFiles, setPendingFiles] = useState<PendingFile[]>([]);
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  // Get autoStartOnOpen setting from store
  const autoStartOnOpenSetting = useVoiceSettingsStore(
    (state) => state.autoStartOnOpen,
  );

  // Auto-expand textarea based on content
  useEffect(() => {
    const textarea = textareaRef.current;
    if (textarea) {
      textarea.style.height = "auto";
      textarea.style.height = `${Math.min(textarea.scrollHeight, 200)}px`;
    }
  }, [content]);

  // Auto-open realtime voice panel when requested via prop or store setting
  useEffect(() => {
    const shouldAutoOpen =
      enableRealtimeVoice &&
      (autoOpenRealtimeVoice || autoStartOnOpenSetting) &&
      !showRealtimeVoice;
    if (shouldAutoOpen) {
      setShowRealtimeVoice(true);
    }
  }, [enableRealtimeVoice, autoOpenRealtimeVoice, autoStartOnOpenSetting]); // Intentionally omit showRealtimeVoice to only trigger once

  const handleSend = () => {
    if (content.trim() && !disabled) {
      // Pass the actual File objects to the parent
      const files = pendingFiles.map((pf) => pf.file);
      onSend(content.trim(), files.length > 0 ? files : undefined);
      setContent("");
      setPendingFiles([]);
      setShowFileUpload(false);

      // Reset textarea height
      if (textareaRef.current) {
        textareaRef.current.style.height = "auto";
      }
    }
  };

  const handleKeyDown = (e: KeyboardEvent<HTMLTextAreaElement>) => {
    // Enter to send, Shift+Enter for newline
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      handleSend();
    }
  };

  const handleVoiceTranscript = (text: string) => {
    setContent((prev) => (prev ? `${prev} ${text}` : text));
    setShowVoiceInput(false);
  };

  /**
   * Handle user message from voice mode (user finished speaking)
   * This adds the user's spoken words to the chat timeline
   */
  const handleVoiceUserMessage = (text: string) => {
    if (text.trim()) {
      // Call the parent's handler if provided, otherwise fall back to onSend
      if (onVoiceUserMessage) {
        onVoiceUserMessage(text.trim());
      } else {
        // Fallback: send as regular user message
        onSend(text.trim());
      }
    }
  };

  /**
   * Handle assistant message from voice mode (AI finished responding)
   * This adds the AI's response to the chat timeline
   */
  const handleVoiceAssistantMessage = (text: string) => {
    if (text.trim() && onVoiceAssistantMessage) {
      onVoiceAssistantMessage(text.trim());
    }
    // Note: If no onVoiceAssistantMessage handler is provided,
    // the AI message is still shown in the VoiceModePanel but not added to chat
  };

  return (
    <div className="border-t border-neutral-200 bg-white p-4">
      {/* Realtime Voice Mode Panel */}
      {showRealtimeVoice && enableRealtimeVoice && (
        <div className="mb-4">
          <VoiceModePanel
            conversationId={conversationId}
            onClose={() => setShowRealtimeVoice(false)}
            onUserMessage={handleVoiceUserMessage}
            onAssistantMessage={handleVoiceAssistantMessage}
            onMetricsUpdate={onVoiceMetricsUpdate}
          />
        </div>
      )}

      {/* Voice Input Modal */}
      {showVoiceInput && enableVoiceInput && (
        <div className="mb-4 p-4 bg-white rounded-lg border-2 border-primary-500 shadow-lg">
          <div className="flex items-center justify-between mb-3">
            <h3 className="text-sm font-semibold text-neutral-900">
              Voice Input
            </h3>
            <button
              type="button"
              onClick={() => setShowVoiceInput(false)}
              className="text-neutral-400 hover:text-neutral-600 focus:outline-none"
              aria-label="Close voice input"
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
          <VoiceInput
            onTranscript={handleVoiceTranscript}
            disabled={disabled}
          />
        </div>
      )}

      {/* File Upload Modal */}
      {showFileUpload && enableAttachments && (
        <div className="mb-4 p-4 bg-white rounded-lg border-2 border-primary-500 shadow-lg">
          <div className="flex items-center justify-between mb-3">
            <h3 className="text-sm font-semibold text-neutral-900">
              Attach Files
            </h3>
            <button
              type="button"
              onClick={() => setShowFileUpload(false)}
              className="text-neutral-400 hover:text-neutral-600 focus:outline-none"
              aria-label="Close file upload"
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
          <ChatAttachmentUpload
            onFilesSelected={setPendingFiles}
            selectedFiles={pendingFiles}
            disabled={disabled}
          />
        </div>
      )}

      {/* Input Row */}
      <div className="flex items-end space-x-2">
        {/* Realtime Voice Mode Button */}
        {enableRealtimeVoice && (
          <button
            type="button"
            onClick={() => setShowRealtimeVoice(!showRealtimeVoice)}
            disabled={disabled}
            className={`flex items-center justify-center w-10 h-10 rounded-md transition-colors ${
              showRealtimeVoice
                ? "bg-purple-500 text-white"
                : disabled
                  ? "bg-neutral-100 text-neutral-400 cursor-not-allowed"
                  : "bg-neutral-100 text-purple-600 hover:bg-purple-50"
            }`}
            aria-label="Realtime voice mode"
            title="Start voice conversation"
            data-testid="realtime-voice-mode-button"
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
                d="M19.114 5.636a9 9 0 010 12.728M16.463 8.288a5.25 5.25 0 010 7.424M6.75 8.25l4.72-4.72a.75.75 0 011.28.53v15.88a.75.75 0 01-1.28.53l-4.72-4.72H4.51c-.88 0-1.704-.507-1.938-1.354A9.01 9.01 0 012.25 12c0-.83.112-1.633.322-2.396C2.806 8.756 3.63 8.25 4.51 8.25H6.75z"
              />
            </svg>
          </button>
        )}

        {/* Voice Input Button */}
        {enableVoiceInput && (
          <button
            type="button"
            onClick={() => setShowVoiceInput(!showVoiceInput)}
            disabled={disabled}
            className={`flex items-center justify-center w-10 h-10 rounded-md transition-colors ${
              showVoiceInput
                ? "bg-primary-500 text-white"
                : disabled
                  ? "bg-neutral-100 text-neutral-400 cursor-not-allowed"
                  : "bg-neutral-100 text-neutral-600 hover:bg-neutral-200"
            }`}
            aria-label="Voice input"
            title="Voice to text"
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
                d="M12 18.75a6 6 0 006-6v-1.5m-6 7.5a6 6 0 01-6-6v-1.5m6 7.5v3.75m-3.75 0h7.5M12 15.75a3 3 0 01-3-3V4.5a3 3 0 116 0v8.25a3 3 0 01-3 3z"
              />
            </svg>
          </button>
        )}

        {/* Attachment Button */}
        {enableAttachments && (
          <button
            type="button"
            onClick={() => setShowFileUpload(!showFileUpload)}
            disabled={disabled}
            className={`flex items-center justify-center w-10 h-10 rounded-md transition-colors ${
              showFileUpload
                ? "bg-primary-500 text-white"
                : disabled
                  ? "bg-neutral-100 text-neutral-400 cursor-not-allowed"
                  : "bg-neutral-100 text-neutral-600 hover:bg-neutral-200"
            }`}
            aria-label="Attach files"
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
                d="M18.375 12.739l-7.693 7.693a4.5 4.5 0 01-6.364-6.364l10.94-10.94A3 3 0 1119.5 7.372L8.552 18.32m.009-.01l-.01.01m5.699-9.941l-7.81 7.81a1.5 1.5 0 002.112 2.13"
              />
            </svg>
            {pendingFiles.length > 0 && (
              <span className="absolute -top-1 -right-1 flex items-center justify-center w-5 h-5 text-xs font-bold text-white bg-primary-600 rounded-full">
                {pendingFiles.length}
              </span>
            )}
          </button>
        )}

        {/* Textarea */}
        <div className="flex-1 relative">
          <textarea
            ref={textareaRef}
            value={content}
            onChange={(e) => setContent(e.target.value)}
            onKeyDown={handleKeyDown}
            disabled={disabled}
            placeholder={placeholder}
            rows={1}
            className="w-full resize-none rounded-md border border-neutral-300 px-4 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary-500 focus:border-transparent disabled:bg-neutral-100 disabled:text-neutral-500"
            style={{ maxHeight: "200px" }}
            aria-label="Message input"
          />

          {/* Character indicator for long messages */}
          {content.length > 500 && (
            <div className="absolute bottom-2 right-2 text-xs text-neutral-400">
              {content.length}
            </div>
          )}
        </div>

        {/* Send Button */}
        <button
          type="button"
          onClick={handleSend}
          disabled={disabled || !content.trim()}
          className="flex items-center justify-center w-10 h-10 rounded-md bg-primary-500 text-white hover:bg-primary-600 disabled:bg-neutral-300 disabled:cursor-not-allowed transition-colors"
          aria-label="Send message"
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
              d="M6 12L3.269 3.126A59.768 59.768 0 0121.485 12 59.77 59.77 0 013.27 20.876L5.999 12zm0 0h7.5"
            />
          </svg>
        </button>
      </div>

      {/* Markdown Hint */}
      <div className="mt-2 text-xs text-neutral-500">
        Markdown supported: **bold**, *italic*, `code`, [link](url), and more
      </div>
    </div>
  );
}
