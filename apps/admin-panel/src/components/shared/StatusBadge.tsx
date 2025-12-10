/**
 * StatusBadge - Consistent status indicator badges
 */

export type StatusType =
  | "healthy"
  | "connected"
  | "online"
  | "active"
  | "success"
  | "enabled"
  | "degraded"
  | "warning"
  | "pending"
  | "unhealthy"
  | "disconnected"
  | "offline"
  | "error"
  | "failed"
  | "critical"
  | "disabled"
  | "inactive"
  | "unknown"
  | "not_configured";

interface StatusBadgeProps {
  status: StatusType;
  label?: string;
  size?: "sm" | "md" | "lg";
  showDot?: boolean;
}

const statusColors: Record<string, string> = {
  // Green statuses
  healthy: "bg-green-900/50 text-green-400 border-green-800",
  connected: "bg-green-900/50 text-green-400 border-green-800",
  online: "bg-green-900/50 text-green-400 border-green-800",
  active: "bg-green-900/50 text-green-400 border-green-800",
  success: "bg-green-900/50 text-green-400 border-green-800",
  enabled: "bg-green-900/50 text-green-400 border-green-800",

  // Yellow statuses
  degraded: "bg-yellow-900/50 text-yellow-400 border-yellow-800",
  warning: "bg-yellow-900/50 text-yellow-400 border-yellow-800",
  pending: "bg-yellow-900/50 text-yellow-400 border-yellow-800",

  // Red statuses
  unhealthy: "bg-red-900/50 text-red-400 border-red-800",
  disconnected: "bg-red-900/50 text-red-400 border-red-800",
  offline: "bg-red-900/50 text-red-400 border-red-800",
  error: "bg-red-900/50 text-red-400 border-red-800",
  failed: "bg-red-900/50 text-red-400 border-red-800",
  critical: "bg-red-900/50 text-red-400 border-red-800",

  // Gray statuses
  disabled: "bg-slate-900/50 text-slate-400 border-slate-700",
  inactive: "bg-slate-900/50 text-slate-400 border-slate-700",
  unknown: "bg-slate-900/50 text-slate-400 border-slate-700",
  not_configured: "bg-slate-900/50 text-slate-400 border-slate-700",
};

const sizeClasses = {
  sm: "px-1.5 py-0.5 text-[10px]",
  md: "px-2 py-0.5 text-xs",
  lg: "px-3 py-1 text-sm",
};

export function StatusBadge({
  status,
  label,
  size = "md",
  showDot = true,
}: StatusBadgeProps) {
  const colorClass = statusColors[status] || statusColors.unknown;
  const sizeClass = sizeClasses[size];

  const formatLabel = (s: string) => {
    return s
      .split("_")
      .map((word) => word.charAt(0).toUpperCase() + word.slice(1))
      .join(" ");
  };

  const displayLabel = label || formatLabel(status);

  return (
    <span
      className={`inline-flex items-center gap-1 rounded-full font-medium border ${colorClass} ${sizeClass}`}
    >
      {showDot && <span className="w-1.5 h-1.5 rounded-full bg-current" />}
      {displayLabel}
    </span>
  );
}
