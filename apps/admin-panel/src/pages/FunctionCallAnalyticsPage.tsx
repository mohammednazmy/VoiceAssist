import { useState, useEffect, useCallback } from "react";
import { useAuth } from "../contexts/AuthContext";
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
import { fetchAPI } from "../lib/api";

// Types
interface ToolSummary {
  total_calls: number;
  successful_calls: number;
  failed_calls: number;
  success_rate: number;
  avg_duration_ms: number;
  median_duration_ms: number;
  p95_duration_ms: number;
  unique_users: number;
  unique_sessions: number;
  date_range: {
    start: string;
    end: string;
  };
}

interface ToolBreakdown {
  tool_name: string;
  call_count: number;
  success_count: number;
  error_count: number;
  success_rate: number;
  avg_duration_ms: number;
  unique_users: number;
}

interface ModeComparison {
  call_count: number;
  success_count: number;
  success_rate: number;
  avg_duration_ms: number;
  unique_users: number;
}

interface TrendPoint {
  date: string;
  call_count: number;
  success_count: number;
  success_rate: number;
  avg_duration_ms: number;
}

interface ErrorEntry {
  tool_name: string;
  error_type: string | null;
  error_message: string | null;
  error_count: number;
  first_seen: string | null;
  last_seen: string | null;
}

interface RecentInvocation {
  id: string;
  tool_name: string;
  arguments: Record<string, unknown>;
  result_preview: string | null;
  status: string;
  error_type: string | null;
  error_message: string | null;
  duration_ms: number;
  mode: string;
  user_id: string;
  session_id: string;
  trace_id: string | null;
  created_at: string;
}

type TabId = "overview" | "trend" | "errors" | "invocations";

