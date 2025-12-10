import { useState } from "react";
import {
  useTroubleshooting,
  LogEntry,
  ErrorSummary,
  ServiceHealthStatus,
  DependencyHealth,
} from "../hooks/useTroubleshooting";
import {
  PageContainer,
  PageHeader,
  StatusBadge,
  StatCard,
  DataPanel,
  LoadingGrid,
  ErrorState,
  EmptyState,
  RefreshButton,
  TabGroup,
  StatusType,
} from "../components/shared";

type TabId = "health" | "logs" | "errors";

export function TroubleshootingPage() {
  const {
    logs,
    errorSummary,
    totalErrors24h,
    services,
    servicesSummary,
    dependencies,
    dependenciesSummary,
    loading,
    error,
    lastUpdated,
    availableServices,
    availableLevels,
    refreshLogs,
    refreshAll,
  } = useTroubleshooting({ autoRefresh: true, refreshIntervalMs: 30000 });

  const [activeTab, setActiveTab] = useState<TabId>("health");
  const [serviceFilter, setServiceFilter] = useState("");
  const [levelFilter, setLevelFilter] = useState("");
  const [searchFilter, setSearchFilter] = useState("");

  const handleFilterLogs = () => {
    refreshLogs({
      service: serviceFilter || undefined,
      level: levelFilter || undefined,
      search: searchFilter || undefined,
      limit: 100,
    });
  };

  const getOverallStatus = (): StatusType => {
    const servicesStatus = servicesSummary?.overall_status || "unknown";
    const depsStatus = dependenciesSummary?.overall_status || "unknown";

    if (servicesStatus === "unhealthy" || depsStatus === "unhealthy") {
      return "unhealthy";
    }
    if (servicesStatus === "degraded" || depsStatus === "degraded") {
      return "degraded";
    }
    if (servicesStatus === "healthy" && depsStatus === "healthy") {
      return "healthy";
    }
    return "unknown";
  };

  const getLevelColor = (level: string): string => {
    const colors: Record<string, string> = {
      DEBUG: "text-slate-400",
      INFO: "text-blue-400",
      WARNING: "text-yellow-400",
      ERROR: "text-red-400",
      CRITICAL: "text-red-500 font-bold",
    };
    return colors[level] || "text-slate-400";
  };

  // Loading state
  if (loading && !services.length) {
    return (
      <PageContainer>
        <PageHeader
          title="Troubleshooting"
          description="System health monitoring and log viewer"
        />
        <LoadingGrid count={4} cols={4} />
        <LoadingGrid count={4} cols={2} />
      </PageContainer>
    );
  }

  const tabs = [
    { id: "health" as const, label: "Health Status" },
    { id: "logs" as const, label: "Logs", count: logs.length },
    { id: "errors" as const, label: "Errors", count: totalErrors24h },
  ];

  const overallStatus = getOverallStatus();

  return (
    <PageContainer>
      {/* Header */}
      <PageHeader
        title="Troubleshooting"
        description="System health monitoring and log viewer"
        status={{
          type: overallStatus,
          label: overallStatus.charAt(0).toUpperCase() + overallStatus.slice(1),
        }}
        lastUpdated={lastUpdated}
        actions={<RefreshButton onClick={refreshAll} isLoading={loading} />}
      />

      {/* Error Banner */}
      {error && <ErrorState message={error} onRetry={refreshAll} />}

      {/* Summary Stats */}
      <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-4 gap-4">
        <StatCard
          title="Services"
          value={`${servicesSummary?.healthy ?? 0}/${servicesSummary?.total ?? 0}`}
          icon="🖥️"
          color={
            servicesSummary?.overall_status === "healthy" ? "green" : "yellow"
          }
        />
        <StatCard
          title="Dependencies"
          value={`${dependenciesSummary?.healthy ?? 0}/${dependenciesSummary?.total ?? 0}`}
          icon="🔗"
          color={
            dependenciesSummary?.overall_status === "healthy"
              ? "green"
              : "yellow"
          }
        />
        <StatCard
          title="Errors (24h)"
          value={totalErrors24h}
          icon="⚠️"
          color={
            totalErrors24h > 10
              ? "red"
              : totalErrors24h > 0
                ? "yellow"
                : "green"
          }
        />
        <StatCard
          title="Error Types"
          value={errorSummary.length}
          icon="📋"
          color="blue"
        />
      </div>

      {/* Tabs */}
      <TabGroup
        tabs={tabs}
        activeTab={activeTab}
        onTabChange={(id) => setActiveTab(id as TabId)}
      />

      {/* Tab Content */}
      {activeTab === "health" && (
        <HealthTab
          services={services}
          servicesSummary={servicesSummary}
          dependencies={dependencies}
          dependenciesSummary={dependenciesSummary}
        />
      )}

      {activeTab === "logs" && (
        <LogsTab
          logs={logs}
          availableServices={availableServices}
          availableLevels={availableLevels}
          serviceFilter={serviceFilter}
          levelFilter={levelFilter}
          searchFilter={searchFilter}
          onServiceFilterChange={setServiceFilter}
          onLevelFilterChange={setLevelFilter}
          onSearchFilterChange={setSearchFilter}
          onFilter={handleFilterLogs}
          getLevelColor={getLevelColor}
        />
      )}

      {activeTab === "errors" && (
        <ErrorsTab errorSummary={errorSummary} totalErrors={totalErrors24h} />
      )}
    </PageContainer>
  );
}

