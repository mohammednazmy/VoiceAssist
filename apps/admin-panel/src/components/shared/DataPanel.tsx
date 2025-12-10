/**
 * DataPanel - Section container with optional header and actions
 */
import { ReactNode } from "react";

interface DataPanelProps {
  title?: string;
  subtitle?: string;
  headerAction?: ReactNode;
  children: ReactNode;
  className?: string;
  noPadding?: boolean;
}

export function DataPanel({
  title,
  subtitle,
  headerAction,
  children,
  className = "",
  noPadding = false,
}: DataPanelProps) {
  const hasHeader = title || headerAction;

  return (
    <div
      className={`bg-slate-900/50 border border-slate-800 rounded-lg overflow-hidden ${className}`}
    >
      {hasHeader && (
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 px-4 py-3 border-b border-slate-800 bg-slate-800/30">
          <div>
            {title && (
              <h3 className="text-sm font-semibold text-slate-200">{title}</h3>
            )}
            {subtitle && (
              <p className="text-xs text-slate-500 mt-0.5">{subtitle}</p>
            )}
          </div>
          {headerAction && (
            <div className="flex items-center gap-2 flex-shrink-0">
              {headerAction}
            </div>
          )}
        </div>
      )}
      <div className={noPadding ? "" : "p-4"}>{children}</div>
    </div>
  );
}
