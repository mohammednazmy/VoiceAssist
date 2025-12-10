/**
 * Audio Rate Limiter
 *
 * Token bucket rate limiter for audio chunk transmission.
 * Prevents overwhelming the WebSocket with audio data and
 * helps maintain stable streaming during network congestion.
 *
 * Features:
 * - Token bucket algorithm with burst support
 * - Adaptive rate based on WebSocket buffer level
 * - Dropped chunk statistics for monitoring
 *
 * Phase: Voice Feature Hardening
 */

import { voiceLog } from "./logger";

// ============================================================================
// Types
// ============================================================================

export interface AudioRateLimiterOptions {
  /** Maximum chunks per second (default: 15 = ~66ms per chunk) */
  chunksPerSecond?: number;
  /** Maximum burst size (default: 5 chunks) */
  burstSize?: number;
  /** Enable adaptive rate limiting based on buffer level (default: true) */
  adaptiveEnabled?: boolean;
  /** High buffer threshold in bytes for aggressive throttling (default: 128KB) */
  highBufferThreshold?: number;
  /** Medium buffer threshold in bytes for moderate throttling (default: 64KB) */
  mediumBufferThreshold?: number;
}

export interface RateLimitResult {
  /** Whether the chunk can be sent */
  allowed: boolean;
  /** Reason if not allowed */
  reason?: "rate_limited" | "buffer_full" | "high_buffer";
  /** Current buffer level (if available) */
  bufferLevel?: number;
}

export interface AudioRateLimiterStats {
  /** Total chunks processed */
  totalChunks: number;
  /** Chunks that were sent */
  sentChunks: number;
  /** Chunks that were dropped */
  droppedChunks: number;
  /** Chunks dropped due to rate limiting */
  droppedByRateLimit: number;
  /** Chunks dropped due to buffer pressure */
  droppedByBufferPressure: number;
  /** Drop rate as percentage */
  dropRate: number;
}

// ============================================================================
// Implementation
// ============================================================================

/**
 * Token bucket rate limiter for audio chunks
 */
export class AudioChunkRateLimiter {
  private tokens: number;
  private lastRefillTime: number;
  private readonly maxTokens: number;
  private readonly refillRatePerMs: number;
  private readonly adaptiveEnabled: boolean;
  private readonly highBufferThreshold: number;
  private readonly mediumBufferThreshold: number;

  // Statistics
  private totalChunks: number = 0;
  private sentChunks: number = 0;
  private droppedByRateLimit: number = 0;
  private droppedByBufferPressure: number = 0;

  constructor(options: AudioRateLimiterOptions = {}) {
    const {
      chunksPerSecond = 15, // ~66ms per chunk
      burstSize = 5,
      adaptiveEnabled = true,
      highBufferThreshold = 128 * 1024, // 128KB
      mediumBufferThreshold = 64 * 1024, // 64KB
    } = options;

    this.maxTokens = burstSize;
    this.tokens = burstSize;
    this.refillRatePerMs = chunksPerSecond / 1000;
    this.lastRefillTime = Date.now();
    this.adaptiveEnabled = adaptiveEnabled;
    this.highBufferThreshold = highBufferThreshold;
    this.mediumBufferThreshold = mediumBufferThreshold;
  }

  /**
   * Check if an audio chunk can be sent
   *
   * @param bufferLevel - Current WebSocket bufferedAmount (optional)
   * @returns Result indicating if chunk can be sent
   */
  canSend(bufferLevel?: number): RateLimitResult {
    this.totalChunks++;
    this.refill();

    // Check buffer pressure if adaptive enabled
    if (this.adaptiveEnabled && bufferLevel !== undefined) {
      if (bufferLevel > this.highBufferThreshold) {
        this.droppedByBufferPressure++;
        this.logDroppedChunk("buffer_full");
        return {
          allowed: false,
          reason: "buffer_full",
          bufferLevel,
        };
      }

      if (bufferLevel > this.mediumBufferThreshold) {
        // Apply stricter rate limiting for medium buffer pressure
        if (this.tokens < 2) {
          // Need 2 tokens instead of 1
          this.droppedByBufferPressure++;
          this.logDroppedChunk("high_buffer");
          return {
            allowed: false,
            reason: "high_buffer",
            bufferLevel,
          };
        }
      }
    }

    // Standard rate limit check
    if (this.tokens >= 1) {
      this.tokens -= 1;
      this.sentChunks++;
      return { allowed: true, bufferLevel };
    }

    this.droppedByRateLimit++;
    this.logDroppedChunk("rate_limited");
    return {
      allowed: false,
      reason: "rate_limited",
      bufferLevel,
    };
  }

  /**
   * Refill tokens based on elapsed time
   */
  private refill(): void {
    const now = Date.now();
    const elapsed = now - this.lastRefillTime;
    this.tokens = Math.min(
      this.maxTokens,
      this.tokens + elapsed * this.refillRatePerMs,
    );
    this.lastRefillTime = now;
  }

  /**
   * Log dropped chunk (with throttling to avoid log spam)
   */
  private logDroppedChunk(reason: string): void {
    const totalDropped = this.droppedByRateLimit + this.droppedByBufferPressure;
    if (totalDropped % 20 === 0) {
      voiceLog.warn(
        `[AudioRateLimiter] Dropped ${totalDropped} chunks (last: ${reason})`,
        {
          byRateLimit: this.droppedByRateLimit,
          byBufferPressure: this.droppedByBufferPressure,
          dropRate: this.getDropRate().toFixed(1) + "%",
        },
      );
    }
  }

  /**
   * Reset the rate limiter (e.g., after reconnect)
   */
  reset(): void {
    this.tokens = this.maxTokens;
    this.lastRefillTime = Date.now();
    voiceLog.debug("[AudioRateLimiter] Reset");
  }

  /**
   * Reset statistics
   */
  resetStats(): void {
    this.totalChunks = 0;
    this.sentChunks = 0;
    this.droppedByRateLimit = 0;
    this.droppedByBufferPressure = 0;
  }

  /**
   * Get current drop rate as percentage
   */
  getDropRate(): number {
    if (this.totalChunks === 0) return 0;
    return (
      ((this.droppedByRateLimit + this.droppedByBufferPressure) /
        this.totalChunks) *
      100
    );
  }

  /**
   * Get statistics
   */
  getStats(): AudioRateLimiterStats {
    return {
      totalChunks: this.totalChunks,
      sentChunks: this.sentChunks,
      droppedChunks: this.droppedByRateLimit + this.droppedByBufferPressure,
      droppedByRateLimit: this.droppedByRateLimit,
      droppedByBufferPressure: this.droppedByBufferPressure,
      dropRate: this.getDropRate(),
    };
  }

  /**
   * Get available tokens (for debugging)
   */
  getAvailableTokens(): number {
    this.refill();
    return this.tokens;
  }
}

// ============================================================================
// Factory Function
// ============================================================================

/**
 * Create an audio rate limiter with default settings optimized for voice
 */
export function createVoiceRateLimiter(): AudioChunkRateLimiter {
  return new AudioChunkRateLimiter({
    chunksPerSecond: 15, // 16kHz @ 2048 samples = ~128ms, so 15/sec is generous
    burstSize: 5, // Allow small bursts
    adaptiveEnabled: true,
    highBufferThreshold: 128 * 1024, // 128KB
    mediumBufferThreshold: 64 * 1024, // 64KB
  });
}

export default AudioChunkRateLimiter;
