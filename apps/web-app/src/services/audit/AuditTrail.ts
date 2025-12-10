/**
 * Session Audit Trail
 *
 * Tracks user actions for HIPAA compliance and security monitoring.
 * Stores locally in encrypted storage and syncs to backend audit service.
 *
 * @example
 * ```typescript
 * import { auditTrail } from '@/services/audit/AuditTrail';
 *
 * // Start tracking
 * await auditTrail.startSession('user-123');
 *
 * // Log events
 * auditTrail.log('message_sent', { messageId: '...' });
 *
 * // End session
 * await auditTrail.endSession();
 * ```
 */

import { encryptedStorage } from "../storage/EncryptedStorage";

/**
 * Audit action types
 */
export type AuditAction =
  | "session_start"
  | "session_end"
  | "session_resumed"
  | "message_sent"
  | "message_received"
  | "message_deleted"
  | "phi_warning_shown"
  | "phi_warning_acknowledged"
  | "phi_warning_dismissed"
  | "phi_sanitized"
  | "clinical_context_set"
  | "clinical_context_cleared"
  | "voice_mode_started"
  | "voice_mode_ended"
  | "voice_recording_started"
  | "voice_recording_ended"
  | "file_uploaded"
  | "file_downloaded"
  | "export_requested"
  | "export_completed"
  | "navigation"
  | "search_performed"
  | "settings_changed"
  | "login"
  | "logout"
  | "error"
  | "security_event";

/**
 * Audit event interface
 */
export interface AuditEvent {
  action: AuditAction;
  timestamp: number;
  sessionId: string;
  userId?: string;
  details: Record<string, unknown>;
  metadata?: {
    userAgent?: string;
    screenResolution?: string;
    language?: string;
    timezone?: string;
  };
}

/**
 * Audit sync configuration
 */
interface AuditSyncConfig {
  /** Backend endpoint for syncing audit logs */
  endpoint: string;
  /** Sync interval in milliseconds */
  syncInterval: number;
  /** Maximum batch size for syncing */
  batchSize: number;
  /** Maximum retry attempts */
  maxRetries: number;
}

/**
 * Default sync configuration
 */
const DEFAULT_SYNC_CONFIG: AuditSyncConfig = {
  endpoint: "/api/audit/sync",
  syncInterval: 60000, // 1 minute
  batchSize: 100,
  maxRetries: 3,
};

/**
 * Audit Trail class
 */
class AuditTrailService {
  private sessionId: string;
  private userId: string | null = null;
  private isActive = false;
  private syncConfig: AuditSyncConfig;
  private syncIntervalId: ReturnType<typeof setInterval> | null = null;
  private pendingEvents: AuditEvent[] = [];
  private eventBuffer: AuditEvent[] = [];
  private bufferFlushTimeout: ReturnType<typeof setTimeout> | null = null;

  constructor(config: Partial<AuditSyncConfig> = {}) {
    this.sessionId = this.generateSessionId();
    this.syncConfig = { ...DEFAULT_SYNC_CONFIG, ...config };
  }

  /**
   * Generate a unique session ID
   */
  private generateSessionId(): string {
    const timestamp = Date.now().toString(36);
    const random = Math.random().toString(36).substring(2, 10);
    return `session-${timestamp}-${random}`;
  }

  /**
   * Get current session ID
   */
  get currentSessionId(): string {
    return this.sessionId;
  }

  /**
   * Start a new audit session
   */
  async startSession(userId?: string): Promise<string> {
    this.userId = userId ?? null;
    this.isActive = true;

    // Log session start
    await this.log("session_start", {
      userId: this.userId,
      startTime: new Date().toISOString(),
    });

    // Start sync interval
    this.startSyncInterval();

    return this.sessionId;
  }

  /**
   * Resume an existing session
   */
  async resumeSession(sessionId: string, userId?: string): Promise<void> {
    this.sessionId = sessionId;
    this.userId = userId ?? null;
    this.isActive = true;

    await this.log("session_resumed", {
      userId: this.userId,
      resumeTime: new Date().toISOString(),
    });

    this.startSyncInterval();
  }

