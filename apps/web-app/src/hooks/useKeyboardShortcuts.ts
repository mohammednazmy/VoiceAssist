/**
 * useKeyboardShortcuts Hook
 * Global keyboard shortcuts for the application
 */

import { useEffect } from "react";
import { useNavigate } from "react-router-dom";

export interface KeyboardShortcut {
  key: string;
  ctrlKey?: boolean;
  metaKey?: boolean;
  shiftKey?: boolean;
  description: string;
  action: () => void;
}

export interface UseKeyboardShortcutsProps {
  onToggleBranchSidebar?: () => void;
  onCreateBranch?: () => void;
  onShowShortcuts?: () => void;
  onToggleCitations?: () => void;
  onToggleClinicalContext?: () => void;
}

export function useKeyboardShortcuts(props?: UseKeyboardShortcutsProps) {
  const navigate = useNavigate();
  const {
    onToggleBranchSidebar,
    onCreateBranch,
    onShowShortcuts,
    onToggleCitations,
    onToggleClinicalContext,
  } = props || {};

  useEffect(() => {
    const handleKeyDown = (event: KeyboardEvent) => {
      const isMac = navigator.platform.toUpperCase().indexOf("MAC") >= 0;
      const modKey = isMac ? event.metaKey : event.ctrlKey;

      // Cmd/Ctrl + K: Focus search (or open search dialog)
      if (modKey && event.key === "k") {
        event.preventDefault();
        const searchInput = document.querySelector(
          'input[type="text"][placeholder*="Search"]',
        ) as HTMLInputElement;
        searchInput?.focus();
        return;
      }

      // Cmd/Ctrl + B: Toggle branch sidebar
      if (modKey && event.key === "b" && !event.shiftKey) {
        event.preventDefault();
        onToggleBranchSidebar?.();
        return;
      }

      // Cmd/Ctrl + Shift + B: Create branch from current message
      if (
        modKey &&
        event.shiftKey &&
        (event.key === "B" || event.key === "b")
      ) {
        event.preventDefault();
        onCreateBranch?.();
        return;
      }

      // Cmd/Ctrl + N: New conversation
      if (modKey && event.key === "n") {
        event.preventDefault();
        navigate("/chat");
        return;
      }

      // Cmd/Ctrl + /: Show keyboard shortcuts
      if (modKey && event.key === "/") {
        event.preventDefault();
        onShowShortcuts?.();
        return;
      }

      // Cmd/Ctrl + I: Toggle clinical context sidebar
      if (modKey && event.key === "i" && !event.shiftKey) {
        event.preventDefault();
        onToggleClinicalContext?.();
        return;
      }

      // Cmd/Ctrl + C (without selection): Toggle citations sidebar
      // Note: only trigger if no text is selected to not interfere with copy
      if (
        modKey &&
        event.key === "c" &&
        !event.shiftKey &&
        window.getSelection()?.toString() === ""
      ) {
        event.preventDefault();
        onToggleCitations?.();
        return;
      }

      // Escape: Close modals/overlays
      if (event.key === "Escape") {
        // Let React components handle their own escape logic
        return;
      }
    };

    window.addEventListener("keydown", handleKeyDown);

    return () => {
      window.removeEventListener("keydown", handleKeyDown);
    };
  }, [
    navigate,
    onToggleBranchSidebar,
    onCreateBranch,
    onShowShortcuts,
    onToggleCitations,
    onToggleClinicalContext,
  ]);
}

export const KEYBOARD_SHORTCUTS: KeyboardShortcut[] = [
  {
    key: "k",
    metaKey: true,
    ctrlKey: true,
    description: "Focus search",
    action: () => {},
  },
  {
    key: "n",
    metaKey: true,
    ctrlKey: true,
    description: "New conversation",
    action: () => {},
  },
  {
    key: "/",
    metaKey: true,
    ctrlKey: true,
    description: "Show keyboard shortcuts",
    action: () => {},
  },
  {
    key: "Escape",
    description: "Close modal/dialog",
    action: () => {},
  },
];
