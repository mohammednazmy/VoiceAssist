/**
 * Logging utilities for VoiceAssist web app
 *
 * Provides environment-aware logging to reduce console noise in production
 * while maintaining helpful debug output in development.
 *
 * Features:
 * - Debug logs only visible in development
 * - Warn/error logs always visible
 * - Automatic Sentry integration for error tracking
 */

import * as Sentry from "@sentry/browser";

const isDev = import.meta.env.DEV === true;

/**
 * Log debug messages (only in development)
 * Use for verbose/noisy logs that help during debugging
 */
export function debugLog(prefix: string, ...args: unknown[]): void {
  if (isDev) {
    // eslint-disable-next-line no-console
    console.log(`[${prefix}]`, ...args);
  }
}

/**
 * Log warning messages (always visible)
 * Use for non-critical issues that should be noted
 * Automatically reports to Sentry as a warning breadcrumb
 */
export function warnLog(prefix: string, ...args: unknown[]): void {
  console.warn(`[${prefix}]`, ...args);

  // Add Sentry breadcrumb for warnings
  Sentry.addBreadcrumb({
    category: prefix.toLowerCase(),
    message: args
      .map((a) => (typeof a === "string" ? a : JSON.stringify(a)))
      .join(" "),
    level: "warning",
  });
}

/**
 * Log error messages (always visible)
 * Use for actual errors and failures
 * Automatically captures exception to Sentry if Error object is present
 */
export function errorLog(prefix: string, ...args: unknown[]): void {
  console.error(`[${prefix}]`, ...args);

  // Find any Error objects in args and capture to Sentry
  const errorArg = args.find((a) => a instanceof Error);
  if (errorArg instanceof Error) {
    Sentry.captureException(errorArg, {
      tags: { module: prefix.toLowerCase() },
      extra: {
        args: args
          .filter((a) => !(a instanceof Error))
          .map((a) => (typeof a === "string" ? a : JSON.stringify(a)))
          .join(" "),
      },
    });
  } else {
    // No Error object, capture as message
    Sentry.captureMessage(
      `[${prefix}] ${args.map((a) => (typeof a === "string" ? a : JSON.stringify(a))).join(" ")}`,
      {
        level: "error",
        tags: { module: prefix.toLowerCase() },
      },
    );
  }
}

/**
 * Log info messages (always visible in dev, minimal in prod)
 * Use for important operational information
 */
export function infoLog(prefix: string, ...args: unknown[]): void {
  // eslint-disable-next-line no-console
  console.log(`[${prefix}]`, ...args);
}

/**
 * Create a scoped logger for a specific module
 *
 * @example
 * const log = createLogger('WebSocket');
 * log.debug('Connected'); // [WebSocket] Connected (dev only)
 * log.info('Ready'); // [WebSocket] Ready (always)
 * log.error('Failed', err); // [WebSocket] Failed (always)
 */
export function createLogger(prefix: string) {
  return {
    debug: (...args: unknown[]) => debugLog(prefix, ...args),
    info: (...args: unknown[]) => infoLog(prefix, ...args),
    warn: (...args: unknown[]) => warnLog(prefix, ...args),
    error: (...args: unknown[]) => errorLog(prefix, ...args),
  };
}

// Pre-created loggers for common modules
export const websocketLog = createLogger("WebSocket");
export const voiceLog = createLogger("RealtimeVoiceSession");
export const chatLog = createLogger("ChatSession");
export const authLog = createLogger("Auth");

/**
 * Capture an error to Sentry with optional context
 * Use for standalone error capture without console logging
 */
export function captureError(
  error: Error | unknown,
  context?: {
    module?: string;
    extra?: Record<string, unknown>;
  },
): void {
  if (error instanceof Error) {
    Sentry.captureException(error, {
      tags: context?.module ? { module: context.module } : undefined,
      extra: context?.extra,
    });
  } else {
    Sentry.captureMessage(String(error), {
      level: "error",
      tags: context?.module ? { module: context.module } : undefined,
      extra: context?.extra,
    });
  }
}

/**
 * Capture a warning to Sentry
 * Use for standalone warning capture without console logging
 */
export function captureWarning(
  message: string,
  context?: {
    module?: string;
    extra?: Record<string, unknown>;
  },
): void {
  Sentry.captureMessage(message, {
    level: "warning",
    tags: context?.module ? { module: context.module } : undefined,
    extra: context?.extra,
  });
}
