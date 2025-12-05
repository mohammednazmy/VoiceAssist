/**
 * usePWA Hook
 * Manages PWA installation and update prompts
 *
 * Phase 9.2: PWA Support
 */

import { useState, useEffect, useCallback } from "react";
import { useRegisterSW } from "virtual:pwa-register/react";

interface PWAState {
  needRefresh: boolean;
  offlineReady: boolean;
  isInstallable: boolean;
  isInstalled: boolean;
  isUpdating: boolean;
}

interface BeforeInstallPromptEvent extends Event {
  prompt: () => Promise<void>;
  userChoice: Promise<{ outcome: "accepted" | "dismissed" }>;
}

export function usePWA() {
  const [installPrompt, setInstallPrompt] =
    useState<BeforeInstallPromptEvent | null>(null);
  const [isInstalled, setIsInstalled] = useState(false);
  const [isUpdating, setIsUpdating] = useState(false);

  const {
    needRefresh: [needRefresh, setNeedRefresh],
    offlineReady: [offlineReady, setOfflineReady],
    updateServiceWorker,
  } = useRegisterSW({
    onRegisteredSW(swUrl, r) {
      console.log("[PWA] Service Worker registered:", swUrl);

      // Check for updates periodically (every hour)
      if (r) {
        setInterval(
          () => {
            r.update();
          },
          60 * 60 * 1000,
        );
      }
    },
    onRegisterError(error) {
      console.error("[PWA] Service Worker registration error:", error);
    },
    onNeedRefresh() {
      console.log("[PWA] New content available, needs refresh");
    },
    onOfflineReady() {
      console.log("[PWA] App ready for offline use");
    },
  });

  // Listen for install prompt
  useEffect(() => {
    const handleBeforeInstallPrompt = (e: Event) => {
      e.preventDefault();
      setInstallPrompt(e as BeforeInstallPromptEvent);
    };

    const handleAppInstalled = () => {
      setIsInstalled(true);
      setInstallPrompt(null);
      console.log("[PWA] App installed");
    };

    window.addEventListener("beforeinstallprompt", handleBeforeInstallPrompt);
    window.addEventListener("appinstalled", handleAppInstalled);

    // Check if already installed
    if (window.matchMedia("(display-mode: standalone)").matches) {
      setIsInstalled(true);
    }

    return () => {
      window.removeEventListener(
        "beforeinstallprompt",
        handleBeforeInstallPrompt,
      );
      window.removeEventListener("appinstalled", handleAppInstalled);
    };
  }, []);

  const install = useCallback(async () => {
    if (!installPrompt) return false;

    try {
      await installPrompt.prompt();
      const { outcome } = await installPrompt.userChoice;

      if (outcome === "accepted") {
        setInstallPrompt(null);
        return true;
      }
      return false;
    } catch {
      console.error("[PWA] Installation failed");
      return false;
    }
  }, [installPrompt]);

  const refresh = useCallback(async () => {
    if (!needRefresh) return;

    setIsUpdating(true);
    try {
      // Update service worker - the 'true' param should trigger reload
      await updateServiceWorker(true);

      // If updateServiceWorker didn't reload the page (can happen in some cases),
      // force a reload after a short delay to ensure the new SW is active
      setTimeout(() => {
        window.location.reload();
      }, 500);
    } catch (error) {
      console.error("[PWA] Update failed:", error);
      // Even on error, try to reload to get the latest version
      window.location.reload();
    } finally {
      setIsUpdating(false);
    }
  }, [needRefresh, updateServiceWorker]);

  const dismiss = useCallback(() => {
    setNeedRefresh(false);
    setOfflineReady(false);
  }, [setNeedRefresh, setOfflineReady]);

  const state: PWAState = {
    needRefresh,
    offlineReady,
    isInstallable: !!installPrompt,
    isInstalled,
    isUpdating,
  };

  return {
    ...state,
    install,
    refresh,
    dismiss,
  };
}