export function FunctionCallAnalyticsPage() {
  const { isAdmin } = useAuth();
  const [activeTab, setActiveTab] = useState<TabId>("overview");
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [lastUpdated, setLastUpdated] = useState<Date | null>(null);

  // Data state
  const [summary, setSummary] = useState<ToolSummary | null>(null);
  const [byTool, setByTool] = useState<ToolBreakdown[]>([]);
  const [byMode, setByMode] = useState<Record<string, ModeComparison>>({});
  const [trend, setTrend] = useState<TrendPoint[]>([]);
  const [errors, setErrors] = useState<ErrorEntry[]>([]);
  const [invocations, setInvocations] = useState<RecentInvocation[]>([]);

  // Filters
  const [days, setDays] = useState<number>(30);
  const [toolFilter, setToolFilter] = useState<string>("");
  const [statusFilter, setStatusFilter] = useState<string>("");

  const fetchAnalytics = useCallback(async () => {
    try {
      const response = await fetchAPI<{
        summary: ToolSummary;
        by_tool: ToolBreakdown[];
        by_mode: Record<string, ModeComparison>;
      }>(`/api/admin/tools/analytics/db?days=${days}`);
      setSummary(response.summary);
      setByTool(response.by_tool || []);
      setByMode(response.by_mode || {});
    } catch (err) {
      console.error("Failed to fetch analytics:", err);
      throw err;
    }
  }, [days]);

  const fetchTrend = useCallback(async () => {
    try {
      const params = new URLSearchParams({ days: days.toString() });
      if (toolFilter) params.set("tool_name", toolFilter);
      const response = await fetchAPI<{ trend: TrendPoint[] }>(
        `/api/admin/tools/analytics/db/trend?${params}`,
      );
      setTrend(response.trend || []);
    } catch (err) {
      console.error("Failed to fetch trend:", err);
      throw err;
    }
  }, [days, toolFilter]);

  const fetchErrors = useCallback(async () => {
    try {
      const response = await fetchAPI<{ errors: ErrorEntry[] }>(
        `/api/admin/tools/analytics/db/errors?days=7&limit=30`,
      );
      setErrors(response.errors || []);
    } catch (err) {
      console.error("Failed to fetch errors:", err);
      throw err;
    }
  }, []);

  const fetchInvocations = useCallback(async () => {
    try {
      const params = new URLSearchParams({ limit: "100" });
      if (toolFilter) params.set("tool_name", toolFilter);
      if (statusFilter) params.set("status", statusFilter);
      const response = await fetchAPI<{ invocations: RecentInvocation[] }>(
        `/api/admin/tools/analytics/db/invocations?${params}`,
      );
      setInvocations(response.invocations || []);
    } catch (err) {
      console.error("Failed to fetch invocations:", err);
      throw err;
    }
  }, [toolFilter, statusFilter]);

  const refreshAll = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      await Promise.all([
        fetchAnalytics(),
        fetchTrend(),
        fetchErrors(),
        fetchInvocations(),
      ]);
      setLastUpdated(new Date());
    } catch (err) {
      setError("Failed to load analytics data");
    } finally {
      setLoading(false);
    }
  }, [fetchAnalytics, fetchTrend, fetchErrors, fetchInvocations]);

  useEffect(() => {
    refreshAll();
  }, []);

  useEffect(() => {
    if (!loading) {
      fetchAnalytics();
      fetchTrend();
    }
  }, [days]);

  const getStatusBadge = (
    status: string,
  ): { type: StatusType; label: string } => {
    const mapping: Record<string, { type: StatusType; label: string }> = {
      success: { type: "healthy", label: "Success" },
      error: { type: "unhealthy", label: "Error" },
    };
    return mapping[status] || { type: "unknown", label: status };
  };

  // Loading state
  if (loading && !summary) {
    return (
      <PageContainer>
        <PageHeader
          title="Function Call Analytics"
          description="Analyze tool invocations across Voice and Chat modes"
        />
        <LoadingGrid count={4} cols={4} />
        <LoadingGrid count={6} cols={1} />
      </PageContainer>
    );
  }

  const tabs = [
    { id: "overview" as const, label: "Overview" },
    { id: "trend" as const, label: "Trend", count: trend.length },
    { id: "errors" as const, label: "Errors", count: errors.length },
    {
      id: "invocations" as const,
      label: "Invocations",
      count: invocations.length,
    },
  ];

  return (
    <PageContainer>
      {/* Header */}
      <PageHeader
        title="Function Call Analytics"
        description="Analyze tool invocations across Voice and Chat modes (database-backed)"
        lastUpdated={lastUpdated}
        actions={
          <div className="flex items-center gap-3">
            <select
              value={days}
              onChange={(e) => setDays(Number(e.target.value))}
              className="px-3 py-1.5 text-sm bg-slate-800 border border-slate-600 rounded text-slate-200"
            >
              <option value={7}>Last 7 days</option>
              <option value={30}>Last 30 days</option>
              <option value={90}>Last 90 days</option>
              <option value={365}>Last year</option>
            </select>
            <RefreshButton onClick={refreshAll} isLoading={loading} />
          </div>
        }
      />

      {/* Error Banner */}
      {error && <ErrorState message={error} onRetry={refreshAll} />}

      {/* Summary Stats */}
      {summary && (
        <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-4 gap-4">
          <StatCard
            title="Total Calls"
            value={summary.total_calls.toLocaleString()}
            icon="📊"
            color="blue"
          />
          <StatCard
            title="Success Rate"
            value={`${summary.success_rate.toFixed(1)}%`}
            icon="✅"
            color={
              summary.success_rate >= 95
                ? "green"
                : summary.success_rate >= 80
                  ? "yellow"
                  : "red"
            }
          />
          <StatCard
            title="Avg Latency"
            value={`${summary.avg_duration_ms.toFixed(0)}ms`}
            icon="⚡"
            color="purple"
          />
          <StatCard
            title="Unique Users"
            value={summary.unique_users.toLocaleString()}
            icon="👤"
            color="blue"
          />
        </div>
      )}

      {/* Tabs */}
      <TabGroup
        tabs={tabs}
        activeTab={activeTab}
        onTabChange={(id) => setActiveTab(id as TabId)}
      />

      {/* Tab Content */}
      {activeTab === "overview" && summary && (
        <OverviewTab summary={summary} byTool={byTool} byMode={byMode} />
      )}

      {activeTab === "trend" && (
        <TrendTab
          trend={trend}
          tools={byTool.map((t) => t.tool_name)}
          toolFilter={toolFilter}
          onToolFilterChange={setToolFilter}
          onRefresh={fetchTrend}
        />
      )}

      {activeTab === "errors" && <ErrorsTab errors={errors} />}

      {activeTab === "invocations" && (
        <InvocationsTab
          invocations={invocations}
          tools={byTool.map((t) => t.tool_name)}
          toolFilter={toolFilter}
          statusFilter={statusFilter}
          onToolFilterChange={setToolFilter}
          onStatusFilterChange={setStatusFilter}
          onRefresh={fetchInvocations}
          getStatusBadge={getStatusBadge}
        />
      )}
    </PageContainer>
  );
}

