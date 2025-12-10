/**
 * Encrypted Storage Hook
 *
 * React hook for using encrypted IndexedDB storage.
 *
 * @example
 * ```typescript
 * const { store, retrieve, isReady, isLoading } = useEncryptedStorage();
 *
 * // Store data
 * await store('my-key', { secret: 'data' });
 *
 * // Retrieve data
 * const data = await retrieve('my-key');
 * ```
 */

import { useState, useCallback, useEffect, useRef } from "react";
import { encryptedStorage } from "../services/storage";

/**
 * Options for the encrypted storage hook
 */
export interface UseEncryptedStorageOptions {
  /** User token for encryption key derivation */
  userToken?: string;
  /** Whether to auto-initialize when userToken is provided */
  autoInit?: boolean;
  /** Callback when storage is initialized */
  onInitialized?: () => void;
  /** Callback on initialization error */
  onError?: (error: Error) => void;
}

/**
 * Return type for the encrypted storage hook
 */
export interface UseEncryptedStorageReturn {
  /** Whether storage is initialized and ready */
  isReady: boolean;
  /** Whether an operation is in progress */
  isLoading: boolean;
  /** Any error that occurred */
  error: Error | null;
  /** Initialize storage with user token */
  init: (userToken: string) => Promise<void>;
  /** Store encrypted data */
  store: <T>(
    key: string,
    data: T,
    options?: { metadata?: Record<string, unknown>; expiresIn?: number },
  ) => Promise<void>;
  /** Retrieve and decrypt data */
  retrieve: <T>(key: string) => Promise<T | null>;
  /** Delete stored data */
  remove: (key: string) => Promise<void>;
  /** Check if key exists */
  has: (key: string) => Promise<boolean>;
  /** Get all stored keys */
  getAllKeys: () => Promise<string[]>;
  /** Get metadata for a key */
  getMetadata: (key: string) => Promise<{
    timestamp: number;
    metadata?: Record<string, unknown>;
    expiresAt?: number;
  } | null>;
  /** Clear all stored data */
  clear: () => Promise<void>;
  /** Clean up expired data */
  cleanupExpired: () => Promise<number>;
  /** Get storage statistics */
  getStats: () => Promise<{
    dataCount: number;
    auditCount: number;
    unsyncedAuditCount: number;
  }>;
}

/**
 * Encrypted Storage Hook
 */
export function useEncryptedStorage(
  options: UseEncryptedStorageOptions = {},
): UseEncryptedStorageReturn {
  const { userToken, autoInit = true, onInitialized, onError } = options;

  const [isReady, setIsReady] = useState(encryptedStorage.initialized);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<Error | null>(null);

  // Refs for callbacks
  const onInitializedRef = useRef(onInitialized);
  const onErrorRef = useRef(onError);

  useEffect(() => {
    onInitializedRef.current = onInitialized;
    onErrorRef.current = onError;
  }, [onInitialized, onError]);

  // Auto-initialize if token provided
  useEffect(() => {
    if (autoInit && userToken && !isReady) {
      init(userToken);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [autoInit, userToken]);

  // Initialize storage
  const init = useCallback(async (token: string): Promise<void> => {
    setIsLoading(true);
    setError(null);

    try {
      await encryptedStorage.init(token);
      setIsReady(true);
      onInitializedRef.current?.();
    } catch (err) {
      const error = err instanceof Error ? err : new Error(String(err));
      setError(error);
      onErrorRef.current?.(error);
      throw error;
    } finally {
      setIsLoading(false);
    }
  }, []);

  // Store data
  const store = useCallback(
    async <T>(
      key: string,
      data: T,
      storeOptions?: { metadata?: Record<string, unknown>; expiresIn?: number },
    ): Promise<void> => {
      if (!isReady) {
        throw new Error("Storage not initialized");
      }

      setIsLoading(true);
      try {
        await encryptedStorage.store(key, data, storeOptions);
      } finally {
        setIsLoading(false);
      }
    },
    [isReady],
  );

  // Retrieve data
  const retrieve = useCallback(
    async <T>(key: string): Promise<T | null> => {
      if (!isReady) {
        throw new Error("Storage not initialized");
      }

      setIsLoading(true);
      try {
        return await encryptedStorage.retrieve<T>(key);
      } finally {
        setIsLoading(false);
      }
    },
    [isReady],
  );

  // Delete data
  const remove = useCallback(
    async (key: string): Promise<void> => {
      if (!isReady) {
        throw new Error("Storage not initialized");
      }

      await encryptedStorage.delete(key);
    },
    [isReady],
  );

  // Check if key exists
  const has = useCallback(
    async (key: string): Promise<boolean> => {
      if (!isReady) {
        throw new Error("Storage not initialized");
      }

      return encryptedStorage.has(key);
    },
    [isReady],
  );

  // Get all keys
  const getAllKeys = useCallback(async (): Promise<string[]> => {
    if (!isReady) {
      throw new Error("Storage not initialized");
    }

    return encryptedStorage.getAllIds();
  }, [isReady]);

  // Get metadata
  const getMetadata = useCallback(
    async (
      key: string,
    ): Promise<{
      timestamp: number;
      metadata?: Record<string, unknown>;
      expiresAt?: number;
    } | null> => {
      if (!isReady) {
        throw new Error("Storage not initialized");
      }

      return encryptedStorage.getMetadata(key);
    },
    [isReady],
  );

  // Clear all data
  const clear = useCallback(async (): Promise<void> => {
    if (!isReady) {
      throw new Error("Storage not initialized");
    }

    await encryptedStorage.clear();
  }, [isReady]);

  // Cleanup expired data
  const cleanupExpired = useCallback(async (): Promise<number> => {
    if (!isReady) {
      throw new Error("Storage not initialized");
    }

    return encryptedStorage.cleanupExpired();
  }, [isReady]);

  // Get statistics
  const getStats = useCallback(async () => {
    if (!isReady) {
      throw new Error("Storage not initialized");
    }

    return encryptedStorage.getStats();
  }, [isReady]);

  return {
    isReady,
    isLoading,
    error,
    init,
    store,
    retrieve,
    remove,
    has,
    getAllKeys,
    getMetadata,
    clear,
    cleanupExpired,
    getStats,
  };
}

/**
 * Simple hook for checking if storage is available
 */
export function useStorageStatus() {
  const [isAvailable, setIsAvailable] = useState(false);

  useEffect(() => {
    // Check if IndexedDB and Web Crypto are available
    const checkAvailability = async () => {
      try {
        const hasIndexedDB = typeof indexedDB !== "undefined";
        const hasCrypto =
          typeof crypto !== "undefined" && crypto.subtle !== undefined;
        setIsAvailable(hasIndexedDB && hasCrypto);
      } catch {
        setIsAvailable(false);
      }
    };

    checkAvailability();
  }, []);

  return { isAvailable, isInitialized: encryptedStorage.initialized };
}
