/**
 * Encrypted IndexedDB Storage
 *
 * Uses Web Crypto API for AES-GCM encryption of sensitive data.
 * Keys are derived from user authentication tokens.
 *
 * Use cases:
 * - Offline voice recordings awaiting sync
 * - Cached clinical context
 * - Session state
 * - Audit logs pending sync
 *
 * @example
 * ```typescript
 * import { encryptedStorage } from '@/services/storage/EncryptedStorage';
 *
 * // Initialize with user token
 * await encryptedStorage.init(userToken);
 *
 * // Store encrypted data
 * await encryptedStorage.store('session-1', { messages: [] });
 *
 * // Retrieve decrypted data
 * const data = await encryptedStorage.retrieve('session-1');
 * ```
 */

import { openDB, IDBPDatabase } from "idb";
import {
  deriveKey,
  encrypt,
  decrypt,
  generateSalt,
  isCryptoAvailable,
  arrayBufferToBase64,
  base64ToArrayBuffer,
  uint8ArrayToBase64,
  base64ToUint8Array,
} from "./CryptoUtils";

/**
 * Storage schema types for IndexedDB
 */
interface EncryptedDataRecord {
  id: string;
  encryptedData: string; // Base64 encoded ciphertext
  iv: string; // Base64 encoded IV
  timestamp: number;
  metadata?: Record<string, unknown>;
  expiresAt?: number;
}

interface SessionAuditRecord {
  action: string;
  timestamp: number;
  details: Record<string, unknown>;
  synced: boolean;
  sessionId: string;
}

interface KeyStorageRecord {
  id: string;
  salt: string; // Base64 encoded salt
  createdAt: number;
}

/**
 * Database configuration
 */
const DB_NAME = "voiceassist-secure";
const DB_VERSION = 1;

/**
 * EncryptedStorage class
 */
export class EncryptedStorage {
  // Using unknown schema type for flexibility with IndexedDB
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  private db: IDBPDatabase<any> | null = null;
  private encryptionKey: CryptoKey | null = null;
  private isInitialized = false;
  private initPromise: Promise<void> | null = null;

  /**
   * Initialize the encrypted storage
   *
   * @param userToken - User authentication token for key derivation
   */
  async init(userToken: string): Promise<void> {
    // Prevent multiple initializations
    if (this.initPromise) {
      return this.initPromise;
    }

    this.initPromise = this._init(userToken);
    return this.initPromise;
  }

  private async _init(userToken: string): Promise<void> {
    // Check crypto availability
    if (!isCryptoAvailable()) {
      throw new Error("Web Crypto API is not available");
    }

    // Open database
    this.db = await openDB(DB_NAME, DB_VERSION, {
      upgrade(db) {
        // Create encrypted data store
        if (!db.objectStoreNames.contains("encrypted-data")) {
          const dataStore = db.createObjectStore("encrypted-data", {
            keyPath: "id",
          });
          dataStore.createIndex("by-timestamp", "timestamp");
          dataStore.createIndex("by-expires", "expiresAt");
        }

        // Create session audit store
        if (!db.objectStoreNames.contains("session-audit")) {
          const auditStore = db.createObjectStore("session-audit", {
            keyPath: "id",
            autoIncrement: true,
          });
          auditStore.createIndex("by-synced", "synced");
          auditStore.createIndex("by-session", "sessionId");
          auditStore.createIndex("by-timestamp", "timestamp");
        }

        // Create key storage
        if (!db.objectStoreNames.contains("key-storage")) {
          db.createObjectStore("key-storage", { keyPath: "id" });
        }
      },
    });

    // Get or create salt
    const saltRecord = await this.db.get("key-storage", "encryption-salt");
    let salt: Uint8Array<ArrayBuffer>;

    if (saltRecord) {
      salt = base64ToUint8Array(saltRecord.salt);
    } else {
      salt = generateSalt();
      await this.db.put("key-storage", {
        id: "encryption-salt",
        salt: uint8ArrayToBase64(salt),
        createdAt: Date.now(),
      });
    }

    // Derive encryption key
    this.encryptionKey = await deriveKey(userToken, salt);
    this.isInitialized = true;
  }

  /**
   * Check if storage is initialized
   */
  get initialized(): boolean {
    return this.isInitialized;
  }

  /**
   * Ensure storage is initialized before operations
   */
  private ensureInitialized(): void {
    if (!this.db || !this.encryptionKey) {
      throw new Error("EncryptedStorage not initialized. Call init() first.");
    }
  }

  /**
   * Store encrypted data
   *
   * @param id - Unique identifier for the data
   * @param data - Data to encrypt and store
   * @param options - Storage options
   */
  async store(
    id: string,
    data: unknown,
    options: {
      metadata?: Record<string, unknown>;
      expiresIn?: number; // Milliseconds until expiration
    } = {},
  ): Promise<void> {
    this.ensureInitialized();

    const encrypted = await encrypt(data, this.encryptionKey!);

    await this.db!.put("encrypted-data", {
      id,
      encryptedData: arrayBufferToBase64(encrypted.ciphertext),
      iv: uint8ArrayToBase64(encrypted.iv),
      timestamp: Date.now(),
      metadata: options.metadata,
      expiresAt: options.expiresIn ? Date.now() + options.expiresIn : undefined,
    });
  }

