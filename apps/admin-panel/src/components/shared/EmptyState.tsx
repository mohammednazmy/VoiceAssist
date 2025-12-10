/**
 * EmptyState - Consistent empty content messaging
 */
import { ReactNode } from "react";

interface EmptyStateProps {
  title?: string;
  message: string;
  icon?: string;
  action?: {
    label: string;
    onClick: () => void;
    disabled?: boolean;
  };
  children?: ReactNode;
  className?: string;
}

export function EmptyState({
  title,
  message,
  icon = "📭",
  action,
  children,
  className = "",
}: EmptyStateProps) {
  return (
    <div
      className={`bg-slate-900/50 border border-slate-800 rounded-lg p-8 text-center ${className}`}
    >
      <div className="text-4xl mb-4" aria-hidden="true">
        {icon}
      </div>
      {title && (
        <h3 className="text-lg font-medium text-slate-200 mb-2">{title}</h3>
      )}
      <p className="text-sm text-slate-400 max-w-md mx-auto">{message}</p>
      {action && (
        <button
          onClick={action.onClick}
          disabled={action.disabled}
          className="mt-4 px-4 py-2 bg-blue-600 hover:bg-blue-700 disabled:bg-blue-950 disabled:text-slate-500 text-white rounded-md text-sm font-medium transition-colors"
        >
          {action.label}
        </button>
      )}
      {children && <div className="mt-4">{children}</div>}
    </div>
  );
}
