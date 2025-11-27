/**
 * PWA Prompt Component
 * Shows install and update prompts for the PWA
 *
 * Phase 9.2: PWA Support
 */

import { usePWA } from "../hooks/usePWA";

export function PWAPrompt() {
  const {
    needRefresh,
    offlineReady,
    isInstallable,
    isUpdating,
    install,
    refresh,
    dismiss,
  } = usePWA();

  // Show update prompt
  if (needRefresh) {
    return (
      <div className="fixed bottom-4 left-4 right-4 sm:left-auto sm:right-4 sm:w-96 bg-white dark:bg-neutral-800 rounded-lg shadow-lg border border-neutral-200 dark:border-neutral-700 p-4 z-50">
        <div className="flex items-start space-x-3">
          <div className="flex-shrink-0">
            <svg
              xmlns="http://www.w3.org/2000/svg"
              fill="none"
              viewBox="0 0 24 24"
              strokeWidth={1.5}
              stroke="currentColor"
              className="w-6 h-6 text-primary-500"
            >
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                d="M16.023 9.348h4.992v-.001M2.985 19.644v-4.992m0 0h4.992m-4.993 0l3.181 3.183a8.25 8.25 0 0013.803-3.7M4.031 9.865a8.25 8.25 0 0113.803-3.7l3.181 3.182m0-4.991v4.99"
              />
            </svg>
          </div>
          <div className="flex-1 min-w-0">
            <h3 className="text-sm font-medium text-neutral-900 dark:text-neutral-100">
              Update Available
            </h3>
            <p className="text-sm text-neutral-600 dark:text-neutral-400 mt-1">
              A new version of VoiceAssist is ready. Reload to update.
            </p>
            <div className="flex space-x-3 mt-3">
              <button
                onClick={refresh}
                disabled={isUpdating}
                className="flex-1 px-3 py-1.5 text-sm font-medium text-white bg-primary-600 rounded-md hover:bg-primary-700 disabled:opacity-50 transition-colors"
              >
                {isUpdating ? "Updating..." : "Update Now"}
              </button>
              <button
                onClick={dismiss}
                className="px-3 py-1.5 text-sm font-medium text-neutral-700 dark:text-neutral-300 hover:text-neutral-900 dark:hover:text-neutral-100 transition-colors"
              >
                Later
              </button>
            </div>
          </div>
          <button
            onClick={dismiss}
            className="flex-shrink-0 text-neutral-400 hover:text-neutral-500"
          >
            <svg
              xmlns="http://www.w3.org/2000/svg"
              fill="none"
              viewBox="0 0 24 24"
              strokeWidth={2}
              stroke="currentColor"
              className="w-5 h-5"
            >
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                d="M6 18L18 6M6 6l12 12"
              />
            </svg>
          </button>
        </div>
      </div>
    );
  }

  // Show offline ready notification
  if (offlineReady) {
    return (
      <div className="fixed bottom-4 left-4 right-4 sm:left-auto sm:right-4 sm:w-96 bg-green-50 dark:bg-green-900/30 rounded-lg shadow-lg border border-green-200 dark:border-green-800 p-4 z-50">
        <div className="flex items-start space-x-3">
          <div className="flex-shrink-0">
            <svg
              xmlns="http://www.w3.org/2000/svg"
              fill="none"
              viewBox="0 0 24 24"
              strokeWidth={1.5}
              stroke="currentColor"
              className="w-6 h-6 text-green-600 dark:text-green-400"
            >
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                d="M9 12.75L11.25 15 15 9.75M21 12a9 9 0 11-18 0 9 9 0 0118 0z"
              />
            </svg>
          </div>
          <div className="flex-1 min-w-0">
            <h3 className="text-sm font-medium text-green-800 dark:text-green-200">
              Ready for Offline
            </h3>
            <p className="text-sm text-green-700 dark:text-green-300 mt-1">
              VoiceAssist is now available offline.
            </p>
          </div>
          <button
            onClick={dismiss}
            className="flex-shrink-0 text-green-500 hover:text-green-600"
          >
            <svg
              xmlns="http://www.w3.org/2000/svg"
              fill="none"
              viewBox="0 0 24 24"
              strokeWidth={2}
              stroke="currentColor"
              className="w-5 h-5"
            >
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                d="M6 18L18 6M6 6l12 12"
              />
            </svg>
          </button>
        </div>
      </div>
    );
  }

  // Show install prompt
  if (isInstallable) {
    return (
      <div className="fixed bottom-4 left-4 right-4 sm:left-auto sm:right-4 sm:w-96 bg-white dark:bg-neutral-800 rounded-lg shadow-lg border border-neutral-200 dark:border-neutral-700 p-4 z-50">
        <div className="flex items-start space-x-3">
          <div className="flex-shrink-0">
            <svg
              xmlns="http://www.w3.org/2000/svg"
              fill="none"
              viewBox="0 0 24 24"
              strokeWidth={1.5}
              stroke="currentColor"
              className="w-6 h-6 text-primary-500"
            >
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                d="M10.5 1.5H8.25A2.25 2.25 0 006 3.75v16.5a2.25 2.25 0 002.25 2.25h7.5A2.25 2.25 0 0018 20.25V3.75a2.25 2.25 0 00-2.25-2.25H13.5m-3 0V3h3V1.5m-3 0h3m-3 18.75h3"
              />
            </svg>
          </div>
          <div className="flex-1 min-w-0">
            <h3 className="text-sm font-medium text-neutral-900 dark:text-neutral-100">
              Install VoiceAssist
            </h3>
            <p className="text-sm text-neutral-600 dark:text-neutral-400 mt-1">
              Add to your home screen for quick access and offline use.
            </p>
            <div className="flex space-x-3 mt-3">
              <button
                onClick={install}
                className="flex-1 px-3 py-1.5 text-sm font-medium text-white bg-primary-600 rounded-md hover:bg-primary-700 transition-colors"
              >
                Install
              </button>
              <button
                onClick={dismiss}
                className="px-3 py-1.5 text-sm font-medium text-neutral-700 dark:text-neutral-300 hover:text-neutral-900 dark:hover:text-neutral-100 transition-colors"
              >
                Not Now
              </button>
            </div>
          </div>
          <button
            onClick={dismiss}
            className="flex-shrink-0 text-neutral-400 hover:text-neutral-500"
          >
            <svg
              xmlns="http://www.w3.org/2000/svg"
              fill="none"
              viewBox="0 0 24 24"
              strokeWidth={2}
              stroke="currentColor"
              className="w-5 h-5"
            >
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                d="M6 18L18 6M6 6l12 12"
              />
            </svg>
          </button>
        </div>
      </div>
    );
  }

  return null;
}
