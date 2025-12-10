/**
 * Shared Conversation Page
 * Public view for shared conversation links
 */

import { useState, useEffect } from "react";
import { useParams } from "react-router-dom";
import { Input, Button } from "@voiceassist/ui";
import { extractErrorMessage } from "@voiceassist/types";

interface SharedMessage {
  id: string;
  role: "user" | "assistant" | "system";
  content: string;
  created_at: string;
}

interface SharedSession {
  id: string;
  title: string;
  created_at: string;
  message_count: number;
}

interface ShareInfo {
  created_at: string;
  expires_at: string;
  access_count: number;
}

interface SharedConversationData {
  session: SharedSession;
  messages: SharedMessage[];
  share_info: ShareInfo;
}

type LoadingState =
  | "idle"
  | "loading"
  | "password-required"
  | "loaded"
  | "error"
  | "expired";

export function SharedConversationPage() {
  const { token } = useParams<{ token: string }>();
  const [loadingState, setLoadingState] = useState<LoadingState>("idle");
  const [error, setError] = useState<string | null>(null);
  const [data, setData] = useState<SharedConversationData | null>(null);
  const [password, setPassword] = useState("");
  const [isSubmitting, setIsSubmitting] = useState(false);

  const fetchSharedConversation = async (passwordAttempt?: string) => {
    if (!token) return;

    setLoadingState("loading");
    setError(null);

    try {
      const apiUrl = import.meta.env.VITE_API_URL || "";
      const url = new URL(`${apiUrl}/api/shared/${token}`);
      if (passwordAttempt) {
        url.searchParams.set("password", passwordAttempt);
      }

      const response = await fetch(url.toString());

      if (response.status === 401) {
        // Password required
        setLoadingState("password-required");
        if (passwordAttempt) {
          setError("Incorrect password. Please try again.");
        }
        return;
      }

      if (response.status === 410) {
        setLoadingState("expired");
        return;
      }

      if (response.status === 404) {
        setError("This shared link was not found or has been revoked.");
        setLoadingState("error");
        return;
      }

      if (!response.ok) {
        const errorData = await response.json().catch(() => ({}));
        throw new Error(
          errorData.detail || "Failed to load shared conversation",
        );
      }

      const conversationData = await response.json();
      setData(conversationData);
      setLoadingState("loaded");
    } catch (err: unknown) {
      setError(extractErrorMessage(err));
      setLoadingState("error");
    }
  };

  useEffect(() => {
    fetchSharedConversation();
  }, [token]);

  const handlePasswordSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!password.trim()) return;

    setIsSubmitting(true);
    await fetchSharedConversation(password);
    setIsSubmitting(false);
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

  // Loading state
  if (loadingState === "loading" || loadingState === "idle") {
    return (
      <div className="min-h-screen flex items-center justify-center bg-neutral-50">
        <div className="text-center">
          <div className="w-12 h-12 mx-auto mb-4 rounded-full border-4 border-primary-500 border-t-transparent animate-spin" />
          <p className="text-neutral-600">Loading shared conversation...</p>
        </div>
      </div>
    );
  }

  // Expired state
  if (loadingState === "expired") {
    return (
      <div className="min-h-screen flex items-center justify-center bg-neutral-50 p-4">
        <div className="bg-white rounded-lg shadow-lg p-8 max-w-md w-full text-center">
          <div className="w-16 h-16 mx-auto mb-4 rounded-full bg-amber-100 flex items-center justify-center">
            <svg
              xmlns="http://www.w3.org/2000/svg"
              fill="none"
              viewBox="0 0 24 24"
              strokeWidth={1.5}
              stroke="currentColor"
              className="w-8 h-8 text-amber-600"
            >
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                d="M12 6v6h4.5m4.5 0a9 9 0 11-18 0 9 9 0 0118 0z"
              />
            </svg>
          </div>
          <h1 className="text-xl font-semibold text-neutral-900 mb-2">
            Link Expired
          </h1>
          <p className="text-neutral-600">
            This shared link has expired and is no longer accessible.
          </p>
        </div>
      </div>
    );
  }

  // Error state
  if (loadingState === "error") {
    return (
      <div className="min-h-screen flex items-center justify-center bg-neutral-50 p-4">
        <div className="bg-white rounded-lg shadow-lg p-8 max-w-md w-full text-center">
          <div className="w-16 h-16 mx-auto mb-4 rounded-full bg-red-100 flex items-center justify-center">
            <svg
              xmlns="http://www.w3.org/2000/svg"
              fill="none"
              viewBox="0 0 24 24"
              strokeWidth={1.5}
              stroke="currentColor"
              className="w-8 h-8 text-red-600"
            >
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                d="M12 9v3.75m9-.75a9 9 0 11-18 0 9 9 0 0118 0zm-9 3.75h.008v.008H12v-.008z"
              />
            </svg>
          </div>
          <h1 className="text-xl font-semibold text-neutral-900 mb-2">
            Unable to Load
          </h1>
          <p className="text-neutral-600">{error}</p>
        </div>
      </div>
    );
  }

  // Password required state
  if (loadingState === "password-required") {
    return (
      <div className="min-h-screen flex items-center justify-center bg-neutral-50 p-4">
        <div className="bg-white rounded-lg shadow-lg p-8 max-w-md w-full">
          <div className="text-center mb-6">
            <div className="w-16 h-16 mx-auto mb-4 rounded-full bg-primary-100 flex items-center justify-center">
              <svg
                xmlns="http://www.w3.org/2000/svg"
                fill="none"
                viewBox="0 0 24 24"
                strokeWidth={1.5}
                stroke="currentColor"
                className="w-8 h-8 text-primary-600"
              >
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  d="M16.5 10.5V6.75a4.5 4.5 0 10-9 0v3.75m-.75 11.25h10.5a2.25 2.25 0 002.25-2.25v-6.75a2.25 2.25 0 00-2.25-2.25H6.75a2.25 2.25 0 00-2.25 2.25v6.75a2.25 2.25 0 002.25 2.25z"
                />
              </svg>
            </div>
            <h1 className="text-xl font-semibold text-neutral-900 mb-2">
              Password Protected
            </h1>
            <p className="text-neutral-600">
              This conversation is password protected. Please enter the password
              to continue.
            </p>
          </div>

          <form onSubmit={handlePasswordSubmit} className="space-y-4">
            {error && (
              <div className="p-3 bg-red-50 border border-red-200 rounded-md">
                <p className="text-sm text-red-800">{error}</p>
              </div>
            )}

            <Input
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              placeholder="Enter password"
              className="w-full"
              autoFocus
            />

            <Button
              type="submit"
              disabled={isSubmitting || !password.trim()}
              className="w-full"
            >
              {isSubmitting ? (
                <>
                  <div className="w-4 h-4 mr-2 border-2 border-white border-t-transparent rounded-full animate-spin" />
                  Verifying...
                </>
              ) : (
                "Access Conversation"
              )}
            </Button>
          </form>
        </div>
      </div>
    );
  }

  // Loaded state - show conversation
  if (!data) return null;

  return (
    <div className="min-h-screen bg-neutral-50">
      {/* Header */}
      <header className="bg-white border-b border-neutral-200 sticky top-0 z-10">
        <div className="max-w-4xl mx-auto px-4 py-4">
          <div className="flex items-center justify-between">
            <div>
              <h1 className="text-xl font-semibold text-neutral-900">
                {data.session.title || "Shared Conversation"}
              </h1>
              <p className="text-sm text-neutral-500 mt-1">
                {data.session.message_count} messages &bull; Shared on{" "}
                {formatDate(data.share_info.created_at)}
              </p>
            </div>
            <div className="text-sm text-neutral-500">
              <span className="inline-flex items-center px-3 py-1 bg-neutral-100 rounded-full">
                <svg
                  xmlns="http://www.w3.org/2000/svg"
                  fill="none"
                  viewBox="0 0 24 24"
                  strokeWidth={1.5}
                  stroke="currentColor"
                  className="w-4 h-4 mr-1"
                >
                  <path
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    d="M2.036 12.322a1.012 1.012 0 010-.639C3.423 7.51 7.36 4.5 12 4.5c4.638 0 8.573 3.007 9.963 7.178.07.207.07.431 0 .639C20.577 16.49 16.64 19.5 12 19.5c-4.638 0-8.573-3.007-9.963-7.178z"
                  />
                  <path
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    d="M15 12a3 3 0 11-6 0 3 3 0 016 0z"
                  />
                </svg>
                {data.share_info.access_count} views
              </span>
            </div>
          </div>
        </div>
      </header>

      {/* Messages */}
      <main className="max-w-4xl mx-auto px-4 py-6">
        <div className="space-y-4">
          {data.messages.map((message) => (
            <div
              key={message.id}
              className={`flex ${message.role === "user" ? "justify-end" : "justify-start"}`}
            >
              <div
                className={`max-w-[80%] rounded-lg p-4 ${
                  message.role === "user"
                    ? "bg-primary-500 text-white"
                    : "bg-white border border-neutral-200 text-neutral-900"
                }`}
              >
                <div className="text-xs font-medium mb-1 opacity-70">
                  {message.role === "user" ? "You" : "Assistant"}
                </div>
                <div className="whitespace-pre-wrap">{message.content}</div>
                <div
                  className={`text-xs mt-2 ${
                    message.role === "user"
                      ? "text-white/70"
                      : "text-neutral-400"
                  }`}
                >
                  {formatDate(message.created_at)}
                </div>
              </div>
            </div>
          ))}
        </div>
      </main>

      {/* Footer */}
      <footer className="bg-white border-t border-neutral-200 py-6 mt-auto">
        <div className="max-w-4xl mx-auto px-4 text-center text-sm text-neutral-500">
          <p>This is a read-only view of a shared conversation.</p>
          <p className="mt-1">
            Link expires on {formatDate(data.share_info.expires_at)}
          </p>
        </div>
      </footer>
    </div>
  );
}
