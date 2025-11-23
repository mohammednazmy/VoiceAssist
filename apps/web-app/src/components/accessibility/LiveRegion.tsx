/**
 * Live Region Component
 * Announces dynamic content changes to screen readers
 */

import { useEffect, useState } from 'react';

export interface LiveRegionProps {
  message?: string;
  politeness?: 'polite' | 'assertive';
  clearDelay?: number;
}

export function LiveRegion({
  message = '',
  politeness = 'polite',
  clearDelay = 3000,
}: LiveRegionProps) {
  const [announcement, setAnnouncement] = useState('');

  useEffect(() => {
    if (message) {
      setAnnouncement(message);

      // Clear announcement after delay to allow re-announcement
      const timer = setTimeout(() => {
        setAnnouncement('');
      }, clearDelay);

      return () => clearTimeout(timer);
    }
  }, [message, clearDelay]);

  return (
    <div
      role="status"
      aria-live={politeness}
      aria-atomic="true"
      className="sr-only"
    >
      {announcement}
    </div>
  );
}

/**
 * Hook for managing announcements
 */
export function useAnnouncer(politeness: 'polite' | 'assertive' = 'polite') {
  const [announcement, setAnnouncement] = useState('');

  const announce = (message: string) => {
    setAnnouncement(message);
  };

  return {
    announcement,
    announce,
    LiveRegion: () => <LiveRegion message={announcement} politeness={politeness} />,
  };
}