// Sub-components

interface HealthTabProps {
  services: ServiceHealthStatus[];
  servicesSummary: {
    total: number;
    healthy: number;
    degraded: number;
    unhealthy: number;
    overall_status: string;
  } | null;
  dependencies: DependencyHealth[];
  dependenciesSummary: {
    total: number;
    healthy: number;
    degraded: number;
    unhealthy: number;
    overall_status: string;
  } | null;
}

function HealthTab({
  services,
  servicesSummary,
  dependencies,
  dependenciesSummary,
}: HealthTabProps) {
  const getStatusType = (status: string): StatusType => {
    const mapping: Record<string, StatusType> = {
      healthy: "healthy",
      degraded: "degraded",
      unhealthy: "unhealthy",
      unknown: "unknown",
    };
    return mapping[status] || "unknown";
  };

  return (
    <div className="space-y-6">
      {/* Services Health Grid */}
      <DataPanel
        title={`Services Health (${servicesSummary?.healthy ?? 0}/${servicesSummary?.total ?? 0} healthy)`}
      >
        {services.length === 0 ? (
          <EmptyState message="No services to display" icon="🖥️" />
        ) : (
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
            {services.map((service) => (
              <div
                key={service.service_name}
                className="p-4 bg-slate-800/30 rounded-lg border border-slate-700"
              >
                <div className="flex items-center justify-between mb-2">
                  <h4 className="font-medium text-slate-200 text-sm">
                    {service.service_name}
                  </h4>
                  <StatusBadge
                    status={getStatusType(service.status)}
                    label={service.status}
                    size="sm"
                  />
                </div>
                <div className="text-xs text-slate-400 space-y-1">
                  {service.latency_ms != null && (
                    <p>Latency: {service.latency_ms.toFixed(1)}ms</p>
                  )}
                  <p>
                    Last check:{" "}
                    {new Date(service.last_check_at).toLocaleTimeString()}
                  </p>
                  {service.error_message && (
                    <p className="text-red-400 truncate">
                      {service.error_message}
                    </p>
                  )}
                </div>
              </div>
            ))}
          </div>
        )}
      </DataPanel>

      {/* Dependencies Health Grid */}
      <DataPanel
        title={`Dependencies Health (${dependenciesSummary?.healthy ?? 0}/${dependenciesSummary?.total ?? 0} healthy)`}
      >
        {dependencies.length === 0 ? (
          <EmptyState message="No dependencies to display" icon="🔗" />
        ) : (
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
            {dependencies.map((dep) => (
              <div
                key={dep.name}
                className="p-4 bg-slate-800/30 rounded-lg border border-slate-700"
              >
                <div className="flex items-center justify-between mb-2">
                  <h4 className="font-medium text-slate-200 text-sm">
                    {dep.name}
                  </h4>
                  <StatusBadge
                    status={getStatusType(dep.status)}
                    label={dep.status}
                    size="sm"
                  />
                </div>
                <div className="text-xs text-slate-400 space-y-1">
                  <p className="capitalize">Type: {dep.type}</p>
                  {dep.version && <p>Version: {dep.version}</p>}
                  {dep.latency_ms != null && (
                    <p>Latency: {dep.latency_ms.toFixed(1)}ms</p>
                  )}
                </div>
              </div>
            ))}
          </div>
        )}
      </DataPanel>
    </div>
  );
}

interface LogsTabProps {
  logs: LogEntry[];
  availableServices: string[];
  availableLevels: string[];
  serviceFilter: string;
  levelFilter: string;
  searchFilter: string;
  onServiceFilterChange: (value: string) => void;
  onLevelFilterChange: (value: string) => void;
  onSearchFilterChange: (value: string) => void;
  onFilter: () => void;
  getLevelColor: (level: string) => string;
}