  /**
   * End the current audit session
   */
  async endSession(): Promise<void> {
    if (!this.isActive) return;

    // Log session end
    await this.log("session_end", {
      userId: this.userId,
      endTime: new Date().toISOString(),
      eventCount: this.pendingEvents.length,
    });

    // Flush remaining events
    await this.flushBuffer();

    // Final sync attempt
    await this.syncToBackend();

    // Stop sync interval
    this.stopSyncInterval();

    // Reset state
    this.isActive = false;
    this.sessionId = this.generateSessionId();
  }

  /**
   * Log an audit event
   */
  async log(
    action: AuditAction,
    details: Record<string, unknown> = {},
    immediate = false,
  ): Promise<void> {
    const event: AuditEvent = {
      action,
      timestamp: Date.now(),
      sessionId: this.sessionId,
      userId: this.userId ?? undefined,
      details: this.sanitizeDetails(details),
      metadata: this.collectMetadata(),
    };

    // Add to buffer
    this.eventBuffer.push(event);

    if (immediate) {
      await this.flushBuffer();
    } else {
      // Debounce buffer flush
      this.scheduleBufferFlush();
    }
  }

  /**
   * Log a PHI-related event
   */
  async logPhiEvent(
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
  ): Promise<void> {
    await this.log(action, details, true); // PHI events should be logged immediately
  }

  /**
   * Log a security event
   */
  async logSecurityEvent(
    eventType: string,
    severity: "low" | "medium" | "high" | "critical",
    details: Record<string, unknown>,
  ): Promise<void> {
    await this.log(
      "security_event",
      {
        eventType,
        severity,
        ...details,
      },
      true,
    ); // Security events should be logged immediately
  }

  /**
   * Log an error
   */
  async logError(
    error: Error | string,
    context?: Record<string, unknown>,
  ): Promise<void> {
    const errorDetails =
      error instanceof Error
        ? {
            message: error.message,
            name: error.name,
            stack: error.stack?.split("\n").slice(0, 5).join("\n"), // Limit stack trace
          }
        : { message: error };

    await this.log("error", {
      ...errorDetails,
      context,
    });
  }

  /**
   * Schedule buffer flush with debouncing
   */
  private scheduleBufferFlush(): void {
    if (this.bufferFlushTimeout) {
      clearTimeout(this.bufferFlushTimeout);
    }

    this.bufferFlushTimeout = setTimeout(() => {
      this.flushBuffer();
    }, 1000); // 1 second debounce
  }

  /**
   * Flush event buffer to storage
   */
  private async flushBuffer(): Promise<void> {
    if (this.eventBuffer.length === 0) return;

    const eventsToFlush = [...this.eventBuffer];
    this.eventBuffer = [];

    // Store in encrypted storage
    if (encryptedStorage.initialized) {
      for (const event of eventsToFlush) {
        await encryptedStorage.logAuditEvent(
          event.action,
          event.details,
          this.sessionId,
        );
      }
    }

    // Add to pending for sync
    this.pendingEvents.push(...eventsToFlush);
  }

  /**
   * Start the sync interval
   */
  private startSyncInterval(): void {
    if (this.syncIntervalId) return;

    this.syncIntervalId = setInterval(() => {
      this.syncToBackend();
    }, this.syncConfig.syncInterval);
  }

  /**
   * Stop the sync interval
   */
  private stopSyncInterval(): void {
    if (this.syncIntervalId) {
      clearInterval(this.syncIntervalId);
      this.syncIntervalId = null;
    }
  }

  /**
   * Sync events to backend
   */
  private async syncToBackend(): Promise<void> {
    if (!encryptedStorage.initialized) return;

    try {
      // Get unsynced events from storage
      const unsyncedEvents = await encryptedStorage.getUnsyncedAuditEvents();

      if (unsyncedEvents.length === 0) return;

      // Batch events
      const batches: (typeof unsyncedEvents)[] = [];
      for (
        let i = 0;
        i < unsyncedEvents.length;
        i += this.syncConfig.batchSize
      ) {
        batches.push(unsyncedEvents.slice(i, i + this.syncConfig.batchSize));
      }

      // Sync each batch
      for (const batch of batches) {
        const success = await this.syncBatch(batch);
        if (success) {
          // Mark as synced
          await encryptedStorage.markAuditEventsSynced(batch.map((e) => e.id));
        }
      }
    } catch (error) {
      console.warn("[AuditTrail] Sync failed:", error);
    }
  }

