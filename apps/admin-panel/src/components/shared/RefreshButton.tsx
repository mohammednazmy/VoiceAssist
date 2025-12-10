/**
 * RefreshButton - Consistent refresh action button
 */

interface RefreshButtonProps {
  onClick: () => void;
  isLoading?: boolean;
  label?: string;
  size?: "sm" | "md";
  className?: string;
}

export function RefreshButton({
  onClick,
  isLoading = false,
  label = "Refresh",
  size = "md",
  className = "",
}: RefreshButtonProps) {
  const sizeClasses = {
    sm: "px-2 py-1 text-xs",
    md: "px-3 py-1.5 text-sm",
  };

  return (
    <button
      type="button"
      onClick={onClick}
      disabled={isLoading}
      className={`
        ${sizeClasses[size]}
        rounded-md border border-slate-700 bg-slate-800 text-slate-200
        hover:bg-slate-700 transition-colors
        disabled:opacity-50 disabled:cursor-not-allowed
        flex items-center gap-1.5
        ${className}
      `}
    >
      <span
        className={`text-sm ${isLoading ? "animate-spin" : ""}`}
        aria-hidden="true"
      >
        ↻
      </span>
      <span>{isLoading ? "Refreshing..." : label}</span>
    </button>
  );
}
