/**
 * TTS Cache Manager
 *
 * Manages caching of TTS audio responses using IndexedDB
 * for offline playback and reduced latency.
 *
 * Phase 9: Offline & Low-Latency Fallback
 */

import type { TTSCacheConfig, TTSCacheEntry, TTSCacheStats } from "./types";
import { DEFAULT_TTS_CACHE_CONFIG, COMMON_TTS_PHRASES } from "./types";

// ============================================================================
// TTS Cache Manager
// ============================================================================

/**
 * Manages TTS audio caching with IndexedDB persistence
 */
export class TTSCacheManager {
  private config: TTSCacheConfig;

  /** In-memory cache for fast access */
  private memoryCache: Map<string, TTSCacheEntry> = new Map();

  /** Current total size in bytes */
  private currentSizeBytes = 0;

  /** Cache statistics */
  private stats = {
    hits: 0,
    misses: 0,
  };

  /** IndexedDB instance */
  private db: IDBDatabase | null = null;

  /** Initialization promise */
  private initPromise: Promise<void> | null = null;

  constructor(config: Partial<TTSCacheConfig> = {}) {
    this.config = { ...DEFAULT_TTS_CACHE_CONFIG, ...config };
  }

  // ==========================================================================
  // Initialization
  // ==========================================================================

  /**
   * Initialize the cache (opens IndexedDB)
   */
  async initialize(): Promise<void> {
    if (this.initPromise) {
      return this.initPromise;
    }

    this.initPromise = this.openDatabase();
    await this.initPromise;

    // Load existing entries into memory cache
    await this.loadFromDatabase();
  }

  /**
   * Open IndexedDB database
   */
  private openDatabase(): Promise<void> {
    return new Promise((resolve, reject) => {
      const request = indexedDB.open(this.config.dbName, 1);

      request.onerror = () => {
        console.warn("[TTSCache] Failed to open database:", request.error);
        // Continue without persistence
        resolve();
      };

      request.onupgradeneeded = (event) => {
        const db = (event.target as IDBOpenDBRequest).result;

        if (!db.objectStoreNames.contains(this.config.storeName)) {
          const store = db.createObjectStore(this.config.storeName, {
            keyPath: "key",
          });

          // Create indexes for efficient queries
          store.createIndex("createdAt", "createdAt", { unique: false });
          store.createIndex("lastAccessedAt", "lastAccessedAt", {
            unique: false,
          });
          store.createIndex("accessCount", "accessCount", { unique: false });
        }
      };

      request.onsuccess = () => {
        this.db = request.result;
        resolve();
      };
    });
  }

  /**
   * Load entries from IndexedDB into memory cache
   */
  private async loadFromDatabase(): Promise<void> {
    if (!this.db) return;

    return new Promise((resolve, reject) => {
      const transaction = this.db!.transaction(
        this.config.storeName,
        "readonly",
      );
      const store = transaction.objectStore(this.config.storeName);
      const request = store.getAll();

      request.onsuccess = () => {
        const entries = request.result as TTSCacheEntry[];
        const now = Date.now();

        for (const entry of entries) {
          // Skip expired entries
          if (now - entry.createdAt > this.config.maxAge) {
            this.deleteFromDatabase(entry.key);
            continue;
          }

          this.memoryCache.set(entry.key, entry);
          this.currentSizeBytes += entry.sizeBytes;
        }

        resolve();
      };

      request.onerror = () => {
        console.warn("[TTSCache] Failed to load entries:", request.error);
        resolve();
      };
    });
  }

  // ==========================================================================
  // Cache Operations
  // ==========================================================================

  /**
   * Generate cache key from text and voice
   */
  private getCacheKey(text: string, voice: string): string {
    const normalizedText = text.toLowerCase().trim();
    return `${voice}:${normalizedText}`;
  }

  /**
   * Get cached audio for text
   */
  async get(text: string, voice: string): Promise<ArrayBuffer | null> {
    const key = this.getCacheKey(text, voice);
    const entry = this.memoryCache.get(key);

    if (!entry) {
      this.stats.misses++;
      return null;
    }

    // Check expiration
    if (Date.now() - entry.createdAt > this.config.maxAge) {
      await this.delete(key);
      this.stats.misses++;
      return null;
    }

    // Update access stats
    entry.lastAccessedAt = Date.now();
    entry.accessCount++;
    this.stats.hits++;

    // Update in database (fire and forget)
    this.updateInDatabase(entry);

    return entry.audioBuffer;
  }

