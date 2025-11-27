/**
 * Announcer - Phase 12: Accessibility & Compliance
 *
 * Screen reader announcements using ARIA live regions.
 * Provides a way to announce dynamic content changes to screen reader users.
 */

import React, {
  useState,
  useCallback,
  useRef,
  useEffect,
  createContext,
  useContext,
} from "react";

type Politeness = "polite" | "assertive" | "off";

interface Announcement {
  message: string;
  politeness: Politeness;
  id: number;
}

interface AnnouncerContextValue {
  announce: (message: string, politeness?: Politeness) => void;
  announcePolitely: (message: string) => void;
  announceAssertively: (message: string) => void;
  clearAnnouncements: () => void;
}

const AnnouncerContext = createContext<AnnouncerContextValue | undefined>(
  undefined,
);

interface AnnouncerProviderProps {
  children: React.ReactNode;
  clearDelay?: number;
}

export function AnnouncerProvider({
  children,
  clearDelay = 1000,
}: AnnouncerProviderProps) {
  const [announcements, setAnnouncements] = useState<Announcement[]>([]);
  const idRef = useRef(0);

  const announce = useCallback(
    (message: string, politeness: Politeness = "polite") => {
      const id = ++idRef.current;
      setAnnouncements((prev) => [...prev, { message, politeness, id }]);

      // Clear announcement after delay
      setTimeout(() => {
        setAnnouncements((prev) => prev.filter((a) => a.id !== id));
      }, clearDelay);
    },
    [clearDelay],
  );

  const announcePolitely = useCallback(
    (message: string) => {
      announce(message, "polite");
    },
    [announce],
  );

  const announceAssertively = useCallback(
    (message: string) => {
      announce(message, "assertive");
    },
    [announce],
  );

  const clearAnnouncements = useCallback(() => {
    setAnnouncements([]);
  }, []);

  return (
    <AnnouncerContext.Provider
      value={{
        announce,
        announcePolitely,
        announceAssertively,
        clearAnnouncements,
      }}
    >
      {children}
      <AriaLiveRegion
        politeAnnouncements={announcements.filter(
          (a) => a.politeness === "polite",
        )}
        assertiveAnnouncements={announcements.filter(
          (a) => a.politeness === "assertive",
        )}
      />
    </AnnouncerContext.Provider>
  );
}

export function useAnnouncer(): AnnouncerContextValue {
  const context = useContext(AnnouncerContext);

  if (!context) {
    // Return no-op functions if used outside provider
    return {
      announce: () => {},
      announcePolitely: () => {},
      announceAssertively: () => {},
      clearAnnouncements: () => {},
    };
  }

  return context;
}

// Live region component
interface AriaLiveRegionProps {
  politeAnnouncements?: Announcement[];
  assertiveAnnouncements?: Announcement[];
}

export function AriaLiveRegion({
  politeAnnouncements = [],
  assertiveAnnouncements = [],
}: AriaLiveRegionProps) {
  return (
    <>
      {/* Polite region - waits for user to finish current task */}
      <div
        role="status"
        aria-live="polite"
        aria-atomic="true"
        className="sr-only"
      >
        {politeAnnouncements.map((a) => (
          <p key={a.id}>{a.message}</p>
        ))}
      </div>

      {/* Assertive region - interrupts current task */}
      <div
        role="alert"
        aria-live="assertive"
        aria-atomic="true"
        className="sr-only"
      >
        {assertiveAnnouncements.map((a) => (
          <p key={a.id}>{a.message}</p>
        ))}
      </div>
    </>
  );
}

// Standalone hook for simple announcements without provider
export function useAriaAnnounce() {
  const politeRef = useRef<HTMLDivElement>(null);
  const assertiveRef = useRef<HTMLDivElement>(null);

  const announce = useCallback(
    (message: string, politeness: Politeness = "polite") => {
      const target =
        politeness === "assertive" ? assertiveRef.current : politeRef.current;
      if (target) {
        // Clear and re-set to trigger screen reader announcement
        target.textContent = "";
        // Use setTimeout to ensure DOM update triggers announcement
        setTimeout(() => {
          target.textContent = message;
        }, 50);
      }
    },
    [],
  );

  const LiveRegions = () => (
    <>
      <div
        ref={politeRef}
        role="status"
        aria-live="polite"
        aria-atomic="true"
        className="sr-only"
      />
      <div
        ref={assertiveRef}
        role="alert"
        aria-live="assertive"
        aria-atomic="true"
        className="sr-only"
      />
    </>
  );

  return { announce, LiveRegions };
}

export default AriaLiveRegion;
