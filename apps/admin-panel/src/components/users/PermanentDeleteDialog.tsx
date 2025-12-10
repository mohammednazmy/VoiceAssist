/**
 * PermanentDeleteDialog Component
 *
 * Modal dialog for permanently deleting a user and all their data.
 * This is an irreversible action that requires email confirmation.
 */

import { useState, FormEvent } from "react";
import { fetchAPI } from "../../lib/api";

interface PermanentDeleteDialogProps {
  isOpen: boolean;
  onClose: () => void;
  onSuccess: () => void;
  user: {
    id: string;
    email: string;
    full_name?: string;
  } | null;
}

interface DeleteResponse {
  message: string;
  user_id: string;
  deleted_data: {
    sessions: number;
    messages: number;
  };
}

export function PermanentDeleteDialog({
  isOpen,
  onClose,
  onSuccess,
  user,
}: PermanentDeleteDialogProps) {
  const [confirmEmail, setConfirmEmail] = useState("");
  const [reason, setReason] = useState("");
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [result, setResult] = useState<DeleteResponse | null>(null);

  const handleClose = () => {
    if (!isLoading) {
      setConfirmEmail("");
      setReason("");
      setError(null);
      setResult(null);
      onClose();
    }
  };

  const isEmailMatch =
    user && confirmEmail.toLowerCase() === user.email.toLowerCase();

  const handleSubmit = async (e: FormEvent) => {
    e.preventDefault();
    if (!user || !isEmailMatch) return;

    setIsLoading(true);
    setError(null);

    try {
      const response = await fetchAPI<DeleteResponse>(
        `/api/admin/panel/users/${user.id}/permanent`,
        {
          method: "DELETE",
          body: JSON.stringify({
            confirm_email: confirmEmail,
            reason: reason || undefined,
          }),
        },
      );

      setResult(response);
      setTimeout(() => {
        onSuccess();
        handleClose();
      }, 2000);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to delete user");
    } finally {
      setIsLoading(false);
    }
  };

  if (!isOpen || !user) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center">
      {/* Backdrop */}
      <div className="absolute inset-0 bg-black/60" onClick={handleClose} />

      {/* Dialog */}
      <div className="relative bg-slate-900 border border-red-900/50 rounded-lg shadow-xl w-full max-w-md mx-4">
        {/* Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-red-900/50 bg-red-950/30">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-full bg-red-900/50 flex items-center justify-center">
              <svg
                className="w-5 h-5 text-red-400"
                fill="none"
                viewBox="0 0 24 24"
                stroke="currentColor"
              >
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  strokeWidth={2}
                  d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z"
                />
              </svg>
            </div>
            <h2 className="text-lg font-semibold text-red-400">
              Permanently Delete User
            </h2>
          </div>
          <button
            onClick={handleClose}
            disabled={isLoading}
            className="text-slate-400 hover:text-slate-200 disabled:opacity-50"
          >
            <svg
              className="w-5 h-5"
              fill="none"
              viewBox="0 0 24 24"
              stroke="currentColor"
            >
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeWidth={2}
                d="M6 18L18 6M6 6l12 12"
              />
            </svg>
          </button>
        </div>

        {/* Content */}
        <div className="p-6">
          {result ? (
            /* Success state */
            <div className="text-center space-y-4">
              <div className="inline-flex items-center justify-center w-16 h-16 rounded-full bg-green-900/50 text-green-400">
                <svg
                  className="w-8 h-8"
                  fill="none"
                  viewBox="0 0 24 24"
                  stroke="currentColor"
                >
                  <path
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    strokeWidth={2}
                    d="M5 13l4 4L19 7"
                  />
                </svg>
              </div>
              <div>
                <h3 className="text-lg font-medium text-slate-100">
                  User Deleted
                </h3>
                <p className="text-sm text-slate-400 mt-1">
                  The user and all associated data have been permanently
                  removed.
                </p>
              </div>
              <div className="p-3 bg-slate-800/50 border border-slate-700 rounded-md text-sm text-slate-300">
                <div>Sessions deleted: {result.deleted_data.sessions}</div>
                <div>Messages deleted: {result.deleted_data.messages}</div>
              </div>
            </div>
          ) : (
            <form onSubmit={handleSubmit} className="space-y-5">
              {/* Warning */}
              <div className="p-4 bg-red-950/50 border border-red-900 rounded-md space-y-2">
                <div className="text-red-400 font-medium flex items-center gap-2">
                  <svg
                    className="w-5 h-5"
                    fill="none"
                    viewBox="0 0 24 24"
                    stroke="currentColor"
                  >
                    <path
                      strokeLinecap="round"
                      strokeLinejoin="round"
                      strokeWidth={2}
                      d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z"
                    />
                  </svg>
                  This action cannot be undone
                </div>
                <p className="text-sm text-red-300/80">
                  This will permanently delete the user account and all
                  associated data including:
                </p>
                <ul className="text-sm text-red-300/80 list-disc list-inside ml-2">
                  <li>All conversation sessions</li>
                  <li>All messages and history</li>
                  <li>User preferences and settings</li>
                </ul>
              </div>

              {/* User info */}
              <div className="p-3 bg-slate-800/50 border border-slate-700 rounded-md">
                <div className="text-sm text-slate-400">Deleting user:</div>
                <div className="text-slate-100 font-medium">{user.email}</div>
                {user.full_name && (
                  <div className="text-sm text-slate-400">{user.full_name}</div>
                )}
              </div>

              {/* Email confirmation */}
              <div>
                <label
                  htmlFor="confirmEmail"
                  className="block text-sm font-medium text-slate-300 mb-1"
                >
                  Type{" "}
                  <span className="text-red-400 font-mono">{user.email}</span>{" "}
                  to confirm
                </label>
                <input
                  id="confirmEmail"
                  type="email"
                  value={confirmEmail}
                  onChange={(e) => setConfirmEmail(e.target.value)}
                  disabled={isLoading}
                  placeholder="Enter email to confirm"
                  className={`w-full px-3 py-2 bg-slate-800 border rounded-md text-slate-100
                    focus:outline-none focus:ring-2 focus:ring-red-500 focus:border-transparent
                    disabled:opacity-50 disabled:cursor-not-allowed
                    ${isEmailMatch ? "border-green-500" : "border-slate-700"}`}
                  autoComplete="off"
                />
                {confirmEmail && !isEmailMatch && (
                  <p className="mt-1 text-xs text-amber-400">
                    Email does not match
                  </p>
                )}
              </div>

              {/* Reason (optional) */}
              <div>
                <label
                  htmlFor="reason"
                  className="block text-sm font-medium text-slate-300 mb-1"
                >
                  Reason for deletion{" "}
                  <span className="text-slate-500 font-normal">(optional)</span>
                </label>
                <textarea
                  id="reason"
                  value={reason}
                  onChange={(e) => setReason(e.target.value)}
                  disabled={isLoading}
                  rows={2}
                  className="w-full px-3 py-2 bg-slate-800 border border-slate-700 rounded-md text-slate-100
                    focus:outline-none focus:ring-2 focus:ring-red-500 focus:border-transparent
                    disabled:opacity-50 disabled:cursor-not-allowed resize-none"
                  placeholder="e.g., GDPR request, duplicate account..."
                />
              </div>

              {/* Error message */}
              {error && (
                <div className="p-3 bg-red-950/50 border border-red-900 rounded-md text-red-400 text-sm">
                  {error}
                </div>
              )}

              {/* Actions */}
              <div className="flex items-center justify-end gap-3 pt-2">
                <button
                  type="button"
                  onClick={handleClose}
                  disabled={isLoading}
                  className="px-4 py-2 text-sm text-slate-300 hover:text-slate-100 transition-colors disabled:opacity-50"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={!isEmailMatch || isLoading}
                  className="px-4 py-2 bg-red-600 hover:bg-red-700 text-white text-sm font-medium rounded-md
                    transition-colors disabled:opacity-50 disabled:cursor-not-allowed flex items-center gap-2"
                >
                  {isLoading && (
                    <span className="inline-block w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                  )}
                  {isLoading ? "Deleting..." : "Permanently Delete"}
                </button>
              </div>
            </form>
          )}
        </div>
      </div>
    </div>
  );
}

export default PermanentDeleteDialog;