  /**
   * Cache audio for text
   */
  async set(
    text: string,
    voice: string,
    audioBuffer: ArrayBuffer,
    duration?: number,
  ): Promise<void> {
    const key = this.getCacheKey(text, voice);
    const sizeBytes = audioBuffer.byteLength;

    // Evict entries if needed to make room
    await this.ensureSpace(sizeBytes);

    const entry: TTSCacheEntry = {
      key,
      text,
      voice,
      audioBuffer,
      createdAt: Date.now(),
      lastAccessedAt: Date.now(),
      accessCount: 0,
      duration: duration || 0,
      sizeBytes,
    };

    // Add to memory cache
    this.memoryCache.set(key, entry);
    this.currentSizeBytes += sizeBytes;

    // Save to database
    await this.saveToDatabase(entry);
  }

  /**
   * Check if text is cached
   */
  has(text: string, voice: string): boolean {
    const key = this.getCacheKey(text, voice);
    const entry = this.memoryCache.get(key);

    if (!entry) return false;

    // Check expiration
    if (Date.now() - entry.createdAt > this.config.maxAge) {
      this.delete(key);
      return false;
    }

    return true;
  }

  /**
   * Delete a cache entry
   */
  async delete(key: string): Promise<void> {
    const entry = this.memoryCache.get(key);

    if (entry) {
      this.currentSizeBytes -= entry.sizeBytes;
      this.memoryCache.delete(key);
    }

    await this.deleteFromDatabase(key);
  }

  /**
   * Clear all cache entries
   */
  async clear(): Promise<void> {
    this.memoryCache.clear();
    this.currentSizeBytes = 0;
    this.stats.hits = 0;
    this.stats.misses = 0;

    if (this.db) {
      return new Promise((resolve, reject) => {
        const transaction = this.db!.transaction(
          this.config.storeName,
          "readwrite",
        );
        const store = transaction.objectStore(this.config.storeName);
        const request = store.clear();

        request.onsuccess = () => resolve();
        request.onerror = () => {
          console.warn("[TTSCache] Failed to clear:", request.error);
          resolve();
        };
      });
    }
  }

  // ==========================================================================
  // Eviction
  // ==========================================================================

  /**
   * Ensure there's enough space for new entry
   */
  private async ensureSpace(requiredBytes: number): Promise<void> {
    const maxBytes = this.config.maxSizeMB * 1024 * 1024;

    while (this.currentSizeBytes + requiredBytes > maxBytes) {
      const evicted = await this.evictLeastUsed();
      if (!evicted) break; // No more entries to evict
    }
  }

  /**
   * Evict the least recently used entry
   */
  private async evictLeastUsed(): Promise<boolean> {
    if (this.memoryCache.size === 0) return false;

    let lruKey: string | null = null;
    let lruAccessTime = Infinity;
    let lruAccessCount = Infinity;

    // Find entry with oldest access time and lowest access count
    for (const [key, entry] of this.memoryCache.entries()) {
      const score = entry.lastAccessedAt + entry.accessCount * 1000;
      if (score < lruAccessTime + lruAccessCount * 1000) {
        lruKey = key;
        lruAccessTime = entry.lastAccessedAt;
        lruAccessCount = entry.accessCount;
      }
    }

    if (lruKey) {
      await this.delete(lruKey);
      return true;
    }

    return false;
  }

  // ==========================================================================
  // Database Operations
  // ==========================================================================

  /**
   * Save entry to IndexedDB
   */
  private async saveToDatabase(entry: TTSCacheEntry): Promise<void> {
    if (!this.db) return;

    return new Promise((resolve, reject) => {
      const transaction = this.db!.transaction(
        this.config.storeName,
        "readwrite",
      );
      const store = transaction.objectStore(this.config.storeName);
      const request = store.put(entry);

      request.onsuccess = () => resolve();
      request.onerror = () => {
        console.warn("[TTSCache] Failed to save entry:", request.error);
        resolve();
      };
    });
  }

  /**
   * Update entry in IndexedDB
   */
  private async updateInDatabase(entry: TTSCacheEntry): Promise<void> {
    // Same as save, IndexedDB put will update existing
    await this.saveToDatabase(entry);
  }

