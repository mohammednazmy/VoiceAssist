/**
 * Keyboard Shortcuts Dialog
 * Displays available keyboard shortcuts
 */

import { useEffect } from "react";

export interface KeyboardShortcutsDialogProps {
  isOpen: boolean;
  onClose: () => void;
}

interface Shortcut {
  keys: string[];
  description: string;
  category: string;
}

const SHORTCUTS: Shortcut[] = [
  {
    keys: ["⌘", "K"],
    description: "Focus search",
    category: "Navigation",
  },
  {
    keys: ["⌘", "N"],
    description: "New conversation",
    category: "Navigation",
  },
  {
    keys: ["⌘", "I"],
    description: "Toggle clinical context",
    category: "Clinical",
  },
  {
    keys: ["⌘", "C"],
    description: "Toggle citations sidebar",
    category: "Citations",
  },
  {
    keys: ["⌘", "B"],
    description: "Toggle branch sidebar",
    category: "Branching",
  },
  {
    keys: ["⌘", "⇧", "B"],
    description: "Create branch from last message",
    category: "Branching",
  },
  {
    keys: ["⌘", "/"],
    description: "Show keyboard shortcuts",
    category: "Help",
  },
  {
    keys: ["Esc"],
    description: "Close modal/dialog",
    category: "General",
  },
  {
    keys: ["↵"],
    description: "Send message",
    category: "Chat",
  },
  {
    keys: ["⇧", "↵"],
    description: "New line in message",
    category: "Chat",
  },
  {
    keys: ["⌘", "↵"],
    description: "Save edited message",
    category: "Chat",
  },
];

export function KeyboardShortcutsDialog({
  isOpen,
  onClose,
}: KeyboardShortcutsDialogProps) {
  // Close on Escape
  useEffect(() => {
    const handleEscape = (e: KeyboardEvent) => {
      if (e.key === "Escape" && isOpen) {
        onClose();
      }
    };

    window.addEventListener("keydown", handleEscape);
    return () => window.removeEventListener("keydown", handleEscape);
  }, [isOpen, onClose]);

  if (!isOpen) return null;

  // Group shortcuts by category
  const categories = Array.from(new Set(SHORTCUTS.map((s) => s.category)));

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/50"
      onClick={onClose}
      role="dialog"
      aria-labelledby="shortcuts-title"
      aria-modal="true"
    >
      <div
        className="bg-white dark:bg-neutral-900 rounded-lg shadow-xl max-w-2xl w-full mx-4 max-h-[80vh] overflow-y-auto"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="sticky top-0 bg-white dark:bg-neutral-900 border-b border-neutral-200 dark:border-neutral-700 px-6 py-4 flex items-center justify-between z-10">
          <h2
            id="shortcuts-title"
            className="text-xl font-semibold text-neutral-900 dark:text-neutral-100"
          >
            Keyboard Shortcuts
          </h2>
          <button
            onClick={onClose}
            className="p-2 rounded-lg hover:bg-neutral-100 dark:hover:bg-neutral-800 transition-colors"
            aria-label="Close dialog"
          >
            <svg
              xmlns="http://www.w3.org/2000/svg"
              fill="none"
              viewBox="0 0 24 24"
              strokeWidth={1.5}
              stroke="currentColor"
              className="w-5 h-5 text-neutral-600 dark:text-neutral-400"
            >
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                d="M6 18L18 6M6 6l12 12"
              />
            </svg>
          </button>
        </div>

        {/* Content */}
        <div className="px-6 py-4 space-y-6">
          {categories.map((category) => (
            <div key={category}>
              <h3 className="text-sm font-semibold text-neutral-700 dark:text-neutral-300 uppercase tracking-wide mb-3">
                {category}
              </h3>
              <div className="space-y-2">
                {SHORTCUTS.filter((s) => s.category === category).map(
                  (shortcut, index) => (
                    <div
                      key={index}
                      className="flex items-center justify-between py-2 px-3 rounded-lg hover:bg-neutral-50 dark:hover:bg-neutral-800 transition-colors"
                    >
                      <span className="text-sm text-neutral-900 dark:text-neutral-100">
                        {shortcut.description}
                      </span>
                      <div className="flex items-center gap-1">
                        {shortcut.keys.map((key, keyIndex) => (
                          <kbd
                            key={keyIndex}
                            className="px-2 py-1 text-xs font-semibold text-neutral-700 dark:text-neutral-300 bg-neutral-100 dark:bg-neutral-800 border border-neutral-300 dark:border-neutral-600 rounded shadow-sm"
                          >
                            {key}
                          </kbd>
                        ))}
                      </div>
                    </div>
                  ),
                )}
              </div>
            </div>
          ))}
        </div>

        {/* Footer */}
        <div className="sticky bottom-0 bg-neutral-50 dark:bg-neutral-800 border-t border-neutral-200 dark:border-neutral-700 px-6 py-3">
          <p className="text-xs text-neutral-600 dark:text-neutral-400">
            <span className="font-medium">Tip:</span> On Windows/Linux, use{" "}
            <kbd className="px-1.5 py-0.5 text-xs bg-neutral-200 dark:bg-neutral-700 rounded">
              Ctrl
            </kbd>{" "}
            instead of{" "}
            <kbd className="px-1.5 py-0.5 text-xs bg-neutral-200 dark:bg-neutral-700 rounded">
              ⌘
            </kbd>
          </p>
        </div>
      </div>
    </div>
  );
}