  /**
   * Retrieve and decrypt data
   *
   * @param id - Identifier of the data to retrieve
   * @returns Decrypted data or null if not found
   */
  async retrieve<T>(id: string): Promise<T | null> {
    this.ensureInitialized();

    const record = await this.db!.get("encrypted-data", id);
    if (!record) {
      return null;
    }

    // Check expiration
    if (record.expiresAt && record.expiresAt < Date.now()) {
      await this.delete(id);
      return null;
    }

    try {
      return await decrypt<T>(
        {
          ciphertext: base64ToArrayBuffer(record.encryptedData),
          iv: base64ToUint8Array(record.iv),
        },
        this.encryptionKey!,
      );
    } catch (error) {
      console.error("[EncryptedStorage] Decryption failed:", error);
      return null;
    }
  }

  /**
   * Delete stored data
   *
   * @param id - Identifier of the data to delete
   */
  async delete(id: string): Promise<void> {
    this.ensureInitialized();
    await this.db!.delete("encrypted-data", id);
  }

  /**
   * Check if data exists
   *
   * @param id - Identifier to check
   */
  async has(id: string): Promise<boolean> {
    this.ensureInitialized();
    const record = await this.db!.get("encrypted-data", id);
    return record !== undefined;
  }

  /**
   * Get all stored data IDs
   */
  async getAllIds(): Promise<string[]> {
    this.ensureInitialized();
    return this.db!.getAllKeys("encrypted-data");
  }

  /**
   * Get metadata for stored data without decrypting
   */
  async getMetadata(id: string): Promise<{
    timestamp: number;
    metadata?: Record<string, unknown>;
    expiresAt?: number;
  } | null> {
    this.ensureInitialized();

    const record = await this.db!.get("encrypted-data", id);
    if (!record) {
      return null;
    }

    return {
      timestamp: record.timestamp,
      metadata: record.metadata,
      expiresAt: record.expiresAt,
    };
  }

  /**
   * Log an audit event
   */
  async logAuditEvent(
    action: string,
    details: Record<string, unknown>,
    sessionId: string,
  ): Promise<void> {
    this.ensureInitialized();

    await this.db!.add("session-audit", {
      action,
      timestamp: Date.now(),
      details,
      synced: false,
      sessionId,
    });
  }

  /**
   * Get unsynced audit events
   */
  async getUnsyncedAuditEvents(): Promise<
    Array<{
      id: number;
      action: string;
      timestamp: number;
      details: Record<string, unknown>;
      sessionId: string;
    }>
  > {
    this.ensureInitialized();

    const results: Array<{
      id: number;
      action: string;
      timestamp: number;
      details: Record<string, unknown>;
      sessionId: string;
    }> = [];

    const tx = this.db!.transaction("session-audit", "readonly");
    const index = tx.store.index("by-synced");
    let cursor = await index.openCursor(IDBKeyRange.only(false));

    while (cursor) {
      results.push({
        id: cursor.primaryKey as number,
        action: cursor.value.action,
        timestamp: cursor.value.timestamp,
        details: cursor.value.details,
        sessionId: cursor.value.sessionId,
      });
      cursor = await cursor.continue();
    }

    return results;
  }

  /**
   * Mark audit events as synced
   */
  async markAuditEventsSynced(ids: number[]): Promise<void> {
    this.ensureInitialized();

    const tx = this.db!.transaction("session-audit", "readwrite");
    for (const id of ids) {
      const event = await tx.store.get(id);
      if (event) {
        await tx.store.put({ ...event, synced: true });
      }
    }
    await tx.done;
  }

  /**
   * Get audit events for a session
   */
  async getSessionAuditEvents(sessionId: string): Promise<
    Array<{
      action: string;
      timestamp: number;
      details: Record<string, unknown>;
    }>
  > {
    this.ensureInitialized();

    const events = await this.db!.getAllFromIndex(
      "session-audit",
      "by-session",
      sessionId,
    );
    return events.map((e) => ({
      action: e.action,
      timestamp: e.timestamp,
      details: e.details,
    }));
  }

  /**
   * Clean up expired data
   */
  async cleanupExpired(): Promise<number> {
    this.ensureInitialized();

    const now = Date.now();
    let deleted = 0;

    const tx = this.db!.transaction("encrypted-data", "readwrite");
    let cursor = await tx.store.index("by-expires").openCursor();

    while (cursor) {
      if (cursor.value.expiresAt && cursor.value.expiresAt < now) {
        await cursor.delete();
        deleted++;
      }
      cursor = await cursor.continue();
    }

    await tx.done;
    return deleted;
  }

  /**
   * Clear all stored data (for logout)
   */
  async clear(): Promise<void> {
    this.ensureInitialized();

    await this.db!.clear("encrypted-data");
    await this.db!.clear("session-audit");
  }

  /**
   * Close the database connection
   */
  close(): void {
    if (this.db) {
      this.db.close();
      this.db = null;
      this.encryptionKey = null;
      this.isInitialized = false;
      this.initPromise = null;
    }
  }

  /**
   * Get storage statistics
   */
  async getStats(): Promise<{
    dataCount: number;
    auditCount: number;
    unsyncedAuditCount: number;
  }> {
    this.ensureInitialized();

    const dataCount = await this.db!.count("encrypted-data");
    const auditCount = await this.db!.count("session-audit");
    const unsyncedAuditCount = await this.db!.countFromIndex(
      "session-audit",
      "by-synced",
      false,
    );

    return {
      dataCount,
      auditCount,
      unsyncedAuditCount,
    };
  }
}

/**
 * Singleton instance
 */
export const encryptedStorage = new EncryptedStorage();