function LogsTab({
  logs,
  availableServices,
  availableLevels,
  serviceFilter,
  levelFilter,
  searchFilter,
  onServiceFilterChange,
  onLevelFilterChange,
  onSearchFilterChange,
  onFilter,
  getLevelColor,
}: LogsTabProps) {
  return (
    <DataPanel title="System Logs" noPadding>
      {/* Filters */}
      <div className="p-4 border-b border-slate-700 flex flex-wrap gap-3">
        <select
          value={serviceFilter}
          onChange={(e) => onServiceFilterChange(e.target.value)}
          className="px-3 py-1.5 text-sm bg-slate-800 border border-slate-600 rounded text-slate-200"
        >
          <option value="">All Services</option>
          {availableServices.map((svc) => (
            <option key={svc} value={svc}>
              {svc}
            </option>
          ))}
        </select>
        <select
          value={levelFilter}
          onChange={(e) => onLevelFilterChange(e.target.value)}
          className="px-3 py-1.5 text-sm bg-slate-800 border border-slate-600 rounded text-slate-200"
        >
          <option value="">All Levels</option>
          {availableLevels.map((lvl) => (
            <option key={lvl} value={lvl}>
              {lvl}
            </option>
          ))}
        </select>
        <input
          type="text"
          value={searchFilter}
          onChange={(e) => onSearchFilterChange(e.target.value)}
          placeholder="Search logs..."
          className="px-3 py-1.5 text-sm bg-slate-800 border border-slate-600 rounded text-slate-200 placeholder-slate-500 w-48"
        />
        <button
          type="button"
          onClick={onFilter}
          className="px-4 py-1.5 text-sm font-medium bg-blue-600 hover:bg-blue-700 text-white rounded transition-colors"
        >
          Apply
        </button>
      </div>

      {/* Logs List */}
      {logs.length === 0 ? (
        <div className="p-4">
          <EmptyState message="No logs found" icon="📋" />
        </div>
      ) : (
        <div className="max-h-[600px] overflow-y-auto">
          <div className="divide-y divide-slate-800">
            {logs.map((log, index) => (
              <div
                key={`${log.timestamp}-${index}`}
                className="px-4 py-3 hover:bg-slate-800/30 transition-colors"
              >
                <div className="flex items-start gap-3">
                  <span
                    className={`text-xs font-mono w-16 shrink-0 ${getLevelColor(log.level)}`}
                  >
                    {log.level}
                  </span>
                  <span className="text-xs text-slate-500 font-mono w-24 shrink-0">
                    {log.service}
                  </span>
                  <span className="text-sm text-slate-300 flex-1 break-words">
                    {log.message}
                  </span>
                  <span className="text-xs text-slate-600 font-mono shrink-0 hidden lg:block">
                    {new Date(log.timestamp).toLocaleTimeString()}
                  </span>
                </div>
                {log.trace_id && (
                  <div className="mt-1 ml-[6.5rem] text-xs text-slate-600 font-mono">
                    trace: {log.trace_id}
                  </div>
                )}
              </div>
            ))}
          </div>
        </div>
      )}
    </DataPanel>
  );
}

interface ErrorsTabProps {
  errorSummary: ErrorSummary[];
  totalErrors: number;
}

function ErrorsTab({ errorSummary, totalErrors }: ErrorsTabProps) {
  if (errorSummary.length === 0) {
    return (
      <DataPanel title="Error Summary (24h)">
        <EmptyState message="No errors in the last 24 hours" icon="✅" />
      </DataPanel>
    );
  }

  return (
    <DataPanel title={`Error Summary (${totalErrors} errors in 24h)`} noPadding>
      <div className="divide-y divide-slate-800">
        {errorSummary.map((err, index) => (
          <div
            key={`${err.error_type}-${index}`}
            className="p-4 hover:bg-slate-800/30 transition-colors"
          >
            <div className="flex items-start justify-between mb-2">
              <div>
                <h4 className="font-medium text-red-400">{err.error_type}</h4>
                <p className="text-xs text-slate-500 mt-1">
                  Affected: {err.affected_services.join(", ")}
                </p>
              </div>
              <div className="text-right">
                <span className="text-lg font-bold text-red-400">
                  {err.count}
                </span>
                <p className="text-xs text-slate-500">occurrences</p>
              </div>
            </div>
            {err.sample_message && (
              <div className="mt-3 p-3 bg-slate-800/50 rounded text-xs">
                <p className="text-slate-400 mb-1">Sample message:</p>
                <p className="text-slate-300 font-mono">{err.sample_message}</p>
                {err.sample_trace_id && (
                  <p className="text-slate-500 mt-2 font-mono">
                    Trace: {err.sample_trace_id}
                  </p>
                )}
              </div>
            )}
            <p className="text-xs text-slate-500 mt-2">
              Last occurrence: {new Date(err.last_occurrence).toLocaleString()}
            </p>
          </div>
        ))}
      </div>
    </DataPanel>
  );
}
