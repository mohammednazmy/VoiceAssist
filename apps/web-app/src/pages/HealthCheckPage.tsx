import { useEffect, useState } from "react";
import { useAuth } from "../hooks/useAuth";
import { useChatSession } from "../hooks/useChatSession";
import type { ConnectionStatus } from "@voiceassist/types";

type CheckStatus = "pending" | "ok" | "error";

interface CheckResult {
  status: CheckStatus;
  message?: string;
}

export function HealthCheckPage() {
  const { user, isAuthenticated, apiClient } = useAuth();

  const [loginCheck, setLoginCheck] = useState<CheckResult>({
    status: "pending",
  });
  const [conversationCheck, setConversationCheck] = useState<CheckResult>({
    status: "pending",
  });
  const [wsCheck, setWsCheck] = useState<CheckResult>({
    status: "pending",
  });

  const [testConversationId, setTestConversationId] = useState<string | null>(
    null,
  );
  const [wsStatus, setWsStatus] = useState<ConnectionStatus>("disconnected");
  const [wsError, setWsError] = useState<string | null>(null);

  // Step 1: verify login / current user and basic API health
  useEffect(() => {
    let cancelled = false;

    const runChecks = async () => {
      if (!isAuthenticated) {
        setLoginCheck({
          status: "error",
          message: "Not authenticated. Please log in first.",
        });
        setConversationCheck({
          status: "pending",
          message: "Waiting for authentication before checking conversations.",
        });
        setWsCheck({
          status: "pending",
          message: "Waiting for authentication before checking WebSocket.",
        });
        return;
      }

      // 1a. /api/users/me
      try {
        const me = await apiClient.getCurrentUser();
        if (cancelled) return;
        setLoginCheck({
          status: "ok",
          message: `Authenticated as ${me.email}`,
        });
      } catch (err) {
        if (cancelled) return;
        const msg =
          err instanceof Error ? err.message : "Failed to load current user";
        setLoginCheck({
          status: "error",
          message: msg,
        });
        return;
      }

      // 1b. /api/conversations (list / create)
      try {
        const list = await apiClient.getConversations(1, 1);
        if (cancelled) return;

        if (list.items.length > 0) {
          setConversationCheck({
            status: "ok",
            message: `Loaded ${list.totalCount} conversation(s)`,
          });
          setTestConversationId(list.items[0].id);
        } else {
          const conv = await apiClient.createConversation(
            "Health Check Conversation",
          );
          if (cancelled) return;
          setConversationCheck({
            status: "ok",
            message: "Created health-check conversation",
          });
          setTestConversationId(conv.id);
        }
      } catch (err) {
        if (cancelled) return;
        const msg =
          err instanceof Error
            ? err.message
            : "Failed to list or create conversations";
        setConversationCheck({
          status: "error",
          message: msg,
        });
      }
    };

    runChecks();
    return () => {
      cancelled = true;
    };
  }, [isAuthenticated, apiClient]);

  // Step 2: WebSocket health using useChatSession
  useChatSession({
    conversationId: testConversationId || undefined,
    initialMessages: [],
    onConnectionChange: (status) => {
      setWsStatus(status);
      if (status === "connected") {
        setWsCheck({
          status: "ok",
          message: "Realtime chat WebSocket connected",
        });
      } else if (status === "reconnecting" && wsCheck.status !== "ok") {
        setWsCheck({
          status: "pending",
          message: "WebSocket reconnecting...",
        });
      }
    },
    onError: (code, message) => {
      const fullMessage = `${code}: ${message}`;
      setWsError(fullMessage);
      setWsCheck({
        status: "error",
        message: fullMessage,
      });
    },
  });

  const renderStatusBadge = (status: CheckStatus) => {
    const base = "inline-flex items-center px-2 py-0.5 rounded text-xs font-medium";
    if (status === "ok") {
      return (
        <span className={`${base} bg-emerald-100 text-emerald-800`}>OK</span>
      );
    }
    if (status === "error") {
      return (
        <span className={`${base} bg-red-100 text-red-800`}>Error</span>
      );
    }
    return (
      <span className={`${base} bg-amber-100 text-amber-800`}>Pending</span>
    );
  };

  const apiBaseHint =
    typeof window !== "undefined" ? window.location.origin : "unknown";

  return (
    <div className="max-w-2xl mx-auto px-4 py-6">
      <h1 className="text-2xl font-semibold mb-4">VoiceAssist Health Check</h1>
      <p className="text-sm text-neutral-600 mb-6">
        This page runs a few quick checks against the currently configured
        backend:
        <br />
        <span className="font-mono text-xs">
          API base (from browser origin): {apiBaseHint}
        </span>
      </p>

      <div className="space-y-4">
        {/* Login / user check */}
        <div className="border border-neutral-200 rounded-md p-3 bg-white">
          <div className="flex items-center justify-between mb-1">
            <h2 className="text-sm font-semibold">1. Authentication / User</h2>
            {renderStatusBadge(loginCheck.status)}
          </div>
          <p className="text-xs text-neutral-600">
            {loginCheck.message ||
              (isAuthenticated
                ? "Checking current user..."
                : "Not authenticated.")}
          </p>
          {user && (
            <p className="mt-1 text-xs text-neutral-500">
              Store user: {user.email}
            </p>
          )}
        </div>

        {/* Conversations check */}
        <div className="border border-neutral-200 rounded-md p-3 bg-white">
          <div className="flex items-center justify-between mb-1">
            <h2 className="text-sm font-semibold">2. Conversations API</h2>
            {renderStatusBadge(conversationCheck.status)}
          </div>
          <p className="text-xs text-neutral-600">
            {conversationCheck.message ||
              "Checking /api/conversations (list/create)..."}
          </p>
          {testConversationId && (
            <p className="mt-1 text-xs font-mono text-neutral-500">
              Test conversation ID: {testConversationId}
            </p>
          )}
        </div>

        {/* WebSocket check */}
        <div className="border border-neutral-200 rounded-md p-3 bg-white">
          <div className="flex items-center justify-between mb-1">
            <h2 className="text-sm font-semibold">3. Chat WebSocket</h2>
            {renderStatusBadge(wsCheck.status)}
          </div>
          <p className="text-xs text-neutral-600">
            {wsCheck.message ||
              (testConversationId
                ? "Connecting to realtime chat WebSocket..."
                : "Waiting for a conversation ID before testing WebSocket.")}
          </p>
          <p className="mt-1 text-xs text-neutral-500">
            Connection status: <span className="font-mono">{wsStatus}</span>
          </p>
          {wsError && (
            <p className="mt-1 text-xs text-red-600">
              Last WebSocket error: {wsError}
            </p>
          )}
        </div>
      </div>
    </div>
  );
}

