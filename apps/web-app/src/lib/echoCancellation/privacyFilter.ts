/**
 * Privacy-Aware Audio Processing
 *
 * Provides privacy-first audio handling:
 * - Encrypts audio chunks in transit
 * - Strips metadata before logging
 * - Implements audio hashing for anonymized telemetry
 * - GDPR/HIPAA compliant data handling
 *
 * Phase 4: Advanced Audio Processing
 */

import type { PrivacyConfig } from "./types";
import { DEFAULT_PRIVACY_CONFIG } from "./types";

// ============================================================================
// Privacy Filter
// ============================================================================

/**
 * Privacy-aware audio processing filter
 *
 * Ensures audio data is handled securely and in compliance
 * with privacy regulations (GDPR, HIPAA).
 */
export class PrivacyFilter {
  private config: PrivacyConfig;
  private encryptionKey: CryptoKey | null = null;
  private initialized: boolean = false;

  /** Statistics for privacy operations */
  private stats = {
    chunksEncrypted: 0,
    chunksDecrypted: 0,
    hashesGenerated: 0,
    bytesProcessed: 0,
  };

  constructor(config: Partial<PrivacyConfig> = {}) {
    this.config = { ...DEFAULT_PRIVACY_CONFIG, ...config };
  }

  // ==========================================================================
  // Initialization
  // ==========================================================================

  /**
   * Initialize the privacy filter
   *
   * Generates encryption keys if needed and prepares for operation.
   */
  async initialize(): Promise<void> {
    if (this.initialized) return;

    if (this.config.encryptInTransit) {
      if (this.config.encryptionKey) {
        this.encryptionKey = this.config.encryptionKey;
      } else {
        // Generate a new encryption key
        this.encryptionKey = await crypto.subtle.generateKey(
          { name: "AES-GCM", length: 256 },
          true,
          ["encrypt", "decrypt"],
        );
      }
    }

    this.initialized = true;
  }

  /**
   * Check if the filter is initialized
   */
  isInitialized(): boolean {
    return this.initialized;
  }

  // ==========================================================================
  // Encryption / Decryption
  // ==========================================================================

  /**
   * Convert Float32Array to ArrayBuffer safely
   */
  private toArrayBuffer(chunk: Float32Array): ArrayBuffer {
    const buffer = new ArrayBuffer(chunk.byteLength);
    new Float32Array(buffer).set(chunk);
    return buffer;
  }

  /**
   * Encrypt an audio chunk for secure transmission
   *
   * @param chunk - Raw audio samples
   * @returns Encrypted audio data with IV prepended
   */
  async encryptAudioChunk(chunk: Float32Array): Promise<ArrayBuffer> {
    if (!this.config.encryptInTransit || !this.encryptionKey) {
      return this.toArrayBuffer(chunk);
    }

    // Generate random IV for each chunk
    const iv = crypto.getRandomValues(new Uint8Array(12));

    // Encrypt the audio data - convert to ArrayBuffer first
    const audioBuffer = this.toArrayBuffer(chunk);
    const encrypted = await crypto.subtle.encrypt(
      { name: "AES-GCM", iv },
      this.encryptionKey,
      audioBuffer,
    );

    // Prepend IV to encrypted data
    const result = new Uint8Array(iv.length + encrypted.byteLength);
    result.set(iv, 0);
    result.set(new Uint8Array(encrypted), iv.length);

    this.stats.chunksEncrypted++;
    this.stats.bytesProcessed += chunk.byteLength;

    // Return as proper ArrayBuffer
    return result.buffer as ArrayBuffer;
  }

  /**
   * Decrypt an encrypted audio chunk
   *
   * @param encrypted - Encrypted audio data with IV prepended
   * @returns Decrypted audio samples
   */
  async decryptAudioChunk(encrypted: ArrayBuffer): Promise<Float32Array> {
    if (!this.config.encryptInTransit || !this.encryptionKey) {
      return new Float32Array(encrypted);
    }

    const data = new Uint8Array(encrypted);
    const iv = data.slice(0, 12);
    const ciphertext = data.slice(12);

    const decrypted = await crypto.subtle.decrypt(
      { name: "AES-GCM", iv },
      this.encryptionKey,
      ciphertext,
    );

    this.stats.chunksDecrypted++;

    return new Float32Array(decrypted);
  }

  // ==========================================================================
  // Anonymization for Telemetry
  // ==========================================================================

  /**
   * Create anonymized hash of audio for telemetry
   *
   * Generates a hash that can identify patterns without
   * storing actual audio content. Useful for:
   * - Detecting similar audio segments
   * - Tracking conversation patterns
   * - Debugging without privacy concerns
   *
   * @param chunk - Audio samples to hash
   * @returns Anonymized hash string
   */
  async hashAudioForTelemetry(chunk: Float32Array): Promise<string> {
    if (!this.config.anonymizeTelemetry) {
      return "telemetry_disabled";
    }

    // Create a spectral fingerprint
    const fingerprint = this.createSpectralFingerprint(chunk);

    // Hash the fingerprint - convert to ArrayBuffer first
    const fingerprintBuffer = this.toArrayBuffer(fingerprint);
    const hashBuffer = await crypto.subtle.digest(
      this.config.hashAlgorithm,
      fingerprintBuffer,
    );

    const hashArray = Array.from(new Uint8Array(hashBuffer));
    const hashHex = hashArray
      .map((b) => b.toString(16).padStart(2, "0"))
      .join("");

    this.stats.hashesGenerated++;

    return hashHex.slice(0, this.config.maxFingerprintLength);
  }

