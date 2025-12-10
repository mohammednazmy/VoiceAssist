import { useState } from "react";
import { useAuth } from "../contexts/AuthContext";
import {
  useTools,
  ToolStatus,
  ToolInvocationLog,
  ToolAnalytics,
} from "../hooks/useTools";
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
  ConfirmDialog,
  TabGroup,
  StatusType,
} from "../components/shared";

type TabId = "registry" | "logs" | "analytics";

export function ToolsPage() {
  const { isAdmin } = useAuth();
  const {
    tools,
    summary,
    logs,
    analytics,
    analyticsSummary,
    loading,
    error,
    lastUpdated,
    refreshAll,
    refreshLogs,
    updateToolConfig,
  } = useTools({ autoRefresh: true, refreshIntervalMs: 30000 });

  const [activeTab, setActiveTab] = useState<TabId>("registry");
  const [selectedTool, setSelectedTool] = useState<ToolStatus | null>(null);
  const [confirmToggle, setConfirmToggle] = useState<ToolStatus | null>(null);
  const [updating, setUpdating] = useState(false);
  const [logFilter, setLogFilter] = useState<string>("");
  const [statusFilter, setStatusFilter] = useState<string>("");

  const handleToggleTool = async () => {
    if (!confirmToggle || !isAdmin) return;
    setUpdating(true);
    await updateToolConfig(confirmToggle.tool_name, {
      enabled: !confirmToggle.enabled,
    });
    setUpdating(false);
    setConfirmToggle(null);
  };

  const handleFilterLogs = () => {
    refreshLogs({
      tool_name: logFilter || undefined,
      status: statusFilter || undefined,
      limit: 100,
    });
  };

  const getCategoryColor = (
    category: string,
  ): "blue" | "green" | "purple" | "yellow" | "red" => {
    const colors: Record<
      string,
      "blue" | "green" | "purple" | "yellow" | "red"
    > = {
      calendar: "blue",
      file: "green",
      medical: "purple",
      search: "yellow",
      email: "blue",
      calculation: "green",
      integration: "purple",
    };
    return colors[category] || "blue";
  };

  const getStatusBadge = (
    status: string,
  ): { type: StatusType; label: string } => {
    const mapping: Record<string, { type: StatusType; label: string }> = {
      completed: { type: "healthy", label: "Completed" },
      failed: { type: "unhealthy", label: "Failed" },
      timeout: { type: "degraded", label: "Timeout" },
      cancelled: { type: "unknown", label: "Cancelled" },
    };
    return mapping[status] || { type: "unknown", label: status };
  };

  // Loading state
  if (loading && !tools.length) {
    return (
      <PageContainer>
        <PageHeader
          title="Tools Admin"
          description="Manage AI assistant tools and view usage analytics"
        />
        <LoadingGrid count={4} cols={4} />
        <LoadingGrid count={6} cols={1} />
      </PageContainer>
    );
  }

  const tabs = [
    { id: "registry" as const, label: "Tool Registry", count: tools.length },
    { id: "logs" as const, label: "Invocation Logs", count: logs.length },
    { id: "analytics" as const, label: "Analytics" },
  ];

  return (
    <PageContainer>
      {/* Header */}
      <PageHeader
        title="Tools Admin"
        description="Manage AI assistant tools and view usage analytics"
        lastUpdated={lastUpdated}
        actions={<RefreshButton onClick={refreshAll} isLoading={loading} />}
      />

      {/* Error Banner */}
      {error && <ErrorState message={error} onRetry={refreshAll} />}

      {/* Summary Stats */}
      <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-4 gap-4">
        <StatCard
          title="Total Tools"
          value={summary?.total ?? 0}
          icon="🔧"
          color="blue"
        />
        <StatCard
          title="Enabled"
          value={summary?.enabled_count ?? 0}
          icon="✅"
          color="green"
        />
        <StatCard
          title="Disabled"
          value={summary?.disabled_count ?? 0}
          icon="⏸️"
          color="yellow"
        />
        <StatCard
          title="Calls (24h)"
          value={summary?.total_calls_24h ?? 0}
          icon="📊"
          color="purple"
        />
      </div>

      {/* Tabs */}
      <TabGroup
        tabs={tabs}
        activeTab={activeTab}
        onTabChange={(id) => setActiveTab(id as TabId)}
      />

      {/* Tab Content */}
      {activeTab === "registry" && (
        <ToolRegistryTab
          tools={tools}
          isAdmin={isAdmin}
          onToggle={setConfirmToggle}
          onSelect={setSelectedTool}
          getCategoryColor={getCategoryColor}
        />
      )}

      {activeTab === "logs" && (
        <ToolLogsTab
          logs={logs}
          tools={tools}
          logFilter={logFilter}
          statusFilter={statusFilter}
          onLogFilterChange={setLogFilter}
          onStatusFilterChange={setStatusFilter}
          onFilter={handleFilterLogs}
          getStatusBadge={getStatusBadge}
        />
      )}

      {activeTab === "analytics" && (
        <ToolAnalyticsTab
          analytics={analytics}
          summary={analyticsSummary}
          getCategoryColor={getCategoryColor}
        />
      )}

      {/* Tool Detail Modal - placeholder */}
      {selectedTool && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50">
          <div className="bg-slate-900 rounded-lg p-6 max-w-lg w-full mx-4 border border-slate-700">
            <h3 className="text-lg font-semibold text-slate-100 mb-4">
              {selectedTool.display_name}
            </h3>
            <div className="space-y-3 text-sm">
              <p className="text-slate-400">{selectedTool.description}</p>
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <span className="text-slate-500">Category:</span>{" "}
                  <span className="text-slate-300 capitalize">
                    {selectedTool.category}
                  </span>
                </div>
                <div>
                  <span className="text-slate-500">Status:</span>{" "}
                  <StatusBadge
                    status={selectedTool.enabled ? "online" : "offline"}
                    label={selectedTool.enabled ? "Enabled" : "Disabled"}
                    size="sm"
                  />
                </div>
                <div>
                  <span className="text-slate-500">PHI Enabled:</span>{" "}
                  <span className="text-slate-300">
                    {selectedTool.phi_enabled ? "Yes" : "No"}
                  </span>
                </div>
                <div>
                  <span className="text-slate-500">Confirmation:</span>{" "}
                  <span className="text-slate-300">
                    {selectedTool.requires_confirmation
                      ? "Required"
                      : "Not Required"}
                  </span>
                </div>
                <div>
                  <span className="text-slate-500">Success Rate:</span>{" "}
                  <span className="text-slate-300">
                    {(selectedTool.success_rate * 100).toFixed(1)}%
                  </span>
                </div>
                <div>
                  <span className="text-slate-500">Avg Duration:</span>{" "}
                  <span className="text-slate-300">
                    {selectedTool.avg_duration_ms.toFixed(0)}ms
                  </span>
                </div>
              </div>
              {selectedTool.last_error && (
                <div className="mt-4 p-3 bg-red-900/30 rounded border border-red-800">
                  <p className="text-red-400 text-xs font-medium">
                    Last Error:
                  </p>
                  <p className="text-red-300 text-sm mt-1">
                    {selectedTool.last_error}
                  </p>
                </div>
              )}
            </div>
            <div className="mt-6 flex justify-end">
              <button
                type="button"
                onClick={() => setSelectedTool(null)}
                className="px-4 py-2 text-sm font-medium text-slate-300 hover:text-slate-100 bg-slate-800 hover:bg-slate-700 rounded transition-colors"
              >
                Close
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Toggle Confirmation Dialog */}
      <ConfirmDialog
        isOpen={!!confirmToggle}
        onClose={() => setConfirmToggle(null)}
        onConfirm={handleToggleTool}
        title={confirmToggle?.enabled ? "Disable Tool" : "Enable Tool"}
        message={
          <>
            Are you sure you want to{" "}
            {confirmToggle?.enabled ? "disable" : "enable"}{" "}
            <strong className="text-slate-200">
              {confirmToggle?.display_name}
            </strong>
            ?{" "}
            {confirmToggle?.enabled
              ? "Users will no longer be able to use this tool."
              : "This tool will become available to users."}
          </>
        }
        confirmLabel={confirmToggle?.enabled ? "Disable" : "Enable"}
        variant={confirmToggle?.enabled ? "danger" : "primary"}
        isLoading={updating}
      />
    </PageContainer>
  );
}

