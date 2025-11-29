import { useLocation } from "react-router-dom";
import { useAnalyticsConsent } from "./AnalyticsOptInLayout";

/**
 * Analytics consent UI component.
 * Must be placed inside the Router and AnalyticsOptInLayout.
 * Only shows on the home page to avoid overlapping other UI.
 */
export function AnalyticsConsentUI() {
  const location = useLocation();
  const { consent, showNotice, setShowNotice, handleGrant, handleDeny } =
    useAnalyticsConsent();

  // Only show on the main dashboard page to avoid overlapping other UI
  const isHomePage = location.pathname === "/" || location.pathname === "/home";
  if (!isHomePage) {
    return null;
  }

  if (showNotice) {
    return (
      <div className="fixed bottom-20 left-4 sm:bottom-4 z-40 max-w-md rounded-lg border border-neutral-200 bg-white p-4 shadow-lg dark:border-neutral-800 dark:bg-neutral-900">
        <div className="flex items-start gap-3">
          <div className="flex-1 space-y-2">
            <p className="text-sm font-semibold text-neutral-900 dark:text-neutral-50">
              Help us improve with anonymous analytics?
            </p>
            <p className="text-sm text-neutral-600 dark:text-neutral-300">
              We respect Do Not Track and never collect PHI. You can change this
              setting anytime.
            </p>
          </div>
        </div>
        <div className="mt-3 flex flex-wrap gap-2">
          <button
            type="button"
            onClick={handleGrant}
            className="rounded-md bg-primary-600 px-3 py-2 text-sm font-medium text-white shadow-sm hover:bg-primary-700 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary-500"
          >
            Allow analytics
          </button>
          <button
            type="button"
            onClick={handleDeny}
            className="rounded-md border border-neutral-300 px-3 py-2 text-sm font-medium text-neutral-800 hover:bg-neutral-100 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary-500 dark:border-neutral-700 dark:text-neutral-100 dark:hover:bg-neutral-800"
          >
            No thanks
          </button>
          {consent !== "pending" && (
            <button
              type="button"
              onClick={() => setShowNotice(false)}
              className="text-sm font-medium text-neutral-600 underline hover:text-neutral-900 dark:text-neutral-300 dark:hover:text-white"
            >
              Close
            </button>
          )}
        </div>
      </div>
    );
  }

  if (consent !== "pending") {
    return (
      <div className="fixed bottom-20 left-4 sm:bottom-4 z-30">
        <button
          type="button"
          onClick={() => setShowNotice(true)}
          className="rounded-full border border-neutral-300 bg-white px-4 py-2 text-xs font-medium text-neutral-700 shadow hover:bg-neutral-100 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary-500 dark:border-neutral-700 dark:bg-neutral-900 dark:text-neutral-200 dark:hover:bg-neutral-800"
          aria-label="Review analytics preferences"
        >
          Analytics preferences ({consent})
        </button>
      </div>
    );
  }

  return null;
}
