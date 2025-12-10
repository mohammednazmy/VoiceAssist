import { ServiceStatus } from "../components/dashboard/ServiceStatus";
import { MetricCard } from "../components/dashboard/MetricCard";
import { IntegrationsWidget } from "../components/dashboard/IntegrationsWidget";
import { ActivityFeed } from "../components/dashboard/ActivityFeed";
import { useMetrics } from "../hooks/useMetrics";

export function DashboardPage() {
  const {
    metrics,
    health,
    loading,
    error,
    lastUpdated,
    connectionStatus,
    autoRefresh,
    isPaused,
    refreshNow,
    toggleAutoRefresh,
    togglePause,
  } = useMetrics();

  const renderMetricCards = () => {
    if (loading && !metrics) {
      return (
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          {Array.from({ length: 3 }).map((_, idx) => (
            <div
              key={idx}
              className="bg-slate-900/50 border border-slate-800 rounded-lg p-4 animate-pulse"
            >
              <div className="h-3 w-20 bg-slate-800 rounded" />
              <div className="h-8 w-16 bg-slate-800 rounded mt-3" />
              <div className="h-2 w-24 bg-slate-900 rounded mt-2" />
            </div>
          ))}
        </div>
      );
    }

    return (
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        <MetricCard
          title="Total Users"
          value={metrics?.total_users ?? 0}
          icon="👥"
          color="blue"
          showControls
          connectionStatus={connectionStatus}
          lastUpdated={lastUpdated}
          autoRefresh={autoRefresh}
          isPaused={isPaused}
          onToggleAutoRefresh={toggleAutoRefresh}
          onTogglePause={togglePause}
          onRefresh={refreshNow}
        />
        <MetricCard
          title="Active Users"
          value={metrics?.active_users ?? 0}
          icon="✓"
          color="green"
        />
        <MetricCard
          title="Admin Users"
          value={metrics?.admin_users ?? 0}
          icon="⚙️"
          color="purple"
        />
      </div>
    );
  };

  const renderServiceCards = () => {
    if (loading) {
      return (
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          {Array.from({ length: 3 }).map((_, idx) => (
            <div
              key={idx}
              className="bg-slate-900/50 border border-slate-800 rounded-lg p-4 animate-pulse"
            >
              <div className="h-3 w-24 bg-slate-800 rounded" />
              <div className="h-4 w-16 bg-slate-800 rounded mt-4" />
            </div>
          ))}
        </div>
      );
    }

    return (
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        <ServiceCard name="PostgreSQL" healthy={health?.database || false} />
        <ServiceCard name="Redis" healthy={health?.redis || false} />
        <ServiceCard name="Qdrant" healthy={health?.qdrant || false} />
      </div>
    );
  };

  return (
    <div className="flex-1 p-6 space-y-6 overflow-y-auto">
      <div className="flex items-start justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-slate-100">Dashboard</h1>
          <p className="text-sm text-slate-400 mt-1">
            System overview and key metrics
          </p>
        </div>
        <ServiceStatus />
      </div>

      {error && (
        <div className="p-4 bg-red-950/50 border border-red-900 rounded-lg text-red-400">
          {error}
        </div>
      )}

      <div className="space-y-4">
        <div>
          <div className="flex items-center justify-between gap-3 mb-3">
            <h2 className="text-lg font-semibold text-slate-200">
              User Metrics
            </h2>
            <div className="flex items-center gap-2 text-xs text-slate-300">
              <span
                className={`inline-flex items-center gap-2 px-3 py-1 rounded-full border ${
                  connectionStatus === "open"
                    ? "text-emerald-400 border-emerald-500/50 bg-emerald-500/10"
                    : "text-slate-400 border-slate-600 bg-slate-800/60"
                }`}
              >
                <span className="h-2 w-2 rounded-full bg-current" aria-hidden />
                {connectionStatus === "open" ? "Live" : "Offline"}
              </span>
              <span className="px-3 py-1 rounded-md bg-slate-800/60 border border-slate-700">
                {lastUpdated
                  ? `Last updated ${new Date(lastUpdated).toLocaleTimeString()}`
                  : "Awaiting first update"}
              </span>
              <button
                type="button"
                onClick={refreshNow}
                className="px-3 py-1 rounded-md border border-slate-700 bg-slate-800 text-slate-200 hover:bg-slate-700 transition-colors"
              >
                Manual refresh
              </button>
            </div>
          </div>
          {renderMetricCards()}
        </div>

        <div>
          <h2 className="text-lg font-semibold text-slate-200 mb-3">
            Service Health
          </h2>
          {renderServiceCards()}
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
          <div>
            <h2 className="text-lg font-semibold text-slate-200 mb-3">
              External Integrations
            </h2>
            <IntegrationsWidget />
          </div>
          <div>
            <h2 className="text-lg font-semibold text-slate-200 mb-3">
              Activity Feed
            </h2>
            <ActivityFeed />
          </div>
        </div>
      </div>

      <div className="text-xs text-slate-500">
        {lastUpdated ? (
          <>Last updated: {new Date(lastUpdated).toLocaleString()}</>
        ) : (
          "Waiting for first successful sync…"
        )}
      </div>
    </div>
  );
}

function ServiceCard({ name, healthy }: { name: string; healthy: boolean }) {
  return (
    <div className="bg-slate-900/50 border border-slate-800 rounded-lg p-4">
      <div className="flex items-center justify-between">
        <span className="text-sm font-medium text-slate-300">{name}</span>
        <span
          className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium ${
            healthy
              ? "bg-green-900/50 text-green-400 border border-green-800"
              : "bg-red-900/50 text-red-400 border border-red-800"
          }`}
        >
          {healthy ? "● Online" : "● Offline"}
        </span>
      </div>
    </div>
  );
}
