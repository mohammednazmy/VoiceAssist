/**
 * ChatHeaderActions Component
 *
 * A sleek, minimal action bar with ghost-style icon buttons for chat actions.
 * Features a download dropdown for exporting conversations in different formats.
 *
 * Design principles:
 * - Ghost buttons: Transparent background, subtle hover state
 * - Muted icons: neutral-400 default, neutral-600 on hover
 * - Minimal spacing: Compact and unobtrusive
 * - Smooth transitions: Subtle hover effects
 *
 * Phase 11: VoiceAssist Voice Pipeline Sprint
 */

import { useState, useRef, useEffect } from "react";

// ============================================================================
// Types
// ============================================================================

export interface ChatHeaderActionsProps {
  /** Conversation ID for export */
  conversationId: string;
  /** Called when user selects an export format */
  onExport: (format: "markdown" | "text") => void;
  /** Optional: Show the existing export dialog instead of inline dropdown */
  onOpenExportDialog?: () => void;
}

// ============================================================================
// Icons
// ============================================================================

function DownloadIcon({ className }: { className?: string }) {
  return (
    <svg
      className={className}
      fill="none"
      viewBox="0 0 24 24"
      stroke="currentColor"
      strokeWidth={1.5}
    >
      <path
        strokeLinecap="round"
        strokeLinejoin="round"
        d="M3 16.5v2.25A2.25 2.25 0 005.25 21h13.5A2.25 2.25 0 0021 18.75V16.5M16.5 12L12 16.5m0 0L7.5 12m4.5 4.5V3"
      />
    </svg>
  );
}

// ============================================================================
// Main Component
// ============================================================================

export function ChatHeaderActions({
  conversationId: _conversationId,
  onExport,
  onOpenExportDialog,
}: ChatHeaderActionsProps) {
  const [showExportMenu, setShowExportMenu] = useState(false);
  const menuRef = useRef<HTMLDivElement>(null);

  // Close menu on outside click
  useEffect(() => {
    const handleClick = (e: MouseEvent) => {
      if (menuRef.current && !menuRef.current.contains(e.target as Node)) {
        setShowExportMenu(false);
      }
    };
    document.addEventListener("mousedown", handleClick);
    return () => document.removeEventListener("mousedown", handleClick);
  }, []);

  // Close menu on escape
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        setShowExportMenu(false);
      }
    };
    document.addEventListener("keydown", handleKeyDown);
    return () => document.removeEventListener("keydown", handleKeyDown);
  }, []);

  const handleExportClick = () => {
    // If we have an export dialog handler, use that instead of dropdown
    if (onOpenExportDialog) {
      onOpenExportDialog();
    } else {
      setShowExportMenu(!showExportMenu);
    }
  };

  return (
    <div className="flex items-center gap-1" data-testid="chat-header-actions">
      {/* Export button with dropdown */}
      <div className="relative" ref={menuRef}>
        <button
          type="button"
          onClick={handleExportClick}
          className="p-2 text-neutral-400 hover:text-neutral-600 hover:bg-neutral-100
                     rounded-lg transition-colors"
          title="Export conversation"
          aria-label="Export conversation"
          aria-expanded={showExportMenu}
          aria-haspopup="menu"
          data-testid="export-dropdown-btn"
        >
          <DownloadIcon className="w-4 h-4" />
        </button>

        {/* Dropdown menu - appears below button */}
        {showExportMenu && (
          <div
            className="absolute right-0 top-full mt-1 py-1 bg-white rounded-lg
                       shadow-lg border border-neutral-200 min-w-[140px] z-20"
            role="menu"
            aria-label="Export formats"
            data-testid="export-dropdown-menu"
          >
            <button
              type="button"
              onClick={() => {
                onExport("markdown");
                setShowExportMenu(false);
              }}
              className="w-full px-3 py-2 text-left text-sm text-neutral-700
                         hover:bg-neutral-50 flex items-center gap-2"
              role="menuitem"
            >
              <span className="text-xs font-mono text-neutral-400">.md</span>
              Markdown
            </button>
            <button
              type="button"
              onClick={() => {
                onExport("text");
                setShowExportMenu(false);
              }}
              className="w-full px-3 py-2 text-left text-sm text-neutral-700
                         hover:bg-neutral-50 flex items-center gap-2"
              role="menuitem"
            >
              <span className="text-xs font-mono text-neutral-400">.txt</span>
              Plain Text
            </button>
          </div>
        )}
      </div>
    </div>
  );
}

export default ChatHeaderActions;