  /**
   * Create a spectral fingerprint of audio
   *
   * Converts audio to a compact representation that captures
   * spectral characteristics without being reversible to
   * original audio.
   */
  private createSpectralFingerprint(chunk: Float32Array): Float32Array {
    const bins = 32;
    const fingerprint = new Float32Array(bins);
    const binSize = Math.max(1, Math.floor(chunk.length / bins));

    for (let i = 0; i < bins; i++) {
      let energy = 0;
      let zeroCrossings = 0;
      let prevSample = 0;

      for (let j = 0; j < binSize && i * binSize + j < chunk.length; j++) {
        const sample = chunk[i * binSize + j];
        energy += sample * sample;

        // Count zero crossings for spectral characterization
        if (prevSample * sample < 0) {
          zeroCrossings++;
        }
        prevSample = sample;
      }

      // Combine energy and zero-crossing rate
      fingerprint[i] = Math.sqrt(energy / binSize) + zeroCrossings / binSize;
    }

    return fingerprint;
  }

  // ==========================================================================
  // Metadata Handling
  // ==========================================================================

  /**
   * Strip metadata from an audio event for logging
   *
   * Removes potentially identifying information while keeping
   * useful debugging data.
   */
  stripMetadata<T extends Record<string, unknown>>(event: T): Partial<T> {
    if (!this.config.stripMetadata) {
      return event;
    }

    const stripped: Partial<T> = {};
    const sensitiveKeys = [
      "userId",
      "sessionId",
      "deviceId",
      "ip",
      "location",
      "rawAudio",
      "transcript",
      "email",
      "name",
      "phone",
    ];

    for (const key of Object.keys(event) as (keyof T)[]) {
      if (!sensitiveKeys.includes(key as string)) {
        stripped[key] = event[key];
      } else {
        // Replace with anonymized version
        stripped[key] = "[REDACTED]" as T[keyof T];
      }
    }

    return stripped;
  }

  /**
   * Create a privacy-safe telemetry event
   *
   * @param eventType - Type of event
   * @param data - Event data
   * @param audioChunk - Optional audio to hash
   */
  async createTelemetryEvent(
    eventType: string,
    data: Record<string, unknown>,
    audioChunk?: Float32Array,
  ): Promise<{
    type: string;
    timestamp: number;
    data: Record<string, unknown>;
    audioHash?: string;
  }> {
    const event = {
      type: eventType,
      timestamp: Date.now(),
      data: this.stripMetadata(data),
      audioHash: audioChunk
        ? await this.hashAudioForTelemetry(audioChunk)
        : undefined,
    };

    return event;
  }

  // ==========================================================================
  // Key Management
  // ==========================================================================

  /**
   * Export the encryption key for secure storage
   */
  async exportKey(): Promise<ArrayBuffer | null> {
    if (!this.encryptionKey) return null;

    return crypto.subtle.exportKey("raw", this.encryptionKey);
  }

  /**
   * Import a previously exported encryption key
   */
  async importKey(keyData: ArrayBuffer): Promise<void> {
    this.encryptionKey = await crypto.subtle.importKey(
      "raw",
      keyData,
      { name: "AES-GCM", length: 256 },
      true,
      ["encrypt", "decrypt"],
    );
    this.config.encryptInTransit = true;
    this.initialized = true;
  }

  /**
   * Rotate the encryption key
   *
   * Call periodically for enhanced security.
   */
  async rotateKey(): Promise<void> {
    if (!this.config.encryptInTransit) return;

    this.encryptionKey = await crypto.subtle.generateKey(
      { name: "AES-GCM", length: 256 },
      true,
      ["encrypt", "decrypt"],
    );
  }

  // ==========================================================================
  // Configuration and Stats
  // ==========================================================================

  /**
   * Update configuration
   */
  updateConfig(config: Partial<PrivacyConfig>): void {
    this.config = { ...this.config, ...config };

    // Re-initialize if encryption settings changed
    if (
      config.encryptInTransit !== undefined ||
      config.encryptionKey !== undefined
    ) {
      this.initialized = false;
    }
  }

  /**
   * Get current configuration
   */
  getConfig(): PrivacyConfig {
    return { ...this.config };
  }

  /**
   * Get statistics
   */
  getStats(): {
    chunksEncrypted: number;
    chunksDecrypted: number;
    hashesGenerated: number;
    bytesProcessed: number;
    encryptionEnabled: boolean;
    telemetryEnabled: boolean;
  } {
    return {
      ...this.stats,
      encryptionEnabled: this.config.encryptInTransit && !!this.encryptionKey,
      telemetryEnabled: this.config.anonymizeTelemetry,
    };
  }

  /**
   * Reset statistics
   */
  resetStats(): void {
    this.stats = {
      chunksEncrypted: 0,
      chunksDecrypted: 0,
      hashesGenerated: 0,
      bytesProcessed: 0,
    };
  }

  /**
   * Dispose of resources
   */
  dispose(): void {
    this.encryptionKey = null;
    this.initialized = false;
    this.resetStats();
  }
}

// ============================================================================
// Factory Function
// ============================================================================

/**
 * Create a new PrivacyFilter with optional configuration
 */
export function createPrivacyFilter(
  config?: Partial<PrivacyConfig>,
): PrivacyFilter {
  return new PrivacyFilter(config);
}

/**
 * Create and initialize a PrivacyFilter
 */
export async function createInitializedPrivacyFilter(
  config?: Partial<PrivacyConfig>,
): Promise<PrivacyFilter> {
  const filter = new PrivacyFilter(config);
  await filter.initialize();
  return filter;
}
