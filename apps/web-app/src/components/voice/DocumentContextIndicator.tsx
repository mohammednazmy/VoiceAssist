/**
 * DocumentContextIndicator
 * Shows the current document context in voice mode, including:
 * - Document title
 * - Current page/total pages
 * - Current section (if available)
 * - Navigation hints
 */

import type { VoiceDocumentSession } from "@voiceassist/api-client";

export interface DocumentContextIndicatorProps {
  /** Current voice document session */
  session: VoiceDocumentSession | null;
  /** Whether session is loading */
  isLoading?: boolean;
  /** Callback to end the session */
  onEndSession?: () => void;
  /** Size variant */
  size?: "sm" | "md";
}

export function DocumentContextIndicator({
  session,
  isLoading = false,
  onEndSession,
  size = "md",
}: DocumentContextIndicatorProps) {
  if (isLoading) {
    return (
      <div className="flex items-center gap-2 px-3 py-2 bg-blue-950/70 border border-blue-800 rounded-lg animate-pulse">
        <div className="w-4 h-4 bg-blue-700 rounded"></div>
        <div className="w-32 h-4 bg-blue-700 rounded"></div>
      </div>
    );
  }

  if (!session) {
    return null;
  }

  const sizeClasses =
    size === "sm"
      ? "text-xs px-2 py-1.5 gap-1.5"
      : "text-sm px-3 py-2 gap-2";

  const iconSize = size === "sm" ? "w-3.5 h-3.5" : "w-4 h-4";

  return (
    <div
      className={`flex items-center ${sizeClasses} bg-blue-950/70 border border-blue-800 rounded-lg`}
      role="status"
      aria-label={`Reading ${session.document_title}, page ${session.current_page} of ${session.total_pages || "?"}`}
    >
      {/* Document icon */}
      <svg
        xmlns="http://www.w3.org/2000/svg"
        fill="none"
        viewBox="0 0 24 24"
        strokeWidth={1.5}
        stroke="currentColor"
        className={`${iconSize} text-blue-400 flex-shrink-0`}
      >
        <path
          strokeLinecap="round"
          strokeLinejoin="round"
          d="M12 6.042A8.967 8.967 0 006 3.75c-1.052 0-2.062.18-3 .512v14.25A8.987 8.987 0 016 18c2.305 0 4.408.867 6 2.292m0-14.25a8.966 8.966 0 016-2.292c1.052 0 2.062.18 3 .512v14.25A8.987 8.987 0 0018 18a8.967 8.967 0 00-6 2.292m0-14.25v14.25"
        />
      </svg>

      {/* Document info */}
      <div className="flex flex-col min-w-0 flex-1">
        <span
          className="font-medium text-blue-100 truncate"
          title={session.document_title}
        >
          {session.document_title}
        </span>
        <div className="flex items-center gap-2 text-blue-300">
          <span>
            Page {session.current_page}
            {session.total_pages && ` / ${session.total_pages}`}
          </span>
          {session.current_section_title && (
            <>
              <span className="text-blue-600">|</span>
              <span
                className="truncate"
                title={session.current_section_title}
              >
                {session.current_section_title}
              </span>
            </>
          )}
        </div>
      </div>

      {/* Feature badges */}
      <div className="flex items-center gap-1 flex-shrink-0">
        {session.has_toc && (
          <span
            className={`px-1.5 py-0.5 rounded ${size === "sm" ? "text-[10px]" : "text-xs"} bg-green-900/50 text-green-300 border border-green-800`}
            title="Table of Contents available"
          >
            TOC
          </span>
        )}
        {session.has_figures && (
          <span
            className={`px-1.5 py-0.5 rounded ${size === "sm" ? "text-[10px]" : "text-xs"} bg-purple-900/50 text-purple-300 border border-purple-800`}
            title="Figures available"
          >
            Figures
          </span>
        )}
      </div>

      {/* Close/end session button */}
      {onEndSession && (
        <button
          type="button"
          onClick={onEndSession}
          className="flex-shrink-0 p-1 rounded hover:bg-blue-800/50 text-blue-400 hover:text-blue-200 transition-colors"
          aria-label="End document session"
          title="End document session"
        >
          <svg
            xmlns="http://www.w3.org/2000/svg"
            fill="none"
            viewBox="0 0 24 24"
            strokeWidth={2}
            stroke="currentColor"
            className={iconSize}
          >
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              d="M6 18L18 6M6 6l12 12"
            />
          </svg>
        </button>
      )}
    </div>
  );
}

/**
 * DocumentNavigationHints
 * Shows voice command hints for document navigation
 */
export interface DocumentNavigationHintsProps {
  /** Whether hints should be visible */
  visible?: boolean;
  /** Current page number */
  currentPage?: number;
  /** Total pages */
  totalPages?: number | null;
  /** Whether document has TOC */
  hasToc?: boolean;
  /** Whether document has figures */
  hasFigures?: boolean;
}

export function DocumentNavigationHints({
  visible = true,
  currentPage = 1,
  totalPages = null,
  hasToc = false,
  hasFigures = false,
}: DocumentNavigationHintsProps) {
  if (!visible) {
    return null;
  }

  const hints: { command: string; description: string }[] = [];

  // Add contextual hints based on position
  if (currentPage > 1) {
    hints.push({ command: "Previous page", description: "Go back one page" });
  }

  if (!totalPages || currentPage < totalPages) {
    hints.push({ command: "Next page", description: "Go forward one page" });
  }

  hints.push({
    command: "Read page [number]",
    description: "Jump to a specific page",
  });

  if (hasToc) {
    hints.push({
      command: "Table of contents",
      description: "List chapters and sections",
    });
  }

  if (hasFigures) {
    hints.push({
      command: "Describe the figure",
      description: "Get AI description of diagrams",
    });
    hints.push({
      command: "Jump to figures",
      description: "Skip ahead to pages with figures",
    });
  }

  // Reading mode affordances
  hints.push({
    command: "Read the next page",
    description: "Continue reading from the current location",
  });
  hints.push({
    command: "Summarize this section",
    description: "Get a shorter overview of the current section",
  });

  return (
    <div className="px-3 py-2 bg-slate-900/70 border border-slate-700 rounded-lg">
      <div className="text-xs text-slate-400 mb-2 font-medium">
        Voice Commands
      </div>
      <div className="grid grid-cols-2 gap-2">
        {hints.map((hint) => (
          <div
            key={hint.command}
            className="flex flex-col text-xs"
          >
            <span className="text-blue-300 font-mono">"{hint.command}"</span>
            <span className="text-slate-500">{hint.description}</span>
          </div>
        ))}
      </div>
    </div>
  );
}
