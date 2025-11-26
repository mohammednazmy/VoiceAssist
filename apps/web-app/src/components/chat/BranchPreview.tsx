/**
 * BranchPreview Component
 * Shows a confirmation preview before creating a branch from a message
 */

import type { Message } from "@voiceassist/types";

export interface BranchPreviewProps {
  messages: Message[];
  parentMessageId: string;
  isCreating: boolean;
  onConfirm: () => Promise<void> | void;
  onCancel: () => void;
}

export function BranchPreview({
  messages,
  parentMessageId,
  isCreating,
  onConfirm,
  onCancel,
}: BranchPreviewProps) {
  // Find the parent message
  const parentMessageIndex = messages.findIndex(
    (m) => m.id === parentMessageId,
  );
  const parentMessage =
    parentMessageIndex >= 0 ? messages[parentMessageIndex] : null;

  // Calculate how many messages will be in the branch
  const messagesInBranch = parentMessageIndex + 1;
  const messagesAfterBranch = messages.length - messagesInBranch;

  // Get a preview of the parent message content
  const contentPreview = parentMessage?.content
    ? parentMessage.content.length > 150
      ? `${parentMessage.content.substring(0, 150)}...`
      : parentMessage.content
    : "Unknown message";

  return (
    <div
      className="bg-amber-50 border border-amber-200 rounded-lg p-4 shadow-md"
      role="dialog"
      aria-labelledby="branch-preview-title"
      aria-describedby="branch-preview-description"
      data-testid="branch-preview"
    >
      {/* Header */}
      <div className="flex items-center gap-2 mb-3">
        <svg
          xmlns="http://www.w3.org/2000/svg"
          fill="none"
          viewBox="0 0 24 24"
          strokeWidth={1.5}
          stroke="currentColor"
          className="w-5 h-5 text-amber-600"
          aria-hidden="true"
        >
          <path
            strokeLinecap="round"
            strokeLinejoin="round"
            d="M9 6.75V15m6-6v8.25m.503 3.498l4.875-2.437c.381-.19.622-.58.622-1.006V4.82c0-.836-.88-1.38-1.628-1.006l-3.869 1.934c-.317.159-.69.159-1.006 0L9.503 3.252a1.125 1.125 0 00-1.006 0L3.622 5.689C3.24 5.88 3 6.27 3 6.695V19.18c0 .836.88 1.38 1.628 1.006l3.869-1.934c.317-.159.69-.159 1.006 0l4.994 2.497c.317.158.69.158 1.006 0z"
          />
        </svg>
        <h3
          id="branch-preview-title"
          className="text-sm font-semibold text-amber-900"
        >
          Create Branch from This Message?
        </h3>
      </div>

      {/* Description */}
      <div id="branch-preview-description" className="space-y-2 mb-4">
        <p className="text-sm text-amber-800">
          This will create an alternative conversation path starting from
          message {messagesInBranch} of {messages.length}.
        </p>

        {/* Parent message preview */}
        <div className="bg-white/50 border border-amber-200 rounded p-3">
          <div className="flex items-center gap-1 text-xs text-amber-600 mb-1">
            <span className="font-medium">
              {parentMessage?.role === "user" ? "You" : "Assistant"}:
            </span>
          </div>
          <p className="text-sm text-amber-900 italic">
            &quot;{contentPreview}&quot;
          </p>
        </div>

        {/* Info about what happens */}
        {messagesAfterBranch > 0 && (
          <p className="text-xs text-amber-700">
            The {messagesAfterBranch} message
            {messagesAfterBranch > 1 ? "s" : ""} after this point will remain in
            the main conversation.
          </p>
        )}
      </div>

      {/* Actions */}
      <div className="flex items-center justify-end gap-2">
        <button
          type="button"
          onClick={onCancel}
          disabled={isCreating}
          className="px-3 py-1.5 text-sm font-medium text-amber-700 bg-white border border-amber-300 rounded-md hover:bg-amber-50 focus:outline-none focus:ring-2 focus:ring-amber-500 focus:ring-offset-1 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
          data-testid="branch-preview-cancel"
        >
          Cancel
        </button>
        <button
          type="button"
          onClick={onConfirm}
          disabled={isCreating}
          className="px-3 py-1.5 text-sm font-medium text-white bg-amber-600 rounded-md hover:bg-amber-700 focus:outline-none focus:ring-2 focus:ring-amber-500 focus:ring-offset-1 disabled:opacity-50 disabled:cursor-not-allowed transition-colors flex items-center gap-2"
          data-testid="branch-preview-confirm"
        >
          {isCreating && (
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
              />
              <path
                className="opacity-75"
                fill="currentColor"
                d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"
              />
            </svg>
          )}
          {isCreating ? "Creating..." : "Create Branch"}
        </button>
      </div>
    </div>
  );
}
