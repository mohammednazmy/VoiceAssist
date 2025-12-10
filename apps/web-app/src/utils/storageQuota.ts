/**
 * Storage Quota Utilities
 *
 * Provides functions for checking and managing browser storage quota.
 * Used for monitoring IndexedDB usage for offline recordings.
 *
 * @module utils/storageQuota
 */

export interface StorageQuotaInfo {
  used: number;
  quota: number;
  percentage: number;
}

/**
 * Get current storage usage and quota.
 * Uses the Storage API when available, falls back to estimates.
 */
export async function getStorageQuota(): Promise<StorageQuotaInfo> {
  try {
    // Use Storage API if available (modern browsers)
    if ("storage" in navigator && "estimate" in navigator.storage) {
      const estimate = await navigator.storage.estimate();
      const used = estimate.usage || 0;
      const quota = estimate.quota || 0;
      const percentage = quota > 0 ? (used / quota) * 100 : 0;

      return {
        used,
        quota,
        percentage: Math.round(percentage * 100) / 100,
      };
    }

    // Fallback: estimate from IndexedDB size
    const dbSize = await estimateIndexedDBSize("voiceassist-offline");
    const defaultQuota = 50 * 1024 * 1024; // Assume 50MB default

    return {
      used: dbSize,
      quota: defaultQuota,
      percentage: Math.round((dbSize / defaultQuota) * 100 * 100) / 100,
    };
  } catch (error) {
    console.error("Failed to get storage quota:", error);
    return {
      used: 0,
      quota: 50 * 1024 * 1024,
      percentage: 0,
    };
  }
}

/**
 * Request persistent storage to prevent eviction.
 * Returns true if persistent storage was granted.
 */
export async function requestPersistentStorage(): Promise<boolean> {
  try {
    if ("storage" in navigator && "persist" in navigator.storage) {
      const isPersisted = await navigator.storage.persisted();
      if (isPersisted) {
        return true;
      }
      return await navigator.storage.persist();
    }
    return false;
  } catch (error) {
    console.error("Failed to request persistent storage:", error);
    return false;
  }
}

/**
 * Check if storage is persisted.
 */
export async function isStoragePersisted(): Promise<boolean> {
  try {
    if ("storage" in navigator && "persisted" in navigator.storage) {
      return await navigator.storage.persisted();
    }
    return false;
  } catch {
    return false;
  }
}

/**
 * Estimate IndexedDB size by iterating through all records.
 * This is a fallback for browsers that don't support Storage API.
 */
async function estimateIndexedDBSize(dbName: string): Promise<number> {
  return new Promise((resolve) => {
    const request = indexedDB.open(dbName);

    request.onerror = () => resolve(0);
    request.onsuccess = () => {
      const db = request.result;
      let totalSize = 0;

      const storeNames = Array.from(db.objectStoreNames);
      if (storeNames.length === 0) {
        db.close();
        resolve(0);
        return;
      }

      let processedStores = 0;

      for (const storeName of storeNames) {
        try {
          const tx = db.transaction(storeName, "readonly");
          const store = tx.objectStore(storeName);
          const getAllRequest = store.getAll();

          getAllRequest.onsuccess = () => {
            const records = getAllRequest.result || [];
            for (const record of records) {
              // Estimate size by serializing (rough estimate)
              if (record.audioBlob instanceof Blob) {
                totalSize += record.audioBlob.size;
              }
              totalSize += JSON.stringify(record).length;
            }

            processedStores++;
            if (processedStores === storeNames.length) {
              db.close();
              resolve(totalSize);
            }
          };

          getAllRequest.onerror = () => {
            processedStores++;
            if (processedStores === storeNames.length) {
              db.close();
              resolve(totalSize);
            }
          };
        } catch {
          processedStores++;
          if (processedStores === storeNames.length) {
            db.close();
            resolve(totalSize);
          }
        }
      }
    };
  });
}

/**
 * Clear all offline recordings from IndexedDB.
 * Use with caution - this is destructive.
 */
export async function clearOfflineStorage(
  dbName: string = "voiceassist-offline",
): Promise<void> {
  return new Promise((resolve, reject) => {
    const request = indexedDB.deleteDatabase(dbName);
    request.onerror = () => reject(request.error);
    request.onsuccess = () => resolve();
    request.onblocked = () => {
      console.warn("Database deletion blocked - close all connections first");
      resolve();
    };
  });
}

/**
 * Check if storage quota is running low (> 80% used).
 */
export async function isStorageLow(): Promise<boolean> {
  const info = await getStorageQuota();
  return info.percentage > 80;
}

/**
 * Check if storage quota is critical (> 95% used).
 */
export async function isStorageCritical(): Promise<boolean> {
  const info = await getStorageQuota();
  return info.percentage > 95;
}

/**
 * Format bytes to human-readable string.
 */
export function formatStorageSize(bytes: number): string {
  if (bytes === 0) return "0 B";
  const k = 1024;
  const sizes = ["B", "KB", "MB", "GB"];
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  return `${parseFloat((bytes / Math.pow(k, i)).toFixed(1))} ${sizes[i]}`;
}