// Sub-components

interface OverviewTabProps {
  summary: ToolSummary;
  byTool: ToolBreakdown[];
  byMode: Record<string, ModeComparison>;
}

function OverviewTab({ summary, byTool, byMode }: OverviewTabProps) {
  return (
    <div className="space-y-6">
      {/* Mode Comparison */}
      <DataPanel title="Voice vs Chat Comparison">
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          {Object.entries(byMode).map(([mode, stats]) => (
            <div
              key={mode}
              className="p-4 bg-slate-800/30 rounded-lg border border-slate-700"
            >
              <h4 className="font-medium text-slate-200 mb-3 capitalize">
                {mode === "voice" ? "🎤 Voice Mode" : "💬 Chat Mode"}
              </h4>
              <div className="grid grid-cols-2 gap-3 text-sm">
                <div>
                  <span className="text-slate-500">Calls:</span>{" "}
                  <span className="text-slate-200">
                    {stats.call_count.toLocaleString()}
                  </span>
                </div>
                <div>
                  <span className="text-slate-500">Success:</span>{" "}
                  <span className="text-green-400">
                    {stats.success_rate.toFixed(1)}%
                  </span>
                </div>
                <div>
                  <span className="text-slate-500">Avg Latency:</span>{" "}
                  <span className="text-slate-200">
                    {stats.avg_duration_ms.toFixed(0)}ms
                  </span>
                </div>
                <div>
                  <span className="text-slate-500">Users:</span>{" "}
                  <span className="text-slate-200">{stats.unique_users}</span>
                </div>
              </div>
            </div>
          ))}
        </div>
      </DataPanel>

      {/* Latency Breakdown */}
      <DataPanel title="Latency Statistics">
        <div className="grid grid-cols-3 gap-4">
          <div className="p-4 bg-slate-800/30 rounded-lg border border-slate-700 text-center">
            <div className="text-2xl font-bold text-slate-200">
              {summary.avg_duration_ms.toFixed(0)}ms
            </div>
            <div className="text-sm text-slate-400">Average</div>
          </div>
          <div className="p-4 bg-slate-800/30 rounded-lg border border-slate-700 text-center">
            <div className="text-2xl font-bold text-slate-200">
              {summary.median_duration_ms.toFixed(0)}ms
            </div>
            <div className="text-sm text-slate-400">Median (P50)</div>
          </div>
          <div className="p-4 bg-slate-800/30 rounded-lg border border-slate-700 text-center">
            <div className="text-2xl font-bold text-slate-200">
              {summary.p95_duration_ms.toFixed(0)}ms
            </div>
            <div className="text-sm text-slate-400">P95</div>
          </div>
        </div>
      </DataPanel>

      {/* Tool Performance Table */}
      <DataPanel title="Tool Performance" noPadding>
        {byTool.length === 0 ? (
          <div className="p-4">
            <EmptyState message="No tool data available" icon="📊" />
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
                    Calls
                  </th>
                  <th className="px-4 py-3 text-left text-xs font-medium text-slate-400 uppercase hidden sm:table-cell">
                    Success
                  </th>
                  <th className="px-4 py-3 text-left text-xs font-medium text-slate-400 uppercase hidden md:table-cell">
                    Errors
                  </th>
                  <th className="px-4 py-3 text-left text-xs font-medium text-slate-400 uppercase hidden lg:table-cell">
                    Avg Latency
                  </th>
                  <th className="px-4 py-3 text-left text-xs font-medium text-slate-400 uppercase">
                    Rate
                  </th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-800">
                {byTool.map((tool) => (
                  <tr
                    key={tool.tool_name}
                    className="hover:bg-slate-800/30 transition-colors"
                  >
                    <td className="px-4 py-3">
                      <div className="text-sm text-slate-200">
                        {tool.tool_name.replace(/_/g, " ")}
                      </div>
                    </td>
                    <td className="px-4 py-3 text-sm text-slate-300">
                      {tool.call_count.toLocaleString()}
                    </td>
                    <td className="px-4 py-3 text-sm text-green-400 hidden sm:table-cell">
                      {tool.success_count.toLocaleString()}
                    </td>
                    <td className="px-4 py-3 text-sm text-red-400 hidden md:table-cell">
                      {tool.error_count.toLocaleString()}
                    </td>
                    <td className="px-4 py-3 text-sm text-slate-400 hidden lg:table-cell">
                      {tool.avg_duration_ms.toFixed(0)}ms
                    </td>
                    <td className="px-4 py-3">
                      <span
                        className={`text-sm font-medium ${
                          tool.success_rate >= 95
                            ? "text-green-400"
                            : tool.success_rate >= 80
                              ? "text-yellow-400"
                              : "text-red-400"
                        }`}
                      >
                        {tool.success_rate.toFixed(1)}%
                      </span>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </DataPanel>
    </div>
  );
}

interface TrendTabProps {
  trend: TrendPoint[];
  tools: string[];
  toolFilter: string;
  onToolFilterChange: (value: string) => void;
  onRefresh: () => void;
}

function TrendTab({
  trend,
  tools,
  toolFilter,
  onToolFilterChange,
  onRefresh,
}: TrendTabProps) {
  return (
    <DataPanel title="Daily Trend" noPadding>
      {/* Filters */}
      <div className="p-4 border-b border-slate-700 flex flex-wrap gap-3">
        <select
          value={toolFilter}
          onChange={(e) => onToolFilterChange(e.target.value)}
          className="px-3 py-1.5 text-sm bg-slate-800 border border-slate-600 rounded text-slate-200"
        >
          <option value="">All Tools</option>
          {tools.map((tool) => (
            <option key={tool} value={tool}>
              {tool.replace(/_/g, " ")}
            </option>
          ))}
        </select>
        <button
          type="button"
          onClick={onRefresh}
          className="px-4 py-1.5 text-sm font-medium bg-blue-600 hover:bg-blue-700 text-white rounded transition-colors"
        >
          Update
        </button>
      </div>

      {/* Trend Data */}
      {trend.length === 0 ? (
        <div className="p-4">
          <EmptyState message="No trend data available" icon="📈" />
        </div>
      ) : (
        <div className="overflow-x-auto">
          <table className="w-full">
            <thead className="bg-slate-800/50">
              <tr>
                <th className="px-4 py-3 text-left text-xs font-medium text-slate-400 uppercase">
                  Date
                </th>
                <th className="px-4 py-3 text-left text-xs font-medium text-slate-400 uppercase">
                  Calls
                </th>
                <th className="px-4 py-3 text-left text-xs font-medium text-slate-400 uppercase hidden sm:table-cell">
                  Success
                </th>
                <th className="px-4 py-3 text-left text-xs font-medium text-slate-400 uppercase">
                  Rate
                </th>
                <th className="px-4 py-3 text-left text-xs font-medium text-slate-400 uppercase hidden md:table-cell">
                  Avg Latency
                </th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-800">
              {trend.map((point) => (
                <tr
                  key={point.date}
                  className="hover:bg-slate-800/30 transition-colors"
                >
                  <td className="px-4 py-3 text-sm text-slate-200">
                    {new Date(point.date).toLocaleDateString()}
                  </td>
                  <td className="px-4 py-3 text-sm text-slate-300">
                    {point.call_count.toLocaleString()}
                  </td>
                  <td className="px-4 py-3 text-sm text-green-400 hidden sm:table-cell">
                    {point.success_count.toLocaleString()}
                  </td>
                  <td className="px-4 py-3">
                    <span
                      className={`text-sm font-medium ${
                        point.success_rate >= 95
                          ? "text-green-400"
                          : point.success_rate >= 80
                            ? "text-yellow-400"
                            : "text-red-400"
                      }`}
                    >
                      {point.success_rate.toFixed(1)}%
                    </span>
                  </td>
                  <td className="px-4 py-3 text-sm text-slate-400 hidden md:table-cell">
                    {point.avg_duration_ms.toFixed(0)}ms
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </DataPanel>
  );
}

interface ErrorsTabProps {
  errors: ErrorEntry[];
}

function ErrorsTab({ errors }: ErrorsTabProps) {
  return (
    <DataPanel title="Recent Errors (Last 7 Days)" noPadding>
      {errors.length === 0 ? (
        <div className="p-4">
          <EmptyState message="No errors found - great!" icon="🎉" />
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
                  Error
                </th>
                <th className="px-4 py-3 text-left text-xs font-medium text-slate-400 uppercase">
                  Count
                </th>
                <th className="px-4 py-3 text-left text-xs font-medium text-slate-400 uppercase hidden md:table-cell">
                  Last Seen
                </th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-800">
              {errors.map((err, idx) => (
                <tr
                  key={idx}
                  className="hover:bg-slate-800/30 transition-colors"
                >
                  <td className="px-4 py-3 text-sm text-slate-200">
                    {err.tool_name.replace(/_/g, " ")}
                  </td>
                  <td className="px-4 py-3">
                    <div className="text-sm text-red-400">
                      {err.error_type || "Unknown"}
                    </div>
                    {err.error_message && (
                      <div className="text-xs text-slate-500 truncate max-w-[300px]">
                        {err.error_message}
                      </div>
                    )}
                  </td>
                  <td className="px-4 py-3 text-sm text-slate-300">
                    {err.error_count}
                  </td>
                  <td className="px-4 py-3 text-sm text-slate-500 hidden md:table-cell">
                    {err.last_seen
                      ? new Date(err.last_seen).toLocaleString()
                      : "-"}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </DataPanel>
  );
}

interface InvocationsTabProps {
  invocations: RecentInvocation[];
  tools: string[];
  toolFilter: string;
  statusFilter: string;
  onToolFilterChange: (value: string) => void;
  onStatusFilterChange: (value: string) => void;
  onRefresh: () => void;
  getStatusBadge: (status: string) => { type: StatusType; label: string };
}

function InvocationsTab({
  invocations,
  tools,
  toolFilter,
  statusFilter,
  onToolFilterChange,
  onStatusFilterChange,
  onRefresh,
  getStatusBadge,
}: InvocationsTabProps) {
  return (
    <DataPanel title="Recent Invocations" noPadding>
      {/* Filters */}
      <div className="p-4 border-b border-slate-700 flex flex-wrap gap-3">
        <select
          value={toolFilter}
          onChange={(e) => onToolFilterChange(e.target.value)}
          className="px-3 py-1.5 text-sm bg-slate-800 border border-slate-600 rounded text-slate-200"
        >
          <option value="">All Tools</option>
          {tools.map((tool) => (
            <option key={tool} value={tool}>
              {tool.replace(/_/g, " ")}
            </option>
          ))}
        </select>
        <select
          value={statusFilter}
          onChange={(e) => onStatusFilterChange(e.target.value)}
          className="px-3 py-1.5 text-sm bg-slate-800 border border-slate-600 rounded text-slate-200"
        >
          <option value="">All Statuses</option>
          <option value="success">Success</option>
          <option value="error">Error</option>
        </select>
        <button
          type="button"
          onClick={onRefresh}
          className="px-4 py-1.5 text-sm font-medium bg-blue-600 hover:bg-blue-700 text-white rounded transition-colors"
        >
          Apply Filters
        </button>
      </div>

      {/* Invocations Table */}
      {invocations.length === 0 ? (
        <div className="p-4">
          <EmptyState message="No invocations found" icon="📋" />
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
                <th className="px-4 py-3 text-left text-xs font-medium text-slate-400 uppercase">
                  Mode
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
              {invocations.map((inv) => {
                const statusBadge = getStatusBadge(inv.status);
                return (
                  <tr
                    key={inv.id}
                    className="hover:bg-slate-800/30 transition-colors"
                  >
                    <td className="px-4 py-3">
                      <div className="text-sm text-slate-200">
                        {inv.tool_name.replace(/_/g, " ")}
                      </div>
                      {inv.error_message && (
                        <div className="text-xs text-red-400 truncate max-w-[200px]">
                          {inv.error_message}
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
                    <td className="px-4 py-3 text-sm text-slate-400 capitalize">
                      {inv.mode === "voice" ? "🎤" : "💬"} {inv.mode}
                    </td>
                    <td className="px-4 py-3 text-sm text-slate-400 hidden sm:table-cell">
                      {inv.duration_ms}ms
                    </td>
                    <td className="px-4 py-3 text-sm text-slate-400 hidden md:table-cell">
                      {inv.user_id}
                    </td>
                    <td className="px-4 py-3 text-sm text-slate-500 hidden lg:table-cell">
                      {inv.created_at
                        ? new Date(inv.created_at).toLocaleString()
                        : "-"}
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