  /**
   * Sync a batch of events to backend
   */
  private async syncBatch(
    events: Array<{
      id: number;
      action: string;
      timestamp: number;
      details: Record<string, unknown>;
    }>,
  ): Promise<boolean> {
    let retries = 0;

    while (retries < this.syncConfig.maxRetries) {
      try {
        const response = await fetch(this.syncConfig.endpoint, {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
          },
          body: JSON.stringify({
            sessionId: this.sessionId,
            events: events.map((e) => ({
              action: e.action,
              timestamp: e.timestamp,
              details: e.details,
            })),
          }),
        });

        if (response.ok) {
          return true;
        }

        // Don't retry on client errors
        if (response.status >= 400 && response.status < 500) {
          console.warn(
            "[AuditTrail] Client error during sync:",
            response.status,
          );
          return false;
        }
      } catch (error) {
        console.warn(`[AuditTrail] Sync attempt ${retries + 1} failed:`, error);
      }

      retries++;
      // Exponential backoff
      await new Promise((resolve) =>
        setTimeout(resolve, Math.pow(2, retries) * 1000),
      );
    }

    return false;
  }

  /**
   * Sanitize event details to remove sensitive data
   */
  private sanitizeDetails(
    details: Record<string, unknown>,
  ): Record<string, unknown> {
    const sanitized: Record<string, unknown> = {};

    for (const [key, value] of Object.entries(details)) {
      // Skip sensitive keys
      if (this.isSensitiveKey(key)) {
        sanitized[key] = "[REDACTED]";
        continue;
      }

      // Recursively sanitize nested objects
      if (value && typeof value === "object" && !Array.isArray(value)) {
        sanitized[key] = this.sanitizeDetails(value as Record<string, unknown>);
      } else {
        sanitized[key] = value;
      }
    }

    return sanitized;
  }

  /**
   * Check if a key should be considered sensitive
   */
  private isSensitiveKey(key: string): boolean {
    const sensitivePatterns = [
      "password",
      "token",
      "secret",
      "key",
      "auth",
      "credential",
      "ssn",
      "social",
      "credit",
      "card",
      "cvv",
      "pin",
    ];

    const lowerKey = key.toLowerCase();
    return sensitivePatterns.some((pattern) => lowerKey.includes(pattern));
  }

  /**
   * Collect metadata about the client
   */
  private collectMetadata(): AuditEvent["metadata"] {
    if (typeof window === "undefined") return undefined;

    return {
      userAgent: navigator.userAgent,
      screenResolution: `${window.screen.width}x${window.screen.height}`,
      language: navigator.language,
      timezone: Intl.DateTimeFormat().resolvedOptions().timeZone,
    };
  }

  /**
   * Get session statistics
   */
  async getSessionStats(): Promise<{
    sessionId: string;
    eventCount: number;
    unsyncedCount: number;
    startTime?: number;
  }> {
    const events = encryptedStorage.initialized
      ? await encryptedStorage.getSessionAuditEvents(this.sessionId)
      : [];

    const startEvent = events.find((e) => e.action === "session_start");

    const stats = encryptedStorage.initialized
      ? await encryptedStorage.getStats()
      : { unsyncedAuditCount: 0 };

    return {
      sessionId: this.sessionId,
      eventCount: events.length,
      unsyncedCount: stats.unsyncedAuditCount,
      startTime: startEvent?.timestamp,
    };
  }

  /**
   * Export session audit log
   */
  async exportSessionLog(): Promise<AuditEvent[]> {
    if (!encryptedStorage.initialized) return [];

    const events = await encryptedStorage.getSessionAuditEvents(this.sessionId);
    return events.map((e) => ({
      action: e.action as AuditAction,
      timestamp: e.timestamp,
      sessionId: this.sessionId,
      userId: this.userId ?? undefined,
      details: e.details,
    }));
  }
}

/**
 * Singleton instance
 */
export const auditTrail = new AuditTrailService();

/**
 * Create a new audit trail instance with custom config
 */
export function createAuditTrail(
  config: Partial<AuditSyncConfig>,
): AuditTrailService {
  return new AuditTrailService(config);
}
