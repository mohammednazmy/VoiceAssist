/**
 * MessageInput Component
 * Markdown-aware message input with auto-expanding textarea
 */

import { useState, useRef, useEffect, KeyboardEvent } from 'react';

export interface MessageInputProps {
  onSend: (content: string, attachments?: string[]) => void;
  disabled?: boolean;
  placeholder?: string;
  enableAttachments?: boolean;
}

export function MessageInput({
  onSend,
  disabled = false,
  placeholder = 'Type a message... (Shift+Enter for new line)',
  enableAttachments = false,
}: MessageInputProps) {
  const [content, setContent] = useState('');
  const [attachments, setAttachments] = useState<string[]>([]);
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  // Auto-expand textarea based on content
  useEffect(() => {
    const textarea = textareaRef.current;
    if (textarea) {
      textarea.style.height = 'auto';
      textarea.style.height = `${Math.min(textarea.scrollHeight, 200)}px`;
    }
  }, [content]);

  const handleSend = () => {
    if (content.trim() && !disabled) {
      onSend(content.trim(), attachments.length > 0 ? attachments : undefined);
      setContent('');
      setAttachments([]);

      // Reset textarea height
      if (textareaRef.current) {
        textareaRef.current.style.height = 'auto';
      }
    }
  };

  const handleKeyDown = (e: KeyboardEvent<HTMLTextAreaElement>) => {
    // Enter to send, Shift+Enter for newline
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      handleSend();
    }
  };

  const handleAttachmentUpload = async (files: FileList | null) => {
    if (!files || files.length === 0) return;

    // TODO: Implement actual file upload
    console.log('Files to upload:', files);

    // Placeholder: simulate upload
    const uploadedIds = Array.from(files).map((file) => `attachment-${Date.now()}-${file.name}`);
    setAttachments((prev) => [...prev, ...uploadedIds]);
  };

  const removeAttachment = (id: string) => {
    setAttachments((prev) => prev.filter((a) => a !== id));
  };

  return (
    <div className="border-t border-neutral-200 bg-white p-4">
      {/* Attachments Preview */}
      {attachments.length > 0 && (
        <div className="mb-3 flex flex-wrap gap-2">
          {attachments.map((id) => (
            <div
              key={id}
              className="flex items-center space-x-2 bg-neutral-100 rounded-md px-3 py-1.5"
            >
              <svg
                xmlns="http://www.w3.org/2000/svg"
                fill="none"
                viewBox="0 0 24 24"
                strokeWidth={1.5}
                stroke="currentColor"
                className="w-4 h-4 text-neutral-500"
              >
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  d="M18.375 12.739l-7.693 7.693a4.5 4.5 0 01-6.364-6.364l10.94-10.94A3 3 0 1119.5 7.372L8.552 18.32m.009-.01l-.01.01m5.699-9.941l-7.81 7.81a1.5 1.5 0 002.112 2.13"
                />
              </svg>
              <span className="text-sm text-neutral-700">{id}</span>
              <button
                type="button"
                onClick={() => removeAttachment(id)}
                className="text-neutral-400 hover:text-neutral-600"
                aria-label="Remove attachment"
              >
                <svg
                  xmlns="http://www.w3.org/2000/svg"
                  fill="none"
                  viewBox="0 0 24 24"
                  strokeWidth={2}
                  stroke="currentColor"
                  className="w-4 h-4"
                >
                  <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
                </svg>
              </button>
            </div>
          ))}
        </div>
      )}

      {/* Input Row */}
      <div className="flex items-end space-x-2">
        {/* Attachment Button */}
        {enableAttachments && (
          <label
            className={`flex items-center justify-center w-10 h-10 rounded-md transition-colors ${
              disabled
                ? 'bg-neutral-100 text-neutral-400 cursor-not-allowed'
                : 'bg-neutral-100 text-neutral-600 hover:bg-neutral-200 cursor-pointer'
            }`}
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
            <input
              type="file"
              multiple
              disabled={disabled}
              onChange={(e) => handleAttachmentUpload(e.target.files)}
              className="hidden"
              accept=".pdf,.png,.jpg,.jpeg,.mp3,.wav,.txt,.md"
            />
          </label>
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
            style={{ maxHeight: '200px' }}
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