  /**
   * Delete entry from IndexedDB
   */
  private async deleteFromDatabase(key: string): Promise<void> {
    if (!this.db) return;

    return new Promise((resolve, reject) => {
      const transaction = this.db!.transaction(
        this.config.storeName,
        "readwrite",
      );
      const store = transaction.objectStore(this.config.storeName);
      const request = store.delete(key);

      request.onsuccess = () => resolve();
      request.onerror = () => {
        console.warn("[TTSCache] Failed to delete entry:", request.error);
        resolve();
      };
    });
  }

  // ==========================================================================
  // Preloading
  // ==========================================================================

  /**
   * Preload common phrases for fast playback
   */
  async preloadCommonPhrases(
    voice: string,
    ttsFunction: (text: string) => Promise<ArrayBuffer>,
    options: {
      concurrency?: number;
      onProgress?: (done: number, total: number) => void;
    } = {},
  ): Promise<void> {
    if (!this.config.cacheCommonPhrases) return;

    const { concurrency = 3, onProgress } = options;
    const phrases = [...COMMON_TTS_PHRASES];
    let completed = 0;

    // Filter out already cached phrases
    const uncachedPhrases = phrases.filter(
      (phrase) => !this.has(phrase, voice),
    );

    if (uncachedPhrases.length === 0) {
      onProgress?.(phrases.length, phrases.length);
      return;
    }

    // Process in batches for controlled concurrency
    for (let i = 0; i < uncachedPhrases.length; i += concurrency) {
      const batch = uncachedPhrases.slice(i, i + concurrency);

      await Promise.allSettled(
        batch.map(async (phrase) => {
          try {
            const audio = await ttsFunction(phrase);
            await this.set(phrase, voice, audio);
            completed++;
            onProgress?.(completed, uncachedPhrases.length);
          } catch (error) {
            console.warn(`[TTSCache] Failed to preload: ${phrase}`, error);
          }
        }),
      );
    }
  }

  /**
   * Preload custom phrases
   */
  async preloadPhrases(
    phrases: string[],
    voice: string,
    ttsFunction: (text: string) => Promise<ArrayBuffer>,
  ): Promise<void> {
    for (const phrase of phrases) {
      if (!this.has(phrase, voice)) {
        try {
          const audio = await ttsFunction(phrase);
          await this.set(phrase, voice, audio);
        } catch (error) {
          console.warn(`[TTSCache] Failed to preload: ${phrase}`, error);
        }
      }
    }
  }

  // ==========================================================================
  // Statistics
  // ==========================================================================

  /**
   * Get cache statistics
   */
  getStats(): TTSCacheStats {
    let oldestAge = 0;
    let mostAccessedEntry: string | null = null;
    let maxAccessCount = 0;

    for (const entry of this.memoryCache.values()) {
      const age = Date.now() - entry.createdAt;
      if (age > oldestAge) {
        oldestAge = age;
      }

      if (entry.accessCount > maxAccessCount) {
        maxAccessCount = entry.accessCount;
        mostAccessedEntry = entry.text;
      }
    }

    const totalRequests = this.stats.hits + this.stats.misses;

    return {
      entryCount: this.memoryCache.size,
      sizeMB: this.currentSizeBytes / (1024 * 1024),
      hitRate: totalRequests > 0 ? this.stats.hits / totalRequests : 0,
      totalHits: this.stats.hits,
      totalMisses: this.stats.misses,
      oldestEntryAge: oldestAge,
      mostAccessedEntry,
    };
  }

  /**
   * Get current size in MB
   */
  getSizeMB(): number {
    return this.currentSizeBytes / (1024 * 1024);
  }

  /**
   * Get entry count
   */
  getEntryCount(): number {
    return this.memoryCache.size;
  }

  // ==========================================================================
  // Lifecycle
  // ==========================================================================

  /**
   * Close database connection
   */
  close(): void {
    if (this.db) {
      this.db.close();
      this.db = null;
    }
  }
}

// ============================================================================
// Factory Function
// ============================================================================

/**
 * Create and initialize a TTS cache manager
 */
export async function createTTSCacheManager(
  config?: Partial<TTSCacheConfig>,
): Promise<TTSCacheManager> {
  const manager = new TTSCacheManager(config);
  await manager.initialize();
  return manager;
}
