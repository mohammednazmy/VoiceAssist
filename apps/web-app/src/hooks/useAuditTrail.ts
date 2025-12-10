/**
 * Audit Trail Hook
 *
 * React hook for integrating audit trail logging into components.
 *
 * @example
 * ```typescript
 * const { log, logError, logPhiEvent, sessionId } = useAuditTrail();
 *
 * // Log a navigation event
 * log('navigation', { from: '/chat', to: '/settings' });
 *
 * // Log a PHI warning
 * logPhiEvent('phi_warning_shown', { phiTypes: ['ssn'], matchCount: 1 });
 * ```
 */

import { useCallback, useEffect, useRef, useState } from "react";
import { auditTrail, AuditAction, AuditEvent } from "../services/audit";

/**
 * Options for the audit trail hook
 */
export interface UseAuditTrailOptions {
  /** User ID for the session */
  userId?: string;
  /** Whether to auto-start the session */
  autoStart?: boolean;
  /** Callback when session starts */
  onSessionStart?: (sessionId: string) => void;
  /** Callback when session ends */
  onSessionEnd?: () => void;
}

/**
 * Return type for the audit trail hook
 */
export interface UseAuditTrailReturn {
  /** Current session ID */
  sessionId: string;
  /** Whether the session is active */
  isActive: boolean;
  /** Log an audit event */
  log: (
    action: AuditAction,
    details?: Record<string, unknown>,
  ) => Promise<void>;
  /** Log a PHI event */
  logPhiEvent: (
    action:
      | "phi_warning_shown"
      | "phi_warning_acknowledged"
      | "phi_warning_dismissed"
      | "phi_sanitized",
    details: {
      phiTypes?: string[];
      matchCount?: number;
      userChoice?: string;
    },
  ) => Promise<void>;
  /** Log a security event */
  logSecurityEvent: (
    eventType: string,
    severity: "low" | "medium" | "high" | "critical",
    details: Record<string, unknown>,
  ) => Promise<void>;
  /** Log an error */
  logError: (
    error: Error | string,
    context?: Record<string, unknown>,
  ) => Promise<void>;
  /** Start the session */
  startSession: () => Promise<string>;
  /** End the session */
  endSession: () => Promise<void>;
  /** Get session statistics */
  getStats: () => Promise<{
    sessionId: string;
    eventCount: number;
    unsyncedCount: number;
    startTime?: number;
  }>;
  /** Export session log */
  exportLog: () => Promise<AuditEvent[]>;
}

/**
 * Audit Trail Hook
 */
export function useAuditTrail(
  options: UseAuditTrailOptions = {},
): UseAuditTrailReturn {
  const { userId, autoStart = false, onSessionStart, onSessionEnd } = options;

  const [sessionId, setSessionId] = useState(auditTrail.currentSessionId);
  const [isActive, setIsActive] = useState(false);

  // Refs for callbacks
  const onSessionStartRef = useRef(onSessionStart);
  const onSessionEndRef = useRef(onSessionEnd);

  useEffect(() => {
    onSessionStartRef.current = onSessionStart;
    onSessionEndRef.current = onSessionEnd;
  }, [onSessionStart, onSessionEnd]);

  // Auto-start session
  useEffect(() => {
    if (autoStart && !isActive) {
      startSession();
    }

    // Cleanup on unmount
    return () => {
      // Don't end session on unmount as other components might still be using it
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [autoStart]);

  // Start session
  const startSession = useCallback(async (): Promise<string> => {
    const newSessionId = await auditTrail.startSession(userId);
    setSessionId(newSessionId);
    setIsActive(true);
    onSessionStartRef.current?.(newSessionId);
    return newSessionId;
  }, [userId]);

  // End session
  const endSession = useCallback(async (): Promise<void> => {
    await auditTrail.endSession();
    setIsActive(false);
    onSessionEndRef.current?.();
  }, []);

  // Log event
  const log = useCallback(
    async (
      action: AuditAction,
      details: Record<string, unknown> = {},
    ): Promise<void> => {
      await auditTrail.log(action, details);
    },
    [],
  );

  // Log PHI event
  const logPhiEvent = useCallback(
    async (
      action:
        | "phi_warning_shown"
        | "phi_warning_acknowledged"
        | "phi_warning_dismissed"
        | "phi_sanitized",
      details: {
        phiTypes?: string[];
        matchCount?: number;
        userChoice?: string;
      },
    ): Promise<void> => {
      await auditTrail.logPhiEvent(action, details);
    },
    [],
  );

  // Log security event
  const logSecurityEvent = useCallback(
    async (
      eventType: string,
      severity: "low" | "medium" | "high" | "critical",
      details: Record<string, unknown>,
    ): Promise<void> => {
      await auditTrail.logSecurityEvent(eventType, severity, details);
    },
    [],
  );

  // Log error
  const logError = useCallback(
    async (
      error: Error | string,
      context?: Record<string, unknown>,
    ): Promise<void> => {
      await auditTrail.logError(error, context);
    },
    [],
  );

  // Get stats
  const getStats = useCallback(async () => {
    return auditTrail.getSessionStats();
  }, []);

  // Export log
  const exportLog = useCallback(async () => {
    return auditTrail.exportSessionLog();
  }, []);

  return {
    sessionId,
    isActive,
    log,
    logPhiEvent,
    logSecurityEvent,
    logError,
    startSession,
    endSession,
    getStats,
    exportLog,
  };
}

/**
 * Simple logging hook for one-off events
 */
export function useAuditLog() {
  const log = useCallback(
    async (
      action: AuditAction,
      details: Record<string, unknown> = {},
    ): Promise<void> => {
      await auditTrail.log(action, details);
    },
    [],
  );

  return log;
}
