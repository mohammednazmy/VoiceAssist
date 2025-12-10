/**
 * DeleteAllConfirmDialog Component
 * A confirmation dialog for deleting all conversations.
 *
 * Features:
 * - Requires typing "DELETE" to confirm (safety mechanism)
 * - Shows count of conversations to be deleted
 * - Loading state during deletion
 * - Keyboard support (Escape to cancel)
 *
 * Phase 11: VoiceAssist Voice Pipeline Sprint
 */

import { useState, useEffect, useCallback } from "react";

export interface DeleteAllConfirmDialogProps {
  /** Whether the dialog is open */
  isOpen: boolean;
  /** Number of conversations to be deleted */
  conversationCount: number;
  /** Called when deletion is confirmed */
  onConfirm: () => void;
  /** Called when deletion is cancelled */
  onCancel: () => void;
  /** Whether deletion is in progress */
  isDeleting?: boolean;
}

const CONFIRMATION_TEXT = "DELETE";

export function DeleteAllConfirmDialog({
  isOpen,
  conversationCount,
  onConfirm,
  onCancel,
  isDeleting = false,
}: DeleteAllConfirmDialogProps) {
  const [confirmText, setConfirmText] = useState("");
  const isConfirmEnabled = confirmText === CONFIRMATION_TEXT && !isDeleting;

  // Reset text when dialog opens/closes
  useEffect(() => {
    if (!isOpen) {
      setConfirmText("");
    }
  }, [isOpen]);

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

  return (
    <div
      className="fixed inset-0 bg-black/50 flex items-center justify-center z-50"
      onClick={(e) => {
        // Close on backdrop click if not deleting
        if (e.target === e.currentTarget && !isDeleting) {
          onCancel();
        }
      }}
      data-testid="delete-all-confirm-dialog"
    >
      <div
        className="bg-white dark:bg-slate-900 border border-neutral-200 dark:border-slate-700 rounded-xl shadow-xl max-w-md w-full mx-4 p-5 space-y-4"
        role="alertdialog"
        aria-modal="true"
        aria-labelledby="delete-all-dialog-title"
        aria-describedby="delete-all-dialog-description"
      >
        {/* Header */}
        <div className="flex items-center gap-3">
          <div className="p-2 rounded-full bg-red-100 dark:bg-red-500/10">
            <svg
              xmlns="http://www.w3.org/2000/svg"
              fill="none"
              viewBox="0 0 24 24"
              strokeWidth={1.5}
              stroke="currentColor"
              className="w-6 h-6 text-red-600 dark:text-red-500"
            >
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                d="M12 9v3.75m-9.303 3.376c-.866 1.5.217 3.374 1.948 3.374h14.71c1.73 0 2.813-1.874 1.948-3.374L13.949 3.378c-.866-1.5-3.032-1.5-3.898 0L2.697 16.126zM12 15.75h.007v.008H12v-.008z"
              />
            </svg>
          </div>
          <h2
            id="delete-all-dialog-title"
            className="text-lg font-semibold text-neutral-900 dark:text-slate-100"
          >
            Delete All Conversations?
          </h2>
        </div>

        {/* Description */}
        <div id="delete-all-dialog-description" className="space-y-3">
          <p className="text-sm text-neutral-600 dark:text-slate-400">
            This action{" "}
            <strong className="text-red-600 dark:text-red-400">
              cannot be undone
            </strong>
            . You are about to permanently delete{" "}
            <strong className="text-neutral-900 dark:text-slate-200">
              {conversationCount} conversation
              {conversationCount !== 1 ? "s" : ""}
            </strong>{" "}
            and all associated messages.
          </p>

          <p className="text-sm text-neutral-600 dark:text-slate-400">
            To confirm, please type{" "}
            <code className="px-1.5 py-0.5 bg-neutral-100 dark:bg-slate-800 rounded font-mono text-red-600 dark:text-red-400">
              {CONFIRMATION_TEXT}
            </code>{" "}
            below:
          </p>
        </div>

        {/* Confirmation Input */}
        <input
          type="text"
          value={confirmText}
          onChange={(e) => setConfirmText(e.target.value.toUpperCase())}
          placeholder={`Type ${CONFIRMATION_TEXT} to confirm`}
          disabled={isDeleting}
          className="w-full px-3 py-2 border border-neutral-300 dark:border-slate-600 rounded-lg
                     bg-white dark:bg-slate-800 text-neutral-900 dark:text-slate-100
                     placeholder:text-neutral-400 dark:placeholder:text-slate-500
                     focus:outline-none focus:ring-2 focus:ring-red-500 focus:border-red-500
                     disabled:opacity-50 disabled:cursor-not-allowed
                     font-mono text-sm"
          data-testid="delete-all-confirm-input"
          autoFocus
        />

        {/* Actions */}
        <div className="flex justify-end gap-3 pt-2">
          <button
            type="button"
            onClick={onCancel}
            disabled={isDeleting}
            className="px-4 py-2 text-sm rounded-lg border border-neutral-300 dark:border-slate-700
                       text-neutral-700 dark:text-slate-300
                       hover:bg-neutral-50 dark:hover:bg-slate-800
                       hover:text-neutral-900 dark:hover:text-slate-100
                       disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
            data-testid="delete-all-cancel-button"
          >
            Cancel
          </button>
          <button
            type="button"
            onClick={onConfirm}
            disabled={!isConfirmEnabled}
            className="px-4 py-2 text-sm rounded-lg bg-red-600 hover:bg-red-500 text-white
                       disabled:opacity-50 disabled:cursor-not-allowed transition-colors
                       flex items-center gap-2"
            data-testid="delete-all-confirm-button"
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
            {isDeleting ? "Deleting..." : "Delete All"}
          </button>
        </div>
      </div>
    </div>
  );
}

export default DeleteAllConfirmDialog;
