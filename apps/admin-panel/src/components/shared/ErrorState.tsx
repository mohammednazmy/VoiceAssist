/**
 * ErrorState - Consistent error display with retry action
 */

interface ErrorStateProps {
  message: string;
  onRetry?: () => void;
  retryLabel?: string;
  className?: string;
}

export function ErrorState({
  message,
  onRetry,
  retryLabel = "Retry",
  className = "",
}: ErrorStateProps) {
  return (
    <div
      className={`p-4 bg-red-950/50 border border-red-900 rounded-lg flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3 ${className}`}
      role="alert"
    >
      <div className="flex items-start gap-3">
        <span className="text-red-400 text-lg flex-shrink-0" aria-hidden="true">
          ⚠️
        </span>
        <span className="text-red-400 text-sm">{message}</span>
      </div>
      {onRetry && (
        <button
          onClick={onRetry}
          className="px-3 py-1.5 text-xs bg-red-900/50 border border-red-800 rounded-md text-red-100 hover:bg-red-900 transition-colors whitespace-nowrap"
        >
          {retryLabel}
        </button>
      )}
    </div>
  );
}
