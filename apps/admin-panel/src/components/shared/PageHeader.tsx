/**
 * PageHeader - Consistent page header with title, description, status, and actions
 */
import { ReactNode } from "react";
import { StatusBadge, StatusType } from "./StatusBadge";

interface PageHeaderProps {
  title: string;
  description?: string;
  status?: {
    type: StatusType;
    label: string;
  };
  lastUpdated?: Date | string | null;
  actions?: ReactNode;
  className?: string;
}

export function PageHeader({
  title,
  description,
  status,
  lastUpdated,
  actions,
  className = "",
}: PageHeaderProps) {
  const formatLastUpdated = (date: Date | string | null) => {
    if (!date) return null;
    const d = typeof date === "string" ? new Date(date) : date;
    return d.toLocaleTimeString();
  };

  return (
    <div
      className={`flex flex-col sm:flex-row sm:items-start justify-between gap-4 ${className}`}
    >
      <div className="min-w-0 flex-1">
        <div className="flex items-center gap-3 flex-wrap">
          <h1 className="text-xl md:text-2xl font-bold text-slate-100 truncate">
            {title}
          </h1>
          {status && <StatusBadge status={status.type} label={status.label} />}
        </div>
        {description && (
          <p className="text-sm text-slate-400 mt-1">{description}</p>
        )}
        {lastUpdated && (
          <p className="text-xs text-slate-500 mt-1">
            Last updated: {formatLastUpdated(lastUpdated)}
          </p>
        )}
      </div>
      {actions && (
        <div className="flex items-center gap-2 flex-shrink-0 flex-wrap">
          {actions}
        </div>
      )}
    </div>
  );
}
