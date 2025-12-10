/**
 * PasswordResetDialog Component
 *
 * Modal dialog for resetting a user's password.
 * Two methods available:
 * - Temporary password: Generate and display a temporary password
 * - Email link: Send a password reset email to the user
 */

import { useState, FormEvent } from "react";
import { fetchAPI } from "../../lib/api";

interface PasswordResetDialogProps {
  isOpen: boolean;
  onClose: () => void;
  user: {
    id: string;
    email: string;
    full_name?: string;
  } | null;
}

type ResetMethod = "temporary" | "email";

interface ResetResponse {
  success: boolean;
  method: ResetMethod;
  temporary_password?: string;
  email_sent?: boolean;
  message: string;
}

export function PasswordResetDialog({
  isOpen,
  onClose,
  user,
}: PasswordResetDialogProps) {
  // Step state
  const [step, setStep] = useState<"select" | "result">("select");

  // Form state
  const [method, setMethod] = useState<ResetMethod>("temporary");
  const [notifyUser, setNotifyUser] = useState(true);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Result state
  const [result, setResult] = useState<ResetResponse | null>(null);
  const [copied, setCopied] = useState(false);

  const handleClose = () => {
    if (!isLoading) {
      setStep("select");
      setMethod("temporary");
      setNotifyUser(true);
      setError(null);
      setResult(null);
      setCopied(false);
      onClose();
    }
  };

  const handleSubmit = async (e: FormEvent) => {
    e.preventDefault();
    if (!user) return;

    setIsLoading(true);
    setError(null);

    try {
      const response = await fetchAPI<ResetResponse>(
        `/api/admin/panel/users/${user.id}/reset-password`,
        {
          method: "POST",
          body: JSON.stringify({
            method,
            notify_user: notifyUser,
          }),
        },
      );

      setResult(response);
      setStep("result");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to reset password");
    } finally {
      setIsLoading(false);
    }
  };

  const handleCopyPassword = async () => {
    if (result?.temporary_password) {
      try {
        await navigator.clipboard.writeText(result.temporary_password);
        setCopied(true);
        setTimeout(() => setCopied(false), 2000);
      } catch {
        // Fallback for older browsers
        const textarea = document.createElement("textarea");
        textarea.value = result.temporary_password;
        document.body.appendChild(textarea);
        textarea.select();
        document.execCommand("copy");
        document.body.removeChild(textarea);
        setCopied(true);
        setTimeout(() => setCopied(false), 2000);
      }
    }
  };

  if (!isOpen || !user) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center">
      {/* Backdrop */}
      <div className="absolute inset-0 bg-black/60" onClick={handleClose} />

      {/* Dialog */}
      <div className="relative bg-slate-900 border border-slate-700 rounded-lg shadow-xl w-full max-w-md mx-4">
        {/* Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-slate-700">
          <h2 className="text-lg font-semibold text-slate-100">
            Reset Password
          </h2>
          <button
            onClick={handleClose}
            disabled={isLoading}
            className="text-slate-400 hover:text-slate-200 disabled:opacity-50"
          >
            ✕
          </button>
        </div>

        {/* Content */}
        <div className="p-6">
          {step === "select" ? (
            <form onSubmit={handleSubmit} className="space-y-5">
              {/* User info */}
              <div className="p-3 bg-slate-800/50 border border-slate-700 rounded-md">
                <div className="text-sm text-slate-400">
                  Resetting password for:
                </div>
                <div className="text-slate-100 font-medium">{user.email}</div>
                {user.full_name && (
                  <div className="text-sm text-slate-400">{user.full_name}</div>
                )}
              </div>

              {/* Method selection */}
              <div className="space-y-3">
                <label className="block text-sm font-medium text-slate-300">
                  Reset Method
                </label>

                {/* Temporary password option */}
                <label
                  className={`flex items-start gap-3 p-3 rounded-lg border cursor-pointer transition-colors ${
                    method === "temporary"
                      ? "border-indigo-500 bg-indigo-500/10"
                      : "border-slate-700 hover:border-slate-600 bg-slate-800/50"
                  }`}
                >
                  <input
                    type="radio"
                    name="method"
                    value="temporary"
                    checked={method === "temporary"}
                    onChange={() => setMethod("temporary")}
                    disabled={isLoading}
                    className="mt-1 h-4 w-4 text-indigo-500 border-slate-600 bg-slate-800"
                  />
                  <div className="flex-1">
                    <div
                      className={`font-medium ${
                        method === "temporary"
                          ? "text-indigo-400"
                          : "text-slate-200"
                      }`}
                    >
                      Temporary Password
                    </div>
                    <div className="text-sm text-slate-400">
                      Generate a temporary password to share with the user. They
                      must change it on next login.
                    </div>
                  </div>
                </label>

                {/* Email link option */}
                <label
                  className={`flex items-start gap-3 p-3 rounded-lg border cursor-pointer transition-colors ${
                    method === "email"
                      ? "border-indigo-500 bg-indigo-500/10"
                      : "border-slate-700 hover:border-slate-600 bg-slate-800/50"
                  }`}
                >
                  <input
                    type="radio"
                    name="method"
                    value="email"
                    checked={method === "email"}
                    onChange={() => setMethod("email")}
                    disabled={isLoading}
                    className="mt-1 h-4 w-4 text-indigo-500 border-slate-600 bg-slate-800"
                  />
                  <div className="flex-1">
                    <div
                      className={`font-medium ${
                        method === "email"
                          ? "text-indigo-400"
                          : "text-slate-200"
                      }`}
                    >
                      Email Reset Link
                    </div>
                    <div className="text-sm text-slate-400">
                      Send a secure reset link to the user's email. Link expires
                      in 24 hours.
                    </div>
                  </div>
                </label>
              </div>

              {/* Notify user option (only for temporary password) */}
              {method === "temporary" && (
                <label className="flex items-center gap-3 cursor-pointer">
                  <input
                    type="checkbox"
                    checked={notifyUser}
                    onChange={(e) => setNotifyUser(e.target.checked)}
                    disabled={isLoading}
                    className="h-4 w-4 text-indigo-500 border-slate-600 bg-slate-800 rounded"
                  />
                  <span className="text-sm text-slate-300">
                    Email temporary password to user
                  </span>
                </label>
              )}

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
                  disabled={isLoading}
                  className="px-4 py-2 bg-indigo-600 hover:bg-indigo-700 text-white text-sm font-medium rounded-md transition-colors disabled:opacity-50 flex items-center gap-2"
                >
                  {isLoading && (
                    <span className="inline-block w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                  )}
                  {isLoading ? "Processing..." : "Reset Password"}
                </button>
              </div>
            </form>
          ) : (
            /* Result step */
            <div className="space-y-5">
              {result?.method === "temporary" ? (
                <>
                  <div className="text-center">
                    <div className="inline-flex items-center justify-center w-12 h-12 rounded-full bg-green-900/50 text-green-400 mb-3">
                      ✓
                    </div>
                    <h3 className="text-lg font-medium text-slate-100">
                      Temporary Password Generated
                    </h3>
                    <p className="text-sm text-slate-400 mt-1">
                      Share this password with the user. They must change it on
                      next login.
                    </p>
                  </div>

                  {/* Password display */}
                  <div className="relative">
                    <div className="p-4 bg-slate-800 border border-slate-700 rounded-lg font-mono text-lg text-center text-slate-100 tracking-wider">
                      {result.temporary_password}
                    </div>
                    <button
                      onClick={handleCopyPassword}
                      className="absolute right-3 top-1/2 -translate-y-1/2 px-3 py-1.5 bg-slate-700 hover:bg-slate-600 text-slate-200 text-xs rounded transition-colors"
                    >
                      {copied ? "Copied!" : "Copy"}
                    </button>
                  </div>

                  {result.email_sent && (
                    <div className="p-3 bg-blue-950/50 border border-blue-900 rounded-md text-blue-400 text-sm">
                      A copy of this password has been emailed to {user.email}
                    </div>
                  )}

                  <div className="p-3 bg-amber-950/40 border border-amber-900 rounded-md text-amber-300 text-sm">
                    <strong>Important:</strong> This password will only be shown
                    once. Make sure to copy it before closing this dialog.
                  </div>
                </>
              ) : (
                <>
                  <div className="text-center">
                    {result?.email_sent ? (
                      <>
                        <div className="inline-flex items-center justify-center w-12 h-12 rounded-full bg-green-900/50 text-green-400 mb-3">
                          ✓
                        </div>
                        <h3 className="text-lg font-medium text-slate-100">
                          Reset Email Sent
                        </h3>
                        <p className="text-sm text-slate-400 mt-1">
                          A password reset link has been sent to {user.email}
                        </p>
                      </>
                    ) : (
                      <>
                        <div className="inline-flex items-center justify-center w-12 h-12 rounded-full bg-red-900/50 text-red-400 mb-3">
                          ✕
                        </div>
                        <h3 className="text-lg font-medium text-slate-100">
                          Failed to Send Email
                        </h3>
                        <p className="text-sm text-slate-400 mt-1">
                          The reset email could not be sent. Please try again or
                          use a temporary password instead.
                        </p>
                      </>
                    )}
                  </div>

                  {result?.email_sent && (
                    <div className="p-3 bg-slate-800/50 border border-slate-700 rounded-md text-slate-300 text-sm">
                      The link will expire in 24 hours. If the user doesn't
                      receive the email, check their spam folder or try again.
                    </div>
                  )}
                </>
              )}

              {/* Close button */}
              <div className="flex justify-center pt-2">
                <button
                  onClick={handleClose}
                  className="px-6 py-2 bg-slate-700 hover:bg-slate-600 text-slate-100 text-sm font-medium rounded-md transition-colors"
                >
                  Done
                </button>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

export default PasswordResetDialog;
