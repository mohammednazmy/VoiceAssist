/**
 * Sentry Error Tracking for Frontend
 *
 * Provides:
 * - Automatic error capture
 * - Performance monitoring
 * - Privacy-safe scrubbing
 * - Voice-specific error context
 */

import * as Sentry from "@sentry/browser";

// Track initialization state
let sentryInitialized = false;

/**
 * Initialize Sentry if DSN is configured
 */
export function initSentry(): boolean {
  if (sentryInitialized) {
    return true;
  }

  const dsn = import.meta.env.VITE_SENTRY_DSN;

  if (!dsn) {
    console.log("[Sentry] Disabled: VITE_SENTRY_DSN not configured");
    return false;
  }

  try {
    Sentry.init({
      dsn,
      environment: import.meta.env.MODE,
      release: `voiceassist-web@${import.meta.env.VITE_APP_VERSION || "0.1.0"}`,

      // Performance monitoring
      tracesSampleRate: import.meta.env.PROD ? 0.1 : 1.0,

      // Privacy: don't send PII
      sendDefaultPii: false,

      // Scrub sensitive data
      beforeSend(event) {
        return scrubSensitiveData(event);
      },

      // Scrub breadcrumbs
      beforeBreadcrumb(breadcrumb) {
        // Don't log user input
        if (breadcrumb.category === "ui.input") {
          return null;
        }
        // Scrub URLs with tokens
        if (breadcrumb.data?.url) {
          breadcrumb.data.url = scrubUrl(breadcrumb.data.url);
        }
        return breadcrumb;
      },

      // Ignore common non-actionable errors
      ignoreErrors: [
        // Browser extensions
        /extensions\//i,
        /^chrome-extension:\/\//i,
        /^moz-extension:\/\//i,
        // Network errors that user can't control
        "Network request failed",
        "Failed to fetch",
        "Load failed",
        // User aborted
        "AbortError",
        "The operation was aborted",
      ],
    });

    sentryInitialized = true;
    console.log("[Sentry] Initialized", { environment: import.meta.env.MODE });
    return true;
  } catch (err) {
    console.warn("[Sentry] Failed to initialize:", err);
    return false;
  }
}

/**
 * Scrub sensitive data from events
 */
function scrubSensitiveData(
  event: Sentry.ErrorEvent,
): Sentry.ErrorEvent | null {
  // Scrub request data
  if (event.request) {
    if (event.request.headers) {
      const sensitiveHeaders = [
        "authorization",
        "cookie",
        "x-api-key",
        "set-cookie",
      ];
      for (const header of sensitiveHeaders) {
        if (event.request.headers[header]) {
          event.request.headers[header] = "[REDACTED]";
        }
      }
    }

    if (event.request.url) {
      event.request.url = scrubUrl(event.request.url);
    }
  }

  // Scrub extra context
  if (event.extra) {
    event.extra = scrubObject(event.extra);
  }

  return event;
}

/**
 * Scrub sensitive query parameters from URL
 */
function scrubUrl(url: string): string {
  try {
    const parsed = new URL(url, window.location.origin);
    const sensitiveParams = ["token", "api_key", "key", "password", "secret"];

    for (const param of sensitiveParams) {
      if (parsed.searchParams.has(param)) {
        parsed.searchParams.set(param, "[REDACTED]");
      }
    }

    return parsed.toString();
  } catch {
    return url;
  }
}

/**
 * Recursively scrub sensitive values from object
 */
function scrubObject(obj: Record<string, unknown>): Record<string, unknown> {
  const sensitiveKeys = [
    "password",
    "token",
    "api_key",
    "secret",
    "authorization",
    "transcript",
    "content",
    "message",
  ];

  const result: Record<string, unknown> = {};

  for (const [key, value] of Object.entries(obj)) {
    if (sensitiveKeys.some((s) => key.toLowerCase().includes(s))) {
      result[key] = "[REDACTED]";
    } else if (value && typeof value === "object" && !Array.isArray(value)) {
      result[key] = scrubObject(value as Record<string, unknown>);
    } else {
      result[key] = value;
    }
  }

  return result;
}

/**
 * Capture a voice-related error with context
 */
export function captureVoiceError(
  error: Error | unknown,
  context?: {
    status?: string;
    conversationId?: string;
    metrics?: Record<string, number | null>;
    breadcrumb?: string;
  },
): string | undefined {
  if (!sentryInitialized) {
    return undefined;
  }

  const breadcrumb = context?.breadcrumb
    ? {
        type: "info" as const,
        category: "voice",
        message: context.breadcrumb,
        level: "info" as const,
      }
    : undefined;

  if (breadcrumb) {
    Sentry.addBreadcrumb(breadcrumb);
  }

  return Sentry.captureException(error, {
    tags: {
      feature: "voice",
      voice_status: context?.status || "unknown",
    },
    extra: {
      conversation_id: context?.conversationId,
      breadcrumb: context?.breadcrumb,
      // Only include numeric metrics, no transcripts
      metrics: context?.metrics
        ? {
            connectionTimeMs: context.metrics.connectionTimeMs,
            lastSttLatencyMs: context.metrics.lastSttLatencyMs,
            lastResponseLatencyMs: context.metrics.lastResponseLatencyMs,
            sessionDurationMs: context.metrics.sessionDurationMs,
          }
        : undefined,
    },
  });
}

/**
 * Capture a voice SLO violation
 */
export function captureVoiceSLOViolation(
  metric: string,
  actualMs: number,
  thresholdMs: number,
  conversationId?: string,
): string | undefined {
  if (!sentryInitialized) {
    return undefined;
  }

  return Sentry.captureMessage(
    `Voice SLO violation: ${metric} (${actualMs.toFixed(0)}ms > ${thresholdMs}ms)`,
    {
      level: "warning",
      tags: {
        feature: "voice",
        type: "slo_violation",
        metric,
      },
      extra: {
        actual_ms: actualMs,
        threshold_ms: thresholdMs,
        exceeded_by_ms: actualMs - thresholdMs,
        conversation_id: conversationId,
      },
    },
  );
}

/**
 * Set user context (privacy-safe)
 */
export function setUser(userId: string | null): void {
  if (!sentryInitialized) {
    return;
  }

  if (userId) {
    Sentry.setUser({ id: userId });
  } else {
    Sentry.setUser(null);
  }
}

/**
 * Add breadcrumb for debugging
 */
export function addBreadcrumb(
  category: string,
  message: string,
  data?: Record<string, unknown>,
): void {
  if (!sentryInitialized) {
    return;
  }

  Sentry.addBreadcrumb({
    category,
    message,
    data: data ? scrubObject(data) : undefined,
    level: "info",
  });
}

// Export Sentry for direct use if needed
export { Sentry };
