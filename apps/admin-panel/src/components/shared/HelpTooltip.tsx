/**
 * HelpTooltip - Contextual help tooltips with documentation links
 *
 * Provides inline help indicators that show documentation summaries
 * on hover/click and link to the full documentation page.
 */
import { useState, useRef, useEffect, useCallback } from "react";

export type HelpTopic =
  // Feature Flags
  | "feature-flags"
  | "feature-flags.naming"
  | "feature-flags.lifecycle"
  | "feature-flags.types"
  | "feature-flags.percentage"
  | "feature-flags.environments"
  // Knowledge Base
  | "knowledge-base"
  | "knowledge-base.upload"
  | "knowledge-base.search"
  | "knowledge-base.embeddings"
  // Settings
  | "settings"
  | "settings.api-keys"
  | "settings.security"
  // General
  | "dashboard"
  | "analytics";

interface HelpContent {
  title: string;
  summary: string;
  docPath: string;
  tips?: string[];
}

/**
 * Mapping of help topics to their content
 * This should eventually be loaded from the docs-summary.json endpoint
 */
const helpContentMap: Record<HelpTopic, HelpContent> = {
  // Feature Flags
  "feature-flags": {
    title: "Feature Flags",
    summary:
      "Feature flags enable runtime feature toggling without deployments. Use category.feature_name pattern for naming.",
    docPath: "admin-guide/feature-flags/README",
    tips: [
      "Flags are stored in PostgreSQL, cached in Redis (5min TTL)",
      "Use percentage rollouts for gradual feature releases",
    ],
  },
  "feature-flags.naming": {
    title: "Feature Flag Naming",
    summary:
      "Use the category.feature_name pattern (e.g., ui.dark_mode, backend.rag_strategy). Valid categories: ui, backend, admin, integration, experiment, ops.",
    docPath: "admin-guide/feature-flags/naming-conventions",
    tips: [
      "Avoid the deprecated ff_ prefix",
      "Use snake_case for feature names",
    ],
  },
  "feature-flags.lifecycle": {
    title: "Feature Flag Lifecycle",
    summary:
      "Flags progress through draft → active → deprecated → removed. Remove flags after stable rollout to avoid tech debt.",
    docPath: "admin-guide/feature-flags/lifecycle",
    tips: ["Review flags quarterly", "Archive deprecated flags before removal"],
  },
  "feature-flags.types": {
    title: "Feature Flag Types",
    summary:
      "Four types: boolean (on/off), percentage (gradual rollout 0-100%), variant (A/B/C testing), scheduled (time-based activation).",
    docPath: "admin-guide/feature-flags/advanced-types",
  },
  "feature-flags.percentage": {
    title: "Percentage Rollouts",
    summary:
      "Gradually roll out features to a percentage of users. Start at 10%, monitor, then increase to 25%, 50%, 75%, 100%.",
    docPath: "admin-guide/feature-flags/advanced-types#percentage-flags",
    tips: [
      "User assignment is deterministic based on user ID hash",
      "Same user sees same variant across sessions",
    ],
  },
  "feature-flags.environments": {
    title: "Multi-Environment Flags",
    summary:
      "Flags have per-environment states. Dev flags auto-enable, staging mirrors prod, prod requires explicit enablement.",
    docPath: "admin-guide/feature-flags/multi-environment",
    tips: [
      "Use Redis namespaced keys (flags:dev:name, flags:prod:name)",
      "Test in dev first, then staging, then prod",
    ],
  },

  // Knowledge Base
  "knowledge-base": {
    title: "Knowledge Base",
    summary:
      "The Knowledge Base stores documents for RAG-powered AI responses. Upload PDFs, and the system extracts, chunks, and embeds content.",
    docPath: "knowledge-base/overview",
  },
  "knowledge-base.upload": {
    title: "Document Upload",
    summary:
      "Upload PDF documents to the knowledge base. Files are processed asynchronously with progress tracking.",
    docPath: "knowledge-base/upload-guide",
    tips: ["Maximum file size: 50MB", "Supported formats: PDF, TXT, MD"],
  },
  "knowledge-base.search": {
    title: "Semantic Search",
    summary:
      "Search uses hybrid retrieval combining BM25 keyword matching with vector similarity for best results.",
    docPath: "knowledge-base/search",
  },
  "knowledge-base.embeddings": {
    title: "Document Embeddings",
    summary:
      "Documents are chunked and embedded using OpenAI's text-embedding-3-small model for semantic search.",
    docPath: "knowledge-base/embeddings",
  },

  // Settings
  settings: {
    title: "Settings",
    summary:
      "Configure system-wide settings including API keys, security options, and integration endpoints.",
    docPath: "admin-guide/settings",
  },
  "settings.api-keys": {
    title: "API Keys",
    summary:
      "Manage API keys for external service integrations. Keys are encrypted at rest and masked in the UI.",
    docPath: "admin-guide/settings/api-keys",
    tips: ["Rotate keys periodically", "Use environment-specific keys"],
  },
  "settings.security": {
    title: "Security Settings",
    summary:
      "Configure authentication, RBAC enforcement, rate limiting, and other security features.",
    docPath: "admin-guide/settings/security",
  },

  // General
  dashboard: {
    title: "Dashboard",
    summary:
      "The dashboard provides an overview of system health, recent activity, and key metrics.",
    docPath: "admin-guide/dashboard",
  },
  analytics: {
    title: "Analytics",
    summary:
      "View usage analytics, search patterns, and performance metrics for the VoiceAssist platform.",
    docPath: "admin-guide/analytics",
  },
};

