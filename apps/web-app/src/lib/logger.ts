/**
 * Logging utilities for VoiceAssist web app
 *
 * Provides environment-aware logging to reduce console noise in production
 * while maintaining helpful debug output in development.
 */

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
 */
export function warnLog(prefix: string, ...args: unknown[]): void {
  // eslint-disable-next-line no-console
  console.warn(`[${prefix}]`, ...args);
}

/**
 * Log error messages (always visible)
 * Use for actual errors and failures
 */
export function errorLog(prefix: string, ...args: unknown[]): void {
  // eslint-disable-next-line no-console
  console.error(`[${prefix}]`, ...args);
}

/**
 * Create a scoped logger for a specific module
 *
 * @example
 * const log = createLogger('WebSocket');
 * log.debug('Connected'); // [WebSocket] Connected (dev only)
 * log.error('Failed', err); // [WebSocket] Failed (always)
 */
export function createLogger(prefix: string) {
  return {
    debug: (...args: unknown[]) => debugLog(prefix, ...args),
    warn: (...args: unknown[]) => warnLog(prefix, ...args),
    error: (...args: unknown[]) => errorLog(prefix, ...args),
  };
}

// Pre-created loggers for common modules
export const websocketLog = createLogger("WebSocket");
export const voiceLog = createLogger("RealtimeVoiceSession");
export const chatLog = createLogger("ChatSession");
export const authLog = createLogger("Auth");
