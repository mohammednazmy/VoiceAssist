/**
 * Session Timeout Warning Component
 *
 * Shows a warning modal when the user's session is about to expire due to:
 * - Inactivity timeout (60 minutes of no activity)
 * - Absolute timeout (24 hours since login)
 *
 * Allows the user to extend their session by clicking a button.
 */

import { useEffect, useState, useCallback, useRef } from "react";
import { getApiClient } from "../../lib/apiClient";
import { useAuth } from "../../contexts/AuthContext";

interface SessionInfo {
  absolute_timeout_hours: number;
  inactivity_timeout_minutes: number;
  absolute_remaining_seconds: number;
  inactivity_remaining_seconds: number;
  session_started_at: string;
  last_activity_at: string | null;
}

// Warning thresholds in seconds
const WARNING_THRESHOLD_SECONDS = 5 * 60; // Show warning 5 minutes before expiry
const POLL_INTERVAL_MS = 60 * 1000; // Poll every 60 seconds
const URGENT_POLL_INTERVAL_MS = 10 * 1000; // Poll every 10 seconds when warning is shown

export function SessionTimeoutWarning() {
  const { isAuthenticated, logout } = useAuth();
  const [sessionInfo, setSessionInfo] = useState<SessionInfo | null>(null);
  const [showWarning, setShowWarning] = useState(false);
  const [extending, setExtending] = useState(false);
  const [timeRemaining, setTimeRemaining] = useState<number | null>(null);
  const pollIntervalRef = useRef<number | null>(null);
  const countdownRef = useRef<number | null>(null);

  const apiClient = getApiClient();

  const fetchSessionInfo = useCallback(async () => {
    if (!isAuthenticated) return;

    try {
      const info = await apiClient.getSessionInfo();
      setSessionInfo(info);

      // Calculate the minimum remaining time
      const minRemaining = Math.min(
        info.absolute_remaining_seconds,
        info.inactivity_remaining_seconds,
      );

      setTimeRemaining(minRemaining);

      // Show warning if less than threshold
      if (minRemaining <= WARNING_THRESHOLD_SECONDS && minRemaining > 0) {
        setShowWarning(true);
      } else {
        setShowWarning(false);
      }

      // Session expired
      if (minRemaining <= 0) {
        logout();
      }
    } catch (error) {
      // Silently ignore errors - user may have been logged out
      console.warn("Failed to fetch session info:", error);
    }
  }, [isAuthenticated, apiClient, logout]);

  // Start polling when authenticated
  useEffect(() => {
    if (!isAuthenticated) {
      setShowWarning(false);
      setSessionInfo(null);
      return;
    }

    // Initial fetch
    fetchSessionInfo();

    // Set up polling interval
    const interval = showWarning ? URGENT_POLL_INTERVAL_MS : POLL_INTERVAL_MS;
    pollIntervalRef.current = window.setInterval(fetchSessionInfo, interval);

    return () => {
      if (pollIntervalRef.current) {
        window.clearInterval(pollIntervalRef.current);
      }
    };
  }, [isAuthenticated, fetchSessionInfo, showWarning]);

  // Countdown timer when warning is shown
  useEffect(() => {
    if (!showWarning || timeRemaining === null) {
      if (countdownRef.current) {
        window.clearInterval(countdownRef.current);
      }
      return;
    }

    countdownRef.current = window.setInterval(() => {
      setTimeRemaining((prev) => {
        if (prev === null || prev <= 0) {
          logout();
          return 0;
        }
        return prev - 1;
      });
    }, 1000);

    return () => {
      if (countdownRef.current) {
        window.clearInterval(countdownRef.current);
      }
    };
  }, [showWarning, logout]);

  const handleExtendSession = async () => {
    setExtending(true);
    try {
      // Calling getSessionInfo records activity on the backend
      await fetchSessionInfo();
      setShowWarning(false);
    } catch (error) {
      console.error("Failed to extend session:", error);
    } finally {
      setExtending(false);
    }
  };

  const formatTimeRemaining = (seconds: number): string => {
    if (seconds <= 0) return "0:00";
    const mins = Math.floor(seconds / 60);
    const secs = seconds % 60;
    return `${mins}:${secs.toString().padStart(2, "0")}`;
  };

  const getTimeoutType = (): string => {
    if (!sessionInfo) return "session";
    if (
      sessionInfo.inactivity_remaining_seconds <
      sessionInfo.absolute_remaining_seconds
    ) {
      return "inactivity";
    }
    return "session";
  };

  if (!showWarning || !isAuthenticated) {
    return null;
  }

  return (
    <>
      {/* Backdrop */}
      <div className="fixed inset-0 bg-black/50 z-50" aria-hidden="true" />

      {/* Modal */}
      <div
        className="fixed inset-0 z-50 flex items-center justify-center p-4"
        role="dialog"
        aria-modal="true"
        aria-labelledby="session-timeout-title"
      >
        <div className="bg-white dark:bg-gray-800 rounded-lg shadow-xl max-w-md w-full p-6">
          {/* Warning Icon */}
          <div className="flex justify-center mb-4">
            <div className="w-16 h-16 rounded-full bg-amber-100 dark:bg-amber-900/30 flex items-center justify-center">
              <svg
                className="w-8 h-8 text-amber-600 dark:text-amber-400"
                fill="none"
                viewBox="0 0 24 24"
                stroke="currentColor"
              >
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  strokeWidth={2}
                  d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z"
                />
              </svg>
            </div>
          </div>

          {/* Title */}
          <h2
            id="session-timeout-title"
            className="text-xl font-semibold text-gray-900 dark:text-white text-center mb-2"
          >
            Session Expiring Soon
          </h2>

          {/* Description */}
          <p className="text-gray-600 dark:text-gray-300 text-center mb-4">
            {getTimeoutType() === "inactivity"
              ? "Your session will expire due to inactivity."
              : "Your session will expire."}
          </p>

          {/* Countdown */}
          <div className="text-center mb-6">
            <div className="text-4xl font-mono font-bold text-amber-600 dark:text-amber-400">
              {formatTimeRemaining(timeRemaining ?? 0)}
            </div>
            <p className="text-sm text-gray-500 dark:text-gray-400 mt-1">
              remaining
            </p>
          </div>

          {/* Actions */}
          <div className="flex flex-col sm:flex-row gap-3">
            <button
              onClick={handleExtendSession}
              disabled={extending}
              className="flex-1 px-4 py-2 bg-blue-600 text-white rounded-md hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed font-medium transition-colors"
            >
              {extending ? "Extending..." : "Stay Logged In"}
            </button>
            <button
              onClick={logout}
              className="flex-1 px-4 py-2 bg-gray-200 dark:bg-gray-700 text-gray-700 dark:text-gray-300 rounded-md hover:bg-gray-300 dark:hover:bg-gray-600 font-medium transition-colors"
            >
              Log Out
            </button>
          </div>
        </div>
      </div>
    </>
  );
}
