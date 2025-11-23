/**
 * Retry Logic Utility
 * Implements exponential backoff for failed API calls
 */

export interface RetryConfig {
  maxRetries: number;
  baseDelay: number; // milliseconds
  maxDelay: number; // milliseconds
  retryableStatuses: number[];
}

const DEFAULT_RETRY_CONFIG: RetryConfig = {
  maxRetries: 3,
  baseDelay: 1000, // 1 second
  maxDelay: 10000, // 10 seconds
  retryableStatuses: [408, 429, 500, 502, 503, 504],
};

/**
 * Sleep for a given number of milliseconds
 */
function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

/**
 * Calculate exponential backoff delay
 */
function calculateDelay(attempt: number, config: RetryConfig): number {
  const exponentialDelay = config.baseDelay * Math.pow(2, attempt);
  const jitter = Math.random() * 0.1 * exponentialDelay; // Add 10% jitter
  return Math.min(exponentialDelay + jitter, config.maxDelay);
}

/**
 * Check if an error is retryable
 */
function isRetryableError(error: any, config: RetryConfig): boolean {
  // Network errors (no response)
  if (!error.response) {
    return true;
  }

  // Specific HTTP status codes
  if (config.retryableStatuses.includes(error.response.status)) {
    return true;
  }

  return false;
}

/**
 * Retry a function with exponential backoff
 */
export async function withRetry<T>(
  fn: () => Promise<T>,
  config: Partial<RetryConfig> = {},
  onRetry?: (attempt: number, error: any) => void,
): Promise<T> {
  const finalConfig = { ...DEFAULT_RETRY_CONFIG, ...config };
  let lastError: any;

  for (let attempt = 0; attempt <= finalConfig.maxRetries; attempt++) {
    try {
      return await fn();
    } catch (error) {
      lastError = error;

      // Don't retry if it's not a retryable error
      if (!isRetryableError(error, finalConfig)) {
        throw error;
      }

      // Don't retry if we've exhausted all attempts
      if (attempt === finalConfig.maxRetries) {
        throw error;
      }

      // Calculate delay and wait
      const delay = calculateDelay(attempt, finalConfig);

      // Notify caller of retry attempt
      if (onRetry) {
        onRetry(attempt + 1, error);
      }

      await sleep(delay);
    }
  }

  throw lastError;
}

/**
 * Create a retry wrapper for a function
 */
export function createRetryWrapper<T extends any[], R>(
  fn: (...args: T) => Promise<R>,
  config?: Partial<RetryConfig>,
  onRetry?: (attempt: number, error: any) => void,
): (...args: T) => Promise<R> {
  return (...args: T) => {
    return withRetry(() => fn(...args), config, onRetry);
  };
}
