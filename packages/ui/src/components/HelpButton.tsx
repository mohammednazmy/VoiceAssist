/**
 * HelpButton Component
 *
 * A contextual help button that links to relevant documentation.
 * Uses Radix UI Tooltip for accessible hover/focus hints.
 *
 * Features:
 * - Links to assistdocs.asimo.io documentation
 * - Support for section anchors
 * - Customizable tooltip text
 * - Two size variants
 * - ARIA-compliant accessibility
 *
 * @example
 * <HelpButton docPath="admin/knowledge-base" />
 * <HelpButton docPath="api-reference/rest-api" section="authentication" />
 */

import * as Tooltip from "@radix-ui/react-tooltip";
import { cn } from "../lib/utils";

export interface HelpButtonProps {
  /**
   * Documentation path relative to docs site (e.g., "admin/knowledge-base")
   */
  docPath: string;

  /**
   * Optional section anchor within the doc (e.g., "permissions")
   */
  section?: string;

  /**
   * Size variant
   * @default "sm"
   */
  size?: "sm" | "md";

  /**
   * Custom tooltip text
   * @default "View documentation"
   */
  tooltipText?: string;

  /**
   * Base URL for docs site
   * Defaults to VITE_DOCS_URL env var or https://assistdocs.asimo.io/
   */
  docsBaseUrl?: string;

  /**
   * Additional className for the button
   */
  className?: string;

  /**
   * Tooltip placement side
   * @default "top"
   */
  side?: "top" | "right" | "bottom" | "left";
}

const sizeClasses = {
  sm: "w-4 h-4 text-[10px]",
  md: "w-5 h-5 text-xs",
};

export function HelpButton({
  docPath,
  section,
  size = "sm",
  tooltipText = "View documentation",
  docsBaseUrl,
  className,
  side = "top",
}: HelpButtonProps) {
  // Get base URL from props, env, or default
  const baseUrl =
    docsBaseUrl ||
    (typeof window !== "undefined" && (window as any).__DOCS_URL__) ||
    "https://assistdocs.asimo.io/";

  // Normalize base URL to end with /
  const normalizedBase = baseUrl.endsWith("/") ? baseUrl : `${baseUrl}/`;

  // Build full URL with optional section anchor
  const href = `${normalizedBase}${docPath}${section ? `#${section}` : ""}`;

  return (
    <Tooltip.Provider delayDuration={200}>
      <Tooltip.Root>
        <Tooltip.Trigger asChild>
          <a
            href={href}
            target="_blank"
            rel="noopener noreferrer"
            className={cn(
              "inline-flex items-center justify-center rounded-full",
              "border border-slate-600 bg-slate-800",
              "hover:bg-slate-700 hover:border-slate-500",
              "text-slate-400 hover:text-slate-200",
              "transition-colors duration-150",
              "cursor-help focus:outline-none focus:ring-2 focus:ring-primary-500 focus:ring-offset-1 focus:ring-offset-slate-900",
              sizeClasses[size],
              className,
            )}
            aria-label={tooltipText}
          >
            ?
          </a>
        </Tooltip.Trigger>
        <Tooltip.Portal>
          <Tooltip.Content
            className={cn(
              "z-50 rounded-md bg-slate-900 px-2.5 py-1.5",
              "text-xs text-slate-200 shadow-lg",
              "border border-slate-700",
              "animate-in fade-in-0 zoom-in-95",
              "data-[state=closed]:animate-out data-[state=closed]:fade-out-0 data-[state=closed]:zoom-out-95",
            )}
            side={side}
            sideOffset={5}
          >
            {tooltipText}
            <Tooltip.Arrow className="fill-slate-900" />
          </Tooltip.Content>
        </Tooltip.Portal>
      </Tooltip.Root>
    </Tooltip.Provider>
  );
}

HelpButton.displayName = "HelpButton";
