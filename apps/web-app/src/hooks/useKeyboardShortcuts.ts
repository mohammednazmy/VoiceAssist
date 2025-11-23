/**
 * useKeyboardShortcuts Hook
 * Global keyboard shortcuts for the application
 */

import { useEffect } from 'react';
import { useNavigate } from 'react-router-dom';

export interface KeyboardShortcut {
  key: string;
  ctrlKey?: boolean;
  metaKey?: boolean;
  shiftKey?: boolean;
  description: string;
  action: () => void;
}

export function useKeyboardShortcuts() {
  const navigate = useNavigate();

  useEffect(() => {
    const handleKeyDown = (event: KeyboardEvent) => {
      const isMac = navigator.platform.toUpperCase().indexOf('MAC') >= 0;
      const modKey = isMac ? event.metaKey : event.ctrlKey;

      // Cmd/Ctrl + K: Focus search (or open search dialog)
      if (modKey && event.key === 'k') {
        event.preventDefault();
        const searchInput = document.querySelector('input[type="text"][placeholder*="Search"]') as HTMLInputElement;
        searchInput?.focus();
        return;
      }

      // Cmd/Ctrl + N: New conversation
      if (modKey && event.key === 'n') {
        event.preventDefault();
        navigate('/chat');
        return;
      }

      // Cmd/Ctrl + /: Show keyboard shortcuts
      if (modKey && event.key === '/') {
        event.preventDefault();
        // TODO: Open keyboard shortcuts dialog
        console.log('Keyboard shortcuts dialog');
        return;
      }

      // Escape: Close modals/overlays
      if (event.key === 'Escape') {
        // Let React components handle their own escape logic
        return;
      }
    };

    window.addEventListener('keydown', handleKeyDown);

    return () => {
      window.removeEventListener('keydown', handleKeyDown);
    };
  }, [navigate]);
}

export const KEYBOARD_SHORTCUTS: KeyboardShortcut[] = [
  {
    key: 'k',
    metaKey: true,
    ctrlKey: true,
    description: 'Focus search',
    action: () => {},
  },
  {
    key: 'n',
    metaKey: true,
    ctrlKey: true,
    description: 'New conversation',
    action: () => {},
  },
  {
    key: '/',
    metaKey: true,
    ctrlKey: true,
    description: 'Show keyboard shortcuts',
    action: () => {},
  },
  {
    key: 'Escape',
    description: 'Close modal/dialog',
    action: () => {},
  },
];
