/**
 * IntegrationsWidget - Dashboard widget showing integration health summary
 */

import { Link } from "react-router-dom";
import { useIntegrations } from "../../hooks/useIntegrations";

export function IntegrationsWidget() {
  const { health, loading, error } = useIntegrations({
    autoRefresh: true,
    refreshIntervalMs: 60000,
  });

  const getStatusColor = (status: string) => {
    switch (status) {
      case "healthy":
        return "text-green-400 border-green-800 bg-green-900/30";
      case "degraded":
        return "text-yellow-400 border-yellow-800 bg-yellow-900/30";
      case "unhealthy":
      case "critical":
        return "text-red-400 border-red-800 bg-red-900/30";
      default:
        return "text-slate-400 border-slate-700 bg-slate-800/50";
    }
  };

  const formatStatus = (status: string) => {
    return status.charAt(0).toUpperCase() + status.slice(1);
  };

  if (loading && !health) {
    return (
      <div className="bg-slate-900/50 border border-slate-800 rounded-lg p-4 animate-pulse">
        <div className="flex items-center justify-between mb-4">
          <div className="h-4 w-32 bg-slate-800 rounded" />
          <div className="h-6 w-20 bg-slate-800 rounded-full" />
        </div>
        <div className="grid grid-cols-4 gap-3">
          {Array.from({ length: 4 }).map((_, idx) => (
            <div key={idx} className="text-center">
              <div className="h-6 w-8 bg-slate-800 rounded mx-auto" />
              <div className="h-3 w-16 bg-slate-800 rounded mx-auto mt-1" />
            </div>
          ))}
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="bg-slate-900/50 border border-red-900/50 rounded-lg p-4">
        <div className="flex items-center justify-between">
          <span className="text-sm font-medium text-slate-300">
            🔗 Integrations
          </span>
          <span className="text-xs text-red-400">Error loading</span>
        </div>
      </div>
    );
  }

  if (!health) {
    return null;
  }

  return (
    <div className="bg-slate-900/50 border border-slate-800 rounded-lg p-4 hover:border-slate-700 transition-colors">
      <div className="flex items-center justify-between mb-4">
        <span className="text-sm font-medium text-slate-300">
          🔗 Integrations
        </span>
        <span
          className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium border ${getStatusColor(health.overall_status)}`}
        >
          {health.overall_status === "healthy" && "● "}
          {formatStatus(health.overall_status)}
        </span>
      </div>

      <div className="grid grid-cols-4 gap-3 mb-4">
        <div className="text-center">
          <div className="text-lg font-bold text-green-400">
            {health.connected}
          </div>
          <div className="text-[10px] text-slate-500 uppercase tracking-wide">
            Connected
          </div>
        </div>
        <div className="text-center">
          <div className="text-lg font-bold text-yellow-400">
            {health.degraded}
          </div>
          <div className="text-[10px] text-slate-500 uppercase tracking-wide">
            Degraded
          </div>
        </div>
        <div className="text-center">
          <div className="text-lg font-bold text-red-400">{health.errors}</div>
          <div className="text-[10px] text-slate-500 uppercase tracking-wide">
            Errors
          </div>
        </div>
        <div className="text-center">
          <div className="text-lg font-bold text-slate-400">
            {health.not_configured}
          </div>
          <div className="text-[10px] text-slate-500 uppercase tracking-wide">
            Not Set
          </div>
        </div>
      </div>

      <Link
        to="/integrations"
        className="block w-full text-center text-xs text-blue-400 hover:text-blue-300 transition-colors"
      >
        View all {health.total_integrations} integrations →
      </Link>
    </div>
  );
}
