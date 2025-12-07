/**
 * VoiceAssist Service Worker
 *
 * Provides:
 * - Background sync for offline voice recordings
 * - Cache-first strategy for static assets
 * - Offline fallback page
 *
 * @module sw
 */

const CACHE_NAME = "voiceassist-v3";
const OFFLINE_URL = "/offline.html";

// Static assets to cache
const STATIC_ASSETS = ["/", "/offline.html", "/manifest.json"];

// Install event - cache static assets
self.addEventListener("install", (event) => {
  console.log("[ServiceWorker] Install");
  event.waitUntil(
    caches.open(CACHE_NAME).then((cache) => {
      console.log("[ServiceWorker] Caching static assets");
      return cache.addAll(STATIC_ASSETS);
    }),
  );
  // Force waiting service worker to become active
  self.skipWaiting();
});

// Activate event - cleanup old caches
self.addEventListener("activate", (event) => {
  console.log("[ServiceWorker] Activate");
  event.waitUntil(
    caches.keys().then((cacheNames) => {
      return Promise.all(
        cacheNames
          .filter((name) => name !== CACHE_NAME)
          .map((name) => {
            console.log("[ServiceWorker] Deleting old cache:", name);
            return caches.delete(name);
          }),
      );
    }),
  );
  // Claim all open clients
  self.clients.claim();
});

// Fetch event - network first with cache fallback
self.addEventListener("fetch", (event) => {
  // Skip non-GET requests
  if (event.request.method !== "GET") {
    return;
  }

  // Skip API requests - they should fail and be handled by the app
  if (event.request.url.includes("/api/")) {
    return;
  }

  event.respondWith(
    fetch(event.request)
      .then((response) => {
        // Clone the response before caching
        const responseClone = response.clone();
        caches.open(CACHE_NAME).then((cache) => {
          cache.put(event.request, responseClone);
        });
        return response;
      })
      .catch(async () => {
        // Try cache
        const cachedResponse = await caches.match(event.request);
        if (cachedResponse) {
          return cachedResponse;
        }

        // For navigation requests, return offline page
        if (event.request.mode === "navigate") {
          return caches.match(OFFLINE_URL);
        }

        return new Response("Offline", {
          status: 503,
          statusText: "Service Unavailable",
        });
      }),
  );
});

// Background sync event - sync offline recordings
self.addEventListener("sync", (event) => {
  console.log("[ServiceWorker] Sync event:", event.tag);

  if (event.tag === "sync-offline-recordings") {
    event.waitUntil(syncOfflineRecordings());
  }
});

/**
 * Sync offline recordings from IndexedDB to the server
 */
async function syncOfflineRecordings() {
  console.log("[ServiceWorker] Starting background sync of recordings");

  try {
    const db = await openDB();
    const recordings = await getPendingRecordings(db);

    if (recordings.length === 0) {
      console.log("[ServiceWorker] No pending recordings to sync");
      return;
    }

    console.log(`[ServiceWorker] Syncing ${recordings.length} recording(s)`);

    for (const recording of recordings) {
      try {
        await uploadRecording(recording);
        await deleteRecording(db, recording.id);
        console.log(`[ServiceWorker] Synced recording ${recording.id}`);

        // Notify the client
        await notifyClients({
          type: "RECORDING_SYNCED",
          recordingId: recording.id,
        });
      } catch (error) {
        console.error(
          `[ServiceWorker] Failed to sync recording ${recording.id}:`,
          error,
        );

        // Update retry count
        recording.retryCount = (recording.retryCount || 0) + 1;
        recording.status = "failed";
        await updateRecording(db, recording);
      }
    }

    db.close();
    console.log("[ServiceWorker] Background sync complete");
  } catch (error) {
    console.error("[ServiceWorker] Background sync failed:", error);
    throw error; // Rethrow to retry
  }
}

/**
 * Open IndexedDB database
 */
function openDB() {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open("voiceassist-offline", 1);
    request.onerror = () => reject(request.error);
    request.onsuccess = () => resolve(request.result);
    request.onupgradeneeded = (event) => {
      const db = event.target.result;
      if (!db.objectStoreNames.contains("recordings")) {
        const store = db.createObjectStore("recordings", { keyPath: "id" });
        store.createIndex("status", "status", { unique: false });
      }
    };
  });
}

/**
 * Get pending recordings from IndexedDB
 */
function getPendingRecordings(db) {
  return new Promise((resolve, reject) => {
    const tx = db.transaction("recordings", "readonly");
    const store = tx.objectStore("recordings");
    const index = store.index("status");
    const request = index.getAll("pending");
    request.onerror = () => reject(request.error);
    request.onsuccess = () => resolve(request.result);
  });
}

/**
 * Update recording in IndexedDB
 */
function updateRecording(db, recording) {
  return new Promise((resolve, reject) => {
    const tx = db.transaction("recordings", "readwrite");
    const store = tx.objectStore("recordings");
    const request = store.put(recording);
    request.onerror = () => reject(request.error);
    request.onsuccess = () => resolve();
  });
}

/**
 * Delete recording from IndexedDB
 */
function deleteRecording(db, id) {
  return new Promise((resolve, reject) => {
    const tx = db.transaction("recordings", "readwrite");
    const store = tx.objectStore("recordings");
    const request = store.delete(id);
    request.onerror = () => reject(request.error);
    request.onsuccess = () => resolve();
  });
}

/**
 * Upload recording to server
 */
async function uploadRecording(recording) {
  const formData = new FormData();
  formData.append(
    "audio",
    recording.audioBlob,
    `recording_${recording.id}.webm`,
  );
  formData.append("conversationId", recording.conversationId);

  const response = await fetch("/api/voice/transcribe", {
    method: "POST",
    body: formData,
  });

  if (!response.ok) {
    throw new Error(`Upload failed: ${response.status}`);
  }

  return response.json();
}

/**
 * Send message to all clients
 */
async function notifyClients(message) {
  const clients = await self.clients.matchAll({ type: "window" });
  for (const client of clients) {
    client.postMessage(message);
  }
}

// Periodic sync (if supported) - check for pending recordings
self.addEventListener("periodicsync", (event) => {
  if (event.tag === "check-pending-recordings") {
    event.waitUntil(syncOfflineRecordings());
  }
});

// Push notification handler (for future use)
self.addEventListener("push", (event) => {
  const data = event.data?.json() || {};
  const title = data.title || "VoiceAssist";
  const options = {
    body: data.body || "You have a new notification",
    icon: "/logo-192.png",
    badge: "/logo-72.png",
    tag: data.tag || "default",
  };

  event.waitUntil(self.registration.showNotification(title, options));
});

// Notification click handler
self.addEventListener("notificationclick", (event) => {
  event.notification.close();

  event.waitUntil(
    self.clients.matchAll({ type: "window" }).then((clients) => {
      // Focus existing window or open new one
      for (const client of clients) {
        if (client.url.includes(self.location.origin) && "focus" in client) {
          return client.focus();
        }
      }
      return self.clients.openWindow("/");
    }),
  );
});