// Sub-components

interface ToolRegistryTabProps {
  tools: ToolStatus[];
  isAdmin: boolean;
  onToggle: (tool: ToolStatus) => void;
  onSelect: (tool: ToolStatus) => void;
  getCategoryColor: (
    category: string,
  ) => "blue" | "green" | "purple" | "yellow" | "red";
}

function ToolRegistryTab({
  tools,
  isAdmin,
  onToggle,
  onSelect,
  getCategoryColor: _getCategoryColor,
}: ToolRegistryTabProps) {
  if (tools.length === 0) {
    return (
      <DataPanel title="Tool Registry">
        <EmptyState message="No tools registered" icon="🔧" />
      </DataPanel>
    );
  }

  // Group by category
  const byCategory = tools.reduce(
    (acc, tool) => {
      if (!acc[tool.category]) acc[tool.category] = [];
      acc[tool.category].push(tool);
      return acc;
    },
    {} as Record<string, ToolStatus[]>,
  );

  return (
    <div className="space-y-6">
      {Object.entries(byCategory).map(([category, categoryTools]) => (
        <DataPanel
          key={category}
          title={`${category.charAt(0).toUpperCase() + category.slice(1)} Tools`}
        >
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
            {categoryTools.map((tool) => (
              <div
                key={tool.tool_name}
                className="p-4 bg-slate-800/30 rounded-lg border border-slate-700 hover:border-slate-600 transition-colors cursor-pointer"
                onClick={() => onSelect(tool)}
              >
                <div className="flex items-start justify-between mb-2">
                  <h4 className="font-medium text-slate-200 text-sm">
                    {tool.display_name}
                  </h4>
                  <StatusBadge
                    status={tool.enabled ? "online" : "offline"}
                    label={tool.enabled ? "On" : "Off"}
                    size="sm"
                  />
                </div>
                <p className="text-xs text-slate-400 mb-3 line-clamp-2">
                  {tool.description}
                </p>
                <div className="flex items-center justify-between text-xs">
                  <span className="text-slate-500">
                    {tool.total_calls_24h} calls/24h
                  </span>
                  <span
                    className={`${
                      tool.success_rate >= 0.95
                        ? "text-green-400"
                        : tool.success_rate >= 0.8
                          ? "text-yellow-400"
                          : "text-red-400"
                    }`}
                  >
                    {(tool.success_rate * 100).toFixed(0)}% success
                  </span>
                </div>
                {isAdmin && (
                  <button
                    type="button"
                    onClick={(e) => {
                      e.stopPropagation();
                      onToggle(tool);
                    }}
                    className={`mt-3 w-full px-3 py-1.5 text-xs font-medium rounded transition-colors ${
                      tool.enabled
                        ? "text-red-400 hover:text-red-300 bg-red-900/30 hover:bg-red-900/50"
                        : "text-green-400 hover:text-green-300 bg-green-900/30 hover:bg-green-900/50"
                    }`}
                  >
                    {tool.enabled ? "Disable" : "Enable"}
                  </button>
                )}
              </div>
            ))}
          </div>
        </DataPanel>
      ))}
    </div>
  );
}

