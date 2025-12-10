/**
 * useServiceWorker Hook
 *
 * Handles service worker registration and background sync for offline features.
 *
 * Features:
 * - Service worker registration with update handling
 * - Background sync registration for offline recordings
 * - Periodic sync registration (when supported)
 * - SW message handling for sync notifications
 *
 * @module hooks/useServiceWorker
 */

import { useState, useEffect, useCallback, useRef } from "react";

export interface ServiceWorkerState {
  /** Whether service worker is supported */
  isSupported: boolean;
  /** Whether service worker is registered */
  isRegistered: boolean;
  /** Whether service worker is active */
  isActive: boolean;
  /** Whether an update is available */
  updateAvailable: boolean;
  /** Whether background sync is supported */
  backgroundSyncSupported: boolean;
  /** Any error that occurred */
  error: Error | null;
}

export interface UseServiceWorkerOptions {
  /** Service worker URL */
  swUrl?: string;
  /** Callback when a recording is synced */
  onRecordingSynced?: (recordingId: string) => void;
  /** Callback when SW update is available */
  onUpdateAvailable?: () => void;
  /** Enable auto-updates */
  autoUpdate?: boolean;
}

export interface UseServiceWorkerReturn extends ServiceWorkerState {
  /** Register the service worker */
  register: () => Promise<void>;
  /** Unregister the service worker */
  unregister: () => Promise<void>;
  /** Trigger background sync for recordings */
  requestSync: () => Promise<void>;
  /** Skip waiting and activate new SW */
  skipWaiting: () => void;
}

export function useServiceWorker({
  swUrl = "/sw.js",
  onRecordingSynced,
  onUpdateAvailable,
  autoUpdate = false,
}: UseServiceWorkerOptions = {}): UseServiceWorkerReturn {
  const [state, setState] = useState<ServiceWorkerState>({
    isSupported:
      typeof navigator !== "undefined" && "serviceWorker" in navigator,
    isRegistered: false,
    isActive: false,
    updateAvailable: false,
    backgroundSyncSupported:
      typeof navigator !== "undefined" &&
      "serviceWorker" in navigator &&
      "SyncManager" in window,
    error: null,
  });

  const registrationRef = useRef<ServiceWorkerRegistration | null>(null);
  const waitingSwRef = useRef<ServiceWorker | null>(null);

  // Handle SW messages
  useEffect(() => {
    if (!state.isSupported) return;

    const handleMessage = (event: MessageEvent) => {
      const { type, recordingId } = event.data || {};

      if (type === "RECORDING_SYNCED" && recordingId) {
        console.log("[SW] Recording synced:", recordingId);
        onRecordingSynced?.(recordingId);
      }
    };

    navigator.serviceWorker.addEventListener("message", handleMessage);
    return () => {
      navigator.serviceWorker.removeEventListener("message", handleMessage);
    };
  }, [state.isSupported, onRecordingSynced]);

  // Handle controller change (new SW activated)
  useEffect(() => {
    if (!state.isSupported) return;

    const handleControllerChange = () => {
      console.log("[SW] Controller changed - new service worker active");
      if (autoUpdate) {
        window.location.reload();
      }
    };

    navigator.serviceWorker.addEventListener(
      "controllerchange",
      handleControllerChange,
    );
    return () => {
      navigator.serviceWorker.removeEventListener(
        "controllerchange",
        handleControllerChange,
      );
    };
  }, [state.isSupported, autoUpdate]);

  // Register service worker
  const register = useCallback(async () => {
    if (!state.isSupported) {
      console.log("[SW] Service workers not supported");
      return;
    }

    try {
      console.log("[SW] Registering service worker:", swUrl);
      // Exclude /admin/ from SW scope to avoid intercepting admin panel requests
      const registration = await navigator.serviceWorker.register(swUrl, {
        scope: "/app/",
      });
      registrationRef.current = registration;

      setState((prev) => ({
        ...prev,
        isRegistered: true,
        isActive: !!registration.active,
        error: null,
      }));

      // Handle updates
      registration.addEventListener("updatefound", () => {
        const newWorker = registration.installing;
        if (!newWorker) return;

        newWorker.addEventListener("statechange", () => {
          if (
            newWorker.state === "installed" &&
            navigator.serviceWorker.controller
          ) {
            console.log("[SW] Update available");
            waitingSwRef.current = newWorker;
            setState((prev) => ({ ...prev, updateAvailable: true }));
            onUpdateAvailable?.();
          }
        });
      });

      // Check for existing update
      if (registration.waiting) {
        waitingSwRef.current = registration.waiting;
        setState((prev) => ({ ...prev, updateAvailable: true }));
        onUpdateAvailable?.();
      }

      console.log("[SW] Service worker registered successfully");

      // Register periodic sync if supported
      if ("periodicSync" in registration) {
        try {
          // Check if permission is already granted
          const status = await navigator.permissions.query({
            name: "periodic-background-sync" as PermissionName,
          });
          if (status.state === "granted") {
            await (registration as any).periodicSync.register(
              "check-pending-recordings",
              {
                minInterval: 60 * 60 * 1000, // 1 hour
              },
            );
            console.log("[SW] Periodic sync registered");
          }
        } catch (e) {
          console.log("[SW] Periodic sync not available:", e);
        }
      }
    } catch (error) {
      console.error("[SW] Registration failed:", error);
      setState((prev) => ({
        ...prev,
        error: error instanceof Error ? error : new Error(String(error)),
      }));
    }
  }, [swUrl, state.isSupported, onUpdateAvailable]);

  // Unregister service worker
  const unregister = useCallback(async () => {
    if (!registrationRef.current) return;

    try {
      await registrationRef.current.unregister();
      registrationRef.current = null;
      setState((prev) => ({
        ...prev,
        isRegistered: false,
        isActive: false,
        updateAvailable: false,
      }));
      console.log("[SW] Service worker unregistered");
    } catch (error) {
      console.error("[SW] Unregister failed:", error);
    }
  }, []);

  // Request background sync
  const requestSync = useCallback(async () => {
    if (!registrationRef.current) {
      console.warn("[SW] Cannot request sync - not registered");
      return;
    }

    if (!state.backgroundSyncSupported) {
      console.log("[SW] Background sync not supported - manual sync only");
      return;
    }

    try {
      await (registrationRef.current as any).sync.register(
        "sync-offline-recordings",
      );
      console.log("[SW] Background sync requested");
    } catch (error) {
      console.error("[SW] Failed to request background sync:", error);
    }
  }, [state.backgroundSyncSupported]);

  // Skip waiting and activate new SW
  const skipWaiting = useCallback(() => {
    if (!waitingSwRef.current) return;

    waitingSwRef.current.postMessage({ type: "SKIP_WAITING" });
  }, []);

  // Auto-register on mount in production
  useEffect(() => {
    if (state.isSupported && import.meta.env.PROD) {
      register();
    }
  }, [state.isSupported, register]);

  return {
    ...state,
    register,
    unregister,
    requestSync,
    skipWaiting,
  };
}

export default useServiceWorker;
