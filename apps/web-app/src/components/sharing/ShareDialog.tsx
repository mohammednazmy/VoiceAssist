/**
 * ShareDialog Component
 * Dialog for creating and managing conversation share links
 */

import { useState, useEffect } from "react";
import { Button, Input } from "@voiceassist/ui";
import { useAuth } from "../../hooks/useAuth";
import type { ShareLink } from "@voiceassist/types";

interface ShareDialogProps {
  isOpen: boolean;
  onClose: () => void;
  conversationId: string;
  conversationTitle: string;
}

export function ShareDialog({
  isOpen,
  onClose,
  conversationId,
  conversationTitle,
}: ShareDialogProps) {
  const { apiClient } = useAuth();
  const [activeLinks, setActiveLinks] = useState<ShareLink[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [isCreating, setIsCreating] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Form state
  const [expiresInHours, setExpiresInHours] = useState(24);
  const [password, setPassword] = useState("");
  const [allowAnonymous, setAllowAnonymous] = useState(true);
  const [newShareUrl, setNewShareUrl] = useState<string | null>(null);

  useEffect(() => {
    if (isOpen) {
      loadShareLinks();
      setNewShareUrl(null);
      setPassword("");
    }
  }, [isOpen, conversationId]);

  const loadShareLinks = async () => {
    setIsLoading(true);
    setError(null);

    try {
      const links = await apiClient.listShareLinks(conversationId);
      setActiveLinks(links);
    } catch (err: any) {
      setError(err.message || "Failed to load share links");
    } finally {
      setIsLoading(false);
    }
  };

  const handleCreateLink = async () => {
    setIsCreating(true);
    setError(null);

    try {
      const response = await apiClient.createShareLink(conversationId, {
        expiresInHours,
        password: password.trim() || null,
        allowAnonymous,
      });

      // Build full URL
      const baseUrl = window.location.origin;
      const fullUrl = `${baseUrl}${response.shareUrl}`;
      setNewShareUrl(fullUrl);

      // Reload links
      await loadShareLinks();

      // Reset form
      setPassword("");
    } catch (err: any) {
      setError(err.message || "Failed to create share link");
    } finally {
      setIsCreating(false);
    }
  };

  const handleRevokeLink = async (shareToken: string) => {
    try {
      await apiClient.revokeShareLink(conversationId, shareToken);
      await loadShareLinks();
    } catch (err: any) {
      setError(err.message || "Failed to revoke share link");
    }
  };

  const handleCopyLink = (url: string) => {
    navigator.clipboard.writeText(url);
    // Could show a toast notification here
  };

  const formatDate = (dateString: string) => {
    const date = new Date(dateString);
    return date.toLocaleString("en-US", {
      month: "short",
      day: "numeric",
      year: "numeric",
      hour: "numeric",
      minute: "2-digit",
    });
  };

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50">
      <div
        className="bg-white rounded-lg shadow-xl w-full max-w-2xl mx-4 max-h-[90vh] overflow-hidden flex flex-col"
        role="dialog"
        aria-modal="true"
        aria-labelledby="share-dialog-title"
      >
        {/* Header */}
        <div className="flex items-center justify-between p-6 border-b border-neutral-200">
          <div>
            <h2
              id="share-dialog-title"
              className="text-lg font-semibold text-neutral-900"
            >
              Share Conversation
            </h2>
            <p className="text-sm text-neutral-600 mt-1">{conversationTitle}</p>
          </div>
          <button
            onClick={onClose}
            className="p-1 hover:bg-neutral-100 rounded transition-colors"
            aria-label="Close dialog"
          >
            <svg
              xmlns="http://www.w3.org/2000/svg"
              fill="none"
              viewBox="0 0 24 24"
              strokeWidth={2}
              stroke="currentColor"
              className="w-5 h-5 text-neutral-500"
            >
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                d="M6 18L18 6M6 6l12 12"
              />
            </svg>
          </button>
        </div>

        {/* Content - Scrollable */}
        <div className="flex-1 overflow-y-auto p-6 space-y-6">
          {/* New Share Link Created */}
          {newShareUrl && (
            <div className="p-4 bg-green-50 border border-green-200 rounded-md">
              <div className="flex items-start justify-between">
                <div className="flex-1">
                  <p className="text-sm font-medium text-green-900 mb-2">
                    Share link created!
                  </p>
                  <div className="flex items-center gap-2">
                    <code className="flex-1 px-3 py-2 bg-white border border-green-300 rounded text-sm text-green-900 truncate">
                      {newShareUrl}
                    </code>
                    <Button
                      size="sm"
                      onClick={() => handleCopyLink(newShareUrl)}
                      className="shrink-0"
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
                          d="M8.25 7.5V6.108c0-1.135.845-2.098 1.976-2.192.373-.03.748-.057 1.123-.08M15.75 18H18a2.25 2.25 0 002.25-2.25V6.108c0-1.135-.845-2.098-1.976-2.192a48.424 48.424 0 00-1.123-.08M15.75 18.75v-1.875a3.375 3.375 0 00-3.375-3.375h-1.5a1.125 1.125 0 01-1.125-1.125v-1.5A3.375 3.375 0 006.375 7.5H5.25m11.9-3.664A2.251 2.251 0 0015 2.25h-1.5a2.251 2.251 0 00-2.15 1.586m5.8 0c.065.21.1.433.1.664v.75h-6V4.5c0-.231.035-.454.1-.664M6.75 7.5H4.875c-.621 0-1.125.504-1.125 1.125v12c0 .621.504 1.125 1.125 1.125h9.75c.621 0 1.125-.504 1.125-1.125V16.5a9 9 0 00-9-9z"
                        />
                      </svg>
                    </Button>
                  </div>
                </div>
              </div>
            </div>
          )}

          {/* Create New Share Link */}
          <div className="space-y-4">
            <h3 className="text-sm font-semibold text-neutral-900">
              Create New Share Link
            </h3>

            {/* Expiration */}
            <div>
              <label
                htmlFor="expires-in"
                className="block text-sm font-medium text-neutral-700 mb-1"
              >
                Link Expiration
              </label>
              <select
                id="expires-in"
                value={expiresInHours}
                onChange={(e) => setExpiresInHours(Number(e.target.value))}
                className="w-full px-3 py-2 border border-neutral-300 rounded-md focus:outline-none focus:ring-2 focus:ring-primary-500"
              >
                <option value={1}>1 hour</option>
                <option value={24}>24 hours</option>
                <option value={168}>7 days</option>
                <option value={720}>30 days</option>
              </select>
            </div>

            {/* Password Protection */}
            <div>
              <label
                htmlFor="password"
                className="block text-sm font-medium text-neutral-700 mb-1"
              >
                Password Protection (Optional)
              </label>
              <Input
                id="password"
                type="password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                placeholder="Leave blank for no password"
                className="w-full"
              />
            </div>

            {/* Allow Anonymous Access */}
            <div className="flex items-center">
              <input
                id="allow-anonymous"
                type="checkbox"
                checked={allowAnonymous}
                onChange={(e) => setAllowAnonymous(e.target.checked)}
                className="w-4 h-4 text-primary-600 border-neutral-300 rounded focus:ring-primary-500"
              />
              <label
                htmlFor="allow-anonymous"
                className="ml-2 text-sm text-neutral-700"
              >
                Allow anonymous access
              </label>
            </div>

            <Button
              onClick={handleCreateLink}
              disabled={isCreating}
              className="w-full"
            >
              {isCreating ? (
                <>
                  <div className="w-4 h-4 mr-2 border-2 border-white border-t-transparent rounded-full animate-spin" />
                  Creating Link...
                </>
              ) : (
                "Create Share Link"
              )}
            </Button>
          </div>

          {/* Active Share Links */}
          {activeLinks.length > 0 && (
            <div className="space-y-3">
              <h3 className="text-sm font-semibold text-neutral-900">
                Active Share Links
              </h3>
              <div className="space-y-2">
                {activeLinks.map((link) => (
                  <div
                    key={link.shareToken}
                    className="p-4 border border-neutral-200 rounded-md hover:bg-neutral-50 transition-colors"
                  >
                    <div className="flex items-start justify-between gap-4">
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2 mb-1">
                          <code className="text-xs text-neutral-600 truncate">
                            {window.location.origin}
                            {link.shareUrl}
                          </code>
                          <button
                            onClick={() =>
                              handleCopyLink(
                                `${window.location.origin}${link.shareUrl}`,
                              )
                            }
                            className="p-1 hover:bg-neutral-200 rounded transition-colors shrink-0"
                            title="Copy link"
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
                                d="M8.25 7.5V6.108c0-1.135.845-2.098 1.976-2.192.373-.03.748-.057 1.123-.08M15.75 18H18a2.25 2.25 0 002.25-2.25V6.108c0-1.135-.845-2.098-1.976-2.192a48.424 48.424 0 00-1.123-.08M15.75 18.75v-1.875a3.375 3.375 0 00-3.375-3.375h-1.5a1.125 1.125 0 01-1.125-1.125v-1.5A3.375 3.375 0 006.375 7.5H5.25m11.9-3.664A2.251 2.251 0 0015 2.25h-1.5a2.251 2.251 0 00-2.15 1.586m5.8 0c.065.21.1.433.1.664v.75h-6V4.5c0-.231.035-.454.1-.664M6.75 7.5H4.875c-.621 0-1.125.504-1.125 1.125v12c0 .621.504 1.125 1.125 1.125h9.75c.621 0 1.125-.504 1.125-1.125V16.5a9 9 0 00-9-9z"
                              />
                            </svg>
                          </button>
                        </div>
                        <div className="flex items-center gap-3 text-xs text-neutral-600">
                          <span>Expires: {formatDate(link.expiresAt)}</span>
                          <span>•</span>
                          <span>
                            {link.accessCount}{" "}
                            {link.accessCount === 1 ? "access" : "accesses"}
                          </span>
                          {link.passwordProtected && (
                            <>
                              <span>•</span>
                              <span className="text-primary-600">
                                🔒 Password protected
                              </span>
                            </>
                          )}
                        </div>
                      </div>
                      <button
                        onClick={() => handleRevokeLink(link.shareToken)}
                        className="p-2 text-red-600 hover:bg-red-50 rounded transition-colors"
                        title="Revoke link"
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
                            d="M14.74 9l-.346 9m-4.788 0L9.26 9m9.968-3.21c.342.052.682.107 1.022.166m-1.022-.165L18.16 19.673a2.25 2.25 0 01-2.244 2.077H8.084a2.25 2.25 0 01-2.244-2.077L4.772 5.79m14.456 0a48.108 48.108 0 00-3.478-.397m-12 .562c.34-.059.68-.114 1.022-.165m0 0a48.11 48.11 0 013.478-.397m7.5 0v-.916c0-1.18-.91-2.164-2.09-2.201a51.964 51.964 0 00-3.32 0c-1.18.037-2.09 1.022-2.09 2.201v.916m7.5 0a48.667 48.667 0 00-7.5 0"
                          />
                        </svg>
                      </button>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Error Message */}
          {error && (
            <div className="p-3 bg-red-50 border border-red-200 rounded-md">
              <p className="text-sm text-red-800">{error}</p>
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="flex justify-end p-6 border-t border-neutral-200">
          <Button onClick={onClose} variant="outline">
            Close
          </Button>
        </div>
      </div>
    </div>
  );
}