interface ToolLogsTabProps {
  logs: ToolInvocationLog[];
  tools: ToolStatus[];
  logFilter: string;
  statusFilter: string;
  onLogFilterChange: (value: string) => void;
  onStatusFilterChange: (value: string) => void;
  onFilter: () => void;
  getStatusBadge: (status: string) => { type: StatusType; label: string };
}

function ToolLogsTab({
  logs,
  tools,
  logFilter,
  statusFilter,
  onLogFilterChange,
  onStatusFilterChange,
  onFilter,
  getStatusBadge,
}: ToolLogsTabProps) {
  return (
    <DataPanel title="Invocation Logs" noPadding>
      {/* Filters */}
      <div className="p-4 border-b border-slate-700 flex flex-wrap gap-3">
        <select
          value={logFilter}
          onChange={(e) => onLogFilterChange(e.target.value)}
          className="px-3 py-1.5 text-sm bg-slate-800 border border-slate-600 rounded text-slate-200"
        >
          <option value="">All Tools</option>
          {tools.map((tool) => (
            <option key={tool.tool_name} value={tool.tool_name}>
              {tool.display_name}
            </option>
          ))}
        </select>
        <select
          value={statusFilter}
          onChange={(e) => onStatusFilterChange(e.target.value)}
          className="px-3 py-1.5 text-sm bg-slate-800 border border-slate-600 rounded text-slate-200"
        >
          <option value="">All Statuses</option>
          <option value="completed">Completed</option>
          <option value="failed">Failed</option>
          <option value="timeout">Timeout</option>
          <option value="cancelled">Cancelled</option>
        </select>
        <button
          type="button"
          onClick={onFilter}
          className="px-4 py-1.5 text-sm font-medium bg-blue-600 hover:bg-blue-700 text-white rounded transition-colors"
        >
          Apply Filters
        </button>
      </div>

      {/* Logs Table */}
      {logs.length === 0 ? (
        <div className="p-4">
          <EmptyState message="No invocation logs found" icon="📋" />
        </div>
      ) : (
        <div className="overflow-x-auto">
          <table className="w-full">
            <thead className="bg-slate-800/50">
              <tr>
                <th className="px-4 py-3 text-left text-xs font-medium text-slate-400 uppercase">
                  Tool
                </th>
                <th className="px-4 py-3 text-left text-xs font-medium text-slate-400 uppercase">
                  Status
                </th>
                <th className="px-4 py-3 text-left text-xs font-medium text-slate-400 uppercase hidden sm:table-cell">
                  Duration
                </th>
                <th className="px-4 py-3 text-left text-xs font-medium text-slate-400 uppercase hidden md:table-cell">
                  User
                </th>
                <th className="px-4 py-3 text-left text-xs font-medium text-slate-400 uppercase hidden lg:table-cell">
                  Time
                </th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-800">
              {logs.map((log) => {
                const statusBadge = getStatusBadge(log.status);
                return (
                  <tr
                    key={log.id}
                    className="hover:bg-slate-800/30 transition-colors"
                  >
                    <td className="px-4 py-3">
                      <div className="text-sm text-slate-200">
                        {log.tool_name.replace(/_/g, " ")}
                      </div>
                      {log.error_message && (
                        <div className="text-xs text-red-400 truncate max-w-[200px]">
                          {log.error_message}
                        </div>
                      )}
                    </td>
                    <td className="px-4 py-3">
                      <StatusBadge
                        status={statusBadge.type}
                        label={statusBadge.label}
                        size="sm"
                      />
                    </td>
                    <td className="px-4 py-3 text-sm text-slate-400 hidden sm:table-cell">
                      {log.duration_ms}ms
                    </td>
                    <td className="px-4 py-3 text-sm text-slate-400 hidden md:table-cell">
                      {log.user_email}
                    </td>
                    <td className="px-4 py-3 text-sm text-slate-500 hidden lg:table-cell">
                      {new Date(log.created_at).toLocaleString()}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
    </DataPanel>
  );
}

interface ToolAnalyticsTabProps {
  analytics: ToolAnalytics[];
  summary: {
    total_calls: number;
    total_success: number;
    total_failures: number;
    total_phi_detected: number;
    overall_success_rate: number;
  } | null;
  getCategoryColor: (
    category: string,
  ) => "blue" | "green" | "purple" | "yellow" | "red";
}

function ToolAnalyticsTab({
  analytics,
  summary,
  getCategoryColor: _getCategoryColor,
}: ToolAnalyticsTabProps) {
  if (!analytics.length) {
    return (
      <DataPanel title="Analytics">
        <EmptyState message="No analytics data available" icon="📊" />
      </DataPanel>
    );
  }

  return (
    <div className="space-y-6">
      {/* Summary Cards */}
      {summary && (
        <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-4 gap-4">
          <StatCard
            title="Total Calls"
            value={summary.total_calls}
            icon="📞"
            color="blue"
          />
          <StatCard
            title="Successful"
            value={summary.total_success}
            icon="✅"
            color="green"
          />
          <StatCard
            title="Failed"
            value={summary.total_failures}
            icon="❌"
            color="red"
          />
          <StatCard
            title="PHI Detected"
            value={summary.total_phi_detected}
            icon="🔒"
            color="purple"
          />
        </div>
      )}

      {/* Analytics Table */}
      <DataPanel title="Tool Performance" noPadding>
        <div className="overflow-x-auto">
          <table className="w-full">
            <thead className="bg-slate-800/50">
              <tr>
                <th className="px-4 py-3 text-left text-xs font-medium text-slate-400 uppercase">
                  Tool
                </th>
                <th className="px-4 py-3 text-left text-xs font-medium text-slate-400 uppercase">
                  Calls
                </th>
                <th className="px-4 py-3 text-left text-xs font-medium text-slate-400 uppercase hidden sm:table-cell">
                  Success
                </th>
                <th className="px-4 py-3 text-left text-xs font-medium text-slate-400 uppercase hidden md:table-cell">
                  Failures
                </th>
                <th className="px-4 py-3 text-left text-xs font-medium text-slate-400 uppercase hidden lg:table-cell">
                  Avg Duration
                </th>
                <th className="px-4 py-3 text-left text-xs font-medium text-slate-400 uppercase">
                  Rate
                </th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-800">
              {analytics.map((tool) => (
                <tr
                  key={tool.tool_name}
                  className="hover:bg-slate-800/30 transition-colors"
                >
                  <td className="px-4 py-3">
                    <div className="text-sm text-slate-200">
                      {tool.display_name}
                    </div>
                    <div className="text-xs text-slate-500 capitalize">
                      {tool.category}
                    </div>
                  </td>
                  <td className="px-4 py-3 text-sm text-slate-300">
                    {tool.total_calls}
                  </td>
                  <td className="px-4 py-3 text-sm text-green-400 hidden sm:table-cell">
                    {tool.success_count}
                  </td>
                  <td className="px-4 py-3 text-sm text-red-400 hidden md:table-cell">
                    {tool.failure_count}
                  </td>
                  <td className="px-4 py-3 text-sm text-slate-400 hidden lg:table-cell">
                    {tool.avg_duration_ms.toFixed(0)}ms
                  </td>
                  <td className="px-4 py-3">
                    <span
                      className={`text-sm font-medium ${
                        tool.success_rate >= 0.95
                          ? "text-green-400"
                          : tool.success_rate >= 0.8
                            ? "text-yellow-400"
                            : "text-red-400"
                      }`}
                    >
                      {(tool.success_rate * 100).toFixed(1)}%
                    </span>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </DataPanel>
    </div>
  );
}