export interface HelpTooltipProps {
  /**
   * The help topic to display
   */
  topic: HelpTopic;

  /**
   * Size of the help icon
   * @default "sm"
   */
  size?: "xs" | "sm" | "md";

  /**
   * Position of the tooltip
   * @default "top"
   */
  position?: "top" | "bottom" | "left" | "right";

  /**
   * Additional className for the wrapper
   */
  className?: string;

  /**
   * Whether to show on hover (default) or click
   * @default "hover"
   */
  trigger?: "hover" | "click";
}

export function HelpTooltip({
  topic,
  size = "sm",
  position = "top",
  className = "",
  trigger = "hover",
}: HelpTooltipProps) {
  const [isOpen, setIsOpen] = useState(false);
  const [tooltipStyle, setTooltipStyle] = useState<React.CSSProperties>({});
  const triggerRef = useRef<HTMLButtonElement>(null);
  const tooltipRef = useRef<HTMLDivElement>(null);

  const content = helpContentMap[topic];

  const docsBaseUrl =
    typeof import.meta !== "undefined" && import.meta.env?.VITE_DOCS_URL
      ? import.meta.env.VITE_DOCS_URL
      : "http://localhost:3001/";

  // Calculate tooltip position
  const updatePosition = useCallback(() => {
    if (!triggerRef.current || !tooltipRef.current) return;

    const triggerRect = triggerRef.current.getBoundingClientRect();
    const tooltipRect = tooltipRef.current.getBoundingClientRect();
    const gap = 8;

    let top = 0;
    let left = 0;

    switch (position) {
      case "top":
        top = triggerRect.top - tooltipRect.height - gap;
        left = triggerRect.left + triggerRect.width / 2 - tooltipRect.width / 2;
        break;
      case "bottom":
        top = triggerRect.bottom + gap;
        left = triggerRect.left + triggerRect.width / 2 - tooltipRect.width / 2;
        break;
      case "left":
        top = triggerRect.top + triggerRect.height / 2 - tooltipRect.height / 2;
        left = triggerRect.left - tooltipRect.width - gap;
        break;
      case "right":
        top = triggerRect.top + triggerRect.height / 2 - tooltipRect.height / 2;
        left = triggerRect.right + gap;
        break;
    }

    // Keep within viewport bounds
    const padding = 12;
    left = Math.max(
      padding,
      Math.min(left, window.innerWidth - tooltipRect.width - padding),
    );
    top = Math.max(
      padding,
      Math.min(top, window.innerHeight - tooltipRect.height - padding),
    );

    setTooltipStyle({ top, left });
  }, [position]);

  useEffect(() => {
    if (isOpen) {
      updatePosition();
      window.addEventListener("scroll", updatePosition, true);
      window.addEventListener("resize", updatePosition);
    }
    return () => {
      window.removeEventListener("scroll", updatePosition, true);
      window.removeEventListener("resize", updatePosition);
    };
  }, [isOpen, updatePosition]);

  // Close on escape
  useEffect(() => {
    if (!isOpen) return;

    const handleEscape = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        setIsOpen(false);
      }
    };

    document.addEventListener("keydown", handleEscape);
    return () => document.removeEventListener("keydown", handleEscape);
  }, [isOpen]);

  // Close on click outside for click trigger
  useEffect(() => {
    if (!isOpen || trigger !== "click") return;

    const handleClickOutside = (e: MouseEvent) => {
      if (
        triggerRef.current &&
        !triggerRef.current.contains(e.target as Node) &&
        tooltipRef.current &&
        !tooltipRef.current.contains(e.target as Node)
      ) {
        setIsOpen(false);
      }
    };

    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, [isOpen, trigger]);

  // Early return for unknown topic - MUST be after all hooks
  if (!content) {
    console.warn(`HelpTooltip: Unknown topic "${topic}"`);
    return null;
  }

  const sizeClasses = {
    xs: "w-3.5 h-3.5",
    sm: "w-4 h-4",
    md: "w-5 h-5",
  };

  const handleTriggerProps =
    trigger === "hover"
      ? {
          onMouseEnter: () => setIsOpen(true),
          onMouseLeave: () => setIsOpen(false),
          onFocus: () => setIsOpen(true),
          onBlur: () => setIsOpen(false),
        }
      : {
          onClick: () => setIsOpen(!isOpen),
        };

  return (
    <span className={`inline-flex items-center ${className}`}>
      <button
        ref={triggerRef}
        type="button"
        className={`inline-flex items-center justify-center rounded-full text-slate-500 hover:text-slate-300 hover:bg-slate-700/50 focus:outline-none focus:ring-2 focus:ring-primary-500 focus:ring-offset-1 focus:ring-offset-slate-900 transition-colors ${sizeClasses[size]} p-0.5`}
        aria-label={`Help: ${content.title}`}
        aria-describedby={isOpen ? `help-tooltip-${topic}` : undefined}
        {...handleTriggerProps}
      >
        <svg
          xmlns="http://www.w3.org/2000/svg"
          viewBox="0 0 20 20"
          fill="currentColor"
          className="w-full h-full"
        >
          <path
            fillRule="evenodd"
            d="M18 10a8 8 0 1 1-16 0 8 8 0 0 1 16 0ZM8.94 6.94a.75.75 0 1 1-1.061-1.061 3 3 0 1 1 2.871 5.026v.345a.75.75 0 0 1-1.5 0v-.5c0-.72.57-1.172 1.081-1.287A1.5 1.5 0 1 0 8.94 6.94ZM10 15a1 1 0 1 0 0-2 1 1 0 0 0 0 2Z"
            clipRule="evenodd"
          />
        </svg>
      </button>

      {isOpen && (
        <div
          ref={tooltipRef}
          id={`help-tooltip-${topic}`}
          role="tooltip"
          className="fixed z-50 w-72 p-3 bg-slate-800 border border-slate-700 rounded-lg shadow-xl text-sm"
          style={tooltipStyle}
        >
          {/* Arrow indicator */}
          <div
            className={`absolute w-2 h-2 bg-slate-800 border-slate-700 transform rotate-45 ${
              position === "top"
                ? "bottom-[-5px] left-1/2 -translate-x-1/2 border-b border-r"
                : position === "bottom"
                  ? "top-[-5px] left-1/2 -translate-x-1/2 border-t border-l"
                  : position === "left"
                    ? "right-[-5px] top-1/2 -translate-y-1/2 border-t border-r"
                    : "left-[-5px] top-1/2 -translate-y-1/2 border-b border-l"
            }`}
          />

          {/* Header */}
          <div className="flex items-center justify-between mb-2">
            <h4 className="font-semibold text-slate-100">{content.title}</h4>
            <a
              href={`${docsBaseUrl}${content.docPath}`}
              target="_blank"
              rel="noopener noreferrer"
              className="text-xs text-blue-400 hover:text-blue-300 flex items-center gap-1"
            >
              <span>View docs</span>
              <svg
                xmlns="http://www.w3.org/2000/svg"
                viewBox="0 0 16 16"
                fill="currentColor"
                className="w-3 h-3"
              >
                <path d="M6.22 8.72a.75.75 0 0 0 1.06 1.06l5.22-5.22v1.69a.75.75 0 0 0 1.5 0v-3.5a.75.75 0 0 0-.75-.75h-3.5a.75.75 0 0 0 0 1.5h1.69L6.22 8.72Z" />
                <path d="M3.5 6.75c0-.69.56-1.25 1.25-1.25H7A.75.75 0 0 0 7 4H4.75A2.75 2.75 0 0 0 2 6.75v4.5A2.75 2.75 0 0 0 4.75 14h4.5A2.75 2.75 0 0 0 12 11.25V9a.75.75 0 0 0-1.5 0v2.25c0 .69-.56 1.25-1.25 1.25h-4.5c-.69 0-1.25-.56-1.25-1.25v-4.5Z" />
              </svg>
            </a>
          </div>

          {/* Summary */}
          <p className="text-slate-300 text-xs leading-relaxed">
            {content.summary}
          </p>

          {/* Tips */}
          {content.tips && content.tips.length > 0 && (
            <div className="mt-2 pt-2 border-t border-slate-700">
              <p className="text-[10px] text-slate-500 uppercase tracking-wide mb-1">
                Tips
              </p>
              <ul className="text-xs text-slate-400 space-y-0.5">
                {content.tips.map((tip, idx) => (
                  <li key={idx} className="flex items-start gap-1.5">
                    <span className="text-blue-400 mt-0.5">•</span>
                    <span>{tip}</span>
                  </li>
                ))}
              </ul>
            </div>
          )}
        </div>
      )}
    </span>
  );
}

HelpTooltip.displayName = "HelpTooltip";
