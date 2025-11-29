import {
  createContext,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from "react";
import { AnalyticsProvider, type AnalyticsConfig } from "../../lib/analytics";

type ConsentState = "pending" | "granted" | "denied";

interface AnalyticsConsentContextValue {
  consent: ConsentState;
  showNotice: boolean;
  setShowNotice: (show: boolean) => void;
  handleGrant: () => void;
  handleDeny: () => void;
}

const AnalyticsConsentContext =
  createContext<AnalyticsConsentContextValue | null>(null);

export function useAnalyticsConsent() {
  const context = useContext(AnalyticsConsentContext);
  if (!context) {
    throw new Error(
      "useAnalyticsConsent must be used within AnalyticsOptInLayout",
    );
  }
  return context;
}

interface AnalyticsOptInLayoutProps {
  children: ReactNode;
  config: AnalyticsConfig;
}

const STORAGE_KEY = "voiceassist_analytics_consent";

/**
 * Privacy-first analytics wrapper that only enables analytics
 * after the user opts in. Consent is stored locally so the
 * choice persists between sessions.
 *
 * UI is rendered separately via AnalyticsConsentUI component
 * which should be placed inside the Router.
 */
export function AnalyticsOptInLayout({
  children,
  config,
}: AnalyticsOptInLayoutProps) {
  const [consent, setConsent] = useState<ConsentState>("pending");
  const [showNotice, setShowNotice] = useState(true);

  // Hydrate consent state from storage
  useEffect(() => {
    if (typeof window === "undefined") return;

    const stored = window.localStorage.getItem(
      STORAGE_KEY,
    ) as ConsentState | null;

    if (stored === "granted" || stored === "denied") {
      setConsent(stored);
      setShowNotice(false);
    }
  }, []);

  // Persist consent decisions
  useEffect(() => {
    if (typeof window === "undefined") return;

    if (consent !== "pending") {
      window.localStorage.setItem(STORAGE_KEY, consent);
    }
  }, [consent]);

  const handleGrant = () => {
    setConsent("granted");
    setShowNotice(false);
  };

  const handleDeny = () => {
    setConsent("denied");
    setShowNotice(false);
  };

  const contextValue = useMemo(
    () => ({
      consent,
      showNotice,
      setShowNotice,
      handleGrant,
      handleDeny,
    }),
    [consent, showNotice],
  );

  const analyticsTree = useMemo(() => {
    if (consent !== "granted") return children;
    return <AnalyticsProvider config={config}>{children}</AnalyticsProvider>;
  }, [children, config, consent]);

  return (
    <AnalyticsConsentContext.Provider value={contextValue}>
      <div className="relative min-h-screen">{analyticsTree}</div>
    </AnalyticsConsentContext.Provider>
  );
}
