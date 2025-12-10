/**
 * DeleteConfirmationDialog Component
 * Confirmation dialog for message deletion with preview and loading state
 *
 * Features:
 * - Dark mode styling consistent with app theme
 * - Message content preview (truncated)
 * - Loading state during deletion
 * - Keyboard support (Escape to cancel)
 */

import { useEffect, useCallback } from "react";

export interface DeleteConfirmationDialogProps {
  /** Whether the dialog is open */
  isOpen: boolean;
  /** The message content to preview (will be truncated) */
  messageContent: string;
  /** Whether the message is from user or assistant */
  messageRole: "user" | "assistant";
  /** Called when deletion is confirmed */
  onConfirm: () => void;
  /** Called when deletion is cancelled */
  onCancel: () => void;
  /** Whether deletion is in progress */
  isDeleting?: boolean;
}

const MAX_PREVIEW_LENGTH = 150;

function truncateMessage(content: string): string {
  if (content.length <= MAX_PREVIEW_LENGTH) {
    return content;
  }
  return content.slice(0, MAX_PREVIEW_LENGTH) + "...";
}

export function DeleteConfirmationDialog({
  isOpen,
  messageContent,
  messageRole,
  onConfirm,
  onCancel,
  isDeleting = false,
}: DeleteConfirmationDialogProps) {
  // Handle Escape key to cancel
  const handleKeyDown = useCallback(
    (event: KeyboardEvent) => {
      if (event.key === "Escape" && !isDeleting) {
        onCancel();
      }
    },
    [onCancel, isDeleting],
  );

  useEffect(() => {
    if (isOpen) {
      document.addEventListener("keydown", handleKeyDown);
      return () => document.removeEventListener("keydown", handleKeyDown);
    }
  }, [isOpen, handleKeyDown]);

  if (!isOpen) return null;

  const roleLabel =
    messageRole === "user" ? "Your message" : "Assistant message";

  return (
    <div
      className="fixed inset-0 bg-black/50 flex items-center justify-center z-50"
      onClick={(e) => {
        // Close on backdrop click if not deleting
        if (e.target === e.currentTarget && !isDeleting) {
          onCancel();
        }
      }}
      data-testid="delete-confirmation-dialog"
    >
      <div
        className="bg-slate-900 border border-slate-700 rounded-xl shadow-xl max-w-md w-full mx-4 p-5 space-y-4"
        role="alertdialog"
        aria-modal="true"
        aria-labelledby="delete-dialog-title"
        aria-describedby="delete-dialog-description"
      >
        {/* Header */}
        <div className="flex items-center gap-2">
          <div className="p-2 rounded-full bg-red-500/10">
            <svg
              xmlns="http://www.w3.org/2000/svg"
              fill="none"
              viewBox="0 0 24 24"
              strokeWidth={1.5}
              stroke="currentColor"
              className="w-5 h-5 text-red-500"
            >
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                d="M12 9v3.75m-9.303 3.376c-.866 1.5.217 3.374 1.948 3.374h14.71c1.73 0 2.813-1.874 1.948-3.374L13.949 3.378c-.866-1.5-3.032-1.5-3.898 0L2.697 16.126zM12 15.75h.007v.008H12v-.008z"
              />
            </svg>
          </div>
          <h2
            id="delete-dialog-title"
            className="text-base font-semibold text-slate-100"
          >
            Delete message?
          </h2>
        </div>

        {/* Description */}
        <p id="delete-dialog-description" className="text-sm text-slate-400">
          This action cannot be undone. The message will be permanently removed
          from this conversation.
        </p>

        {/* Message Preview */}
        <div className="bg-slate-950 border border-slate-800 rounded-lg p-3">
          <div className="text-xs text-slate-500 mb-1">{roleLabel}</div>
          <p className="text-sm text-slate-300 break-words">
            {truncateMessage(messageContent)}
          </p>
        </div>

        {/* Actions */}
        <div className="flex justify-end gap-3 pt-2">
          <button
            onClick={onCancel}
            disabled={isDeleting}
            className="px-4 py-2 text-sm rounded-lg border border-slate-700 text-slate-300 hover:bg-slate-800 hover:text-slate-100 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
            data-testid="delete-cancel-button"
          >
            Cancel
          </button>
          <button
            onClick={onConfirm}
            disabled={isDeleting}
            className="px-4 py-2 text-sm rounded-lg bg-red-600 hover:bg-red-500 text-white disabled:opacity-50 disabled:cursor-not-allowed transition-colors flex items-center gap-2"
            data-testid="delete-confirm-button"
          >
            {isDeleting && (
              <svg
                className="w-4 h-4 animate-spin"
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
            )}
            {isDeleting ? "Deleting..." : "Delete"}
          </button>
        </div>
      </div>
    </div>
  );
}
