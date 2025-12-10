import { ConnectionStatus } from "../../services/websocket";

const statusStyles: Record<ConnectionStatus, string> = {
  connecting: "text-amber-400 border-amber-500/50 bg-amber-500/10",
  open: "text-emerald-400 border-emerald-500/50 bg-emerald-500/10",
  reconnecting: "text-sky-400 border-sky-500/50 bg-sky-500/10",
  closed: "text-slate-400 border-slate-500/50 bg-slate-500/10",
  error: "text-red-400 border-red-500/50 bg-red-500/10",
};

export interface MetricCardProps {
  title: string;
  value: number;
  icon: string;
  color: "blue" | "green" | "purple";
  connectionStatus?: ConnectionStatus;
  lastUpdated?: string | null;
  autoRefresh?: boolean;
  isPaused?: boolean;
  showControls?: boolean;
  onToggleAutoRefresh?: () => void;
  onTogglePause?: () => void;
  onRefresh?: () => void;
}

const colorThemes = {
  blue: "from-blue-900/50 to-blue-950/30 border-blue-800 text-blue-400",
  green: "from-green-900/50 to-green-950/30 border-green-800 text-green-400",
  purple:
    "from-purple-900/50 to-purple-950/30 border-purple-800 text-purple-400",
};

export function MetricCard({
  title,
  value,
  icon,
  color,
  connectionStatus,
  lastUpdated,
  autoRefresh,
  isPaused,
  showControls = false,
  onToggleAutoRefresh,
  onTogglePause,
  onRefresh,
}: MetricCardProps) {
  const renderStatus = () => {
    if (!connectionStatus) return null;
    return (
      <div
        className={`inline-flex items-center gap-2 px-3 py-1 rounded-full border ${statusStyles[connectionStatus]}`}
      >
        <span className="h-2 w-2 rounded-full bg-current" aria-hidden />
        <span className="text-xs font-medium capitalize">
          {connectionStatus}
        </span>
      </div>
    );
  };

  const renderControls = () => {
    if (!showControls) return null;
    return (
      <div className="flex flex-wrap items-center gap-2 text-xs text-slate-200">
        {renderStatus()}
        {lastUpdated && (
          <span className="px-3 py-1 rounded-full bg-slate-800/60 border border-slate-700">
            Last updated {new Date(lastUpdated).toLocaleTimeString()}
          </span>
        )}
        <button
          type="button"
          onClick={onToggleAutoRefresh}
          className={`px-3 py-1 rounded-md border text-xs font-medium transition-colors ${
            autoRefresh
              ? "border-emerald-500/40 text-emerald-300 bg-emerald-500/10"
              : "border-slate-600 text-slate-200 bg-slate-800"
          }`}
        >
          {autoRefresh ? "Auto-refresh on" : "Auto-refresh off"}
        </button>
        <button
          type="button"
          onClick={onTogglePause}
          className={`px-3 py-1 rounded-md border text-xs font-medium transition-colors ${
            isPaused
              ? "border-amber-500/40 text-amber-200 bg-amber-500/10"
              : "border-blue-500/40 text-blue-200 bg-blue-500/10"
          }`}
        >
          {isPaused ? "Resume" : "Pause"}
        </button>
        <button
          type="button"
          onClick={onRefresh}
          className="px-3 py-1 rounded-md border border-slate-600 text-slate-200 bg-slate-800 hover:bg-slate-700 transition-colors"
        >
          Refresh now
        </button>
      </div>
    );
  };

  return (
    <div
      className={`bg-gradient-to-br ${colorThemes[color]} border rounded-lg p-4 space-y-3`}
    >
      <div className="flex items-center justify-between">
        <div className="text-sm text-slate-300">{title}</div>
        <span className="text-2xl" aria-hidden>
          {icon}
        </span>
      </div>

      <div className="flex items-end justify-between">
        <span className="text-3xl font-bold">{value}</span>
      </div>

      {renderControls()}
    </div>
  );
}
