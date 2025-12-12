/**
 * Analytics Page (Sprint 4 Enhanced)
 * Query analytics, AI model usage, cost tracking, and search statistics
 */

import { useCallback, useEffect, useState } from "react";
import { HelpButton } from "@voiceassist/ui";
import { AskAIButton } from "../components/shared";
import { fetchAPI } from "../lib/api";
import { getApiClient } from "../lib/apiClient";
import { useModelAnalytics } from "../hooks/useModelAnalytics";
import { useDocumentAnalytics } from "../hooks/useDocumentAnalytics";

type AnalyticsRange = "24h" | "7d" | "30d";
type AnalyticsTab = "overview" | "models" | "search" | "costs" | "documents";

interface QueryAnalytics {
  total_queries: number;
  avg_queries_per_user: number;
  top_query_types: Array<{ type: string; count: number }>;
  popular_topics: Array<{ topic: string; count: number }>;
}

interface ResponseTimeData {
  p50: number;
  p95: number;
  p99: number;
  avg: number;
  histogram: Array<{ bucket: string; count: number }>;
}

interface UsageTrends {
  daily_users: Array<{ date: string; count: number }>;
  daily_queries: Array<{ date: string; count: number }>;
  weekly_growth: number;
  monthly_growth: number;
}

export function AnalyticsPage() {
  const [_queryAnalytics, setQueryAnalytics] = useState<QueryAnalytics | null>(
    null,
  );
  const [_responseTimes, setResponseTimes] = useState<ResponseTimeData | null>(
    null,
  );
  const [_usageTrends, setUsageTrends] = useState<UsageTrends | null>(null);
  const [legacyLoading, setLegacyLoading] = useState(true);
  const [legacyError, setLegacyError] = useState<string | null>(null);
  const [timeRange, setTimeRange] = useState<AnalyticsRange>("7d");
  const [activeTab, setActiveTab] = useState<AnalyticsTab>("overview");
  const apiClient = getApiClient();

  // Sprint 4: Model analytics hook
  const {
    models,
    metrics,
    searchStats,
    embeddingStats,
    loading: modelLoading,
    metricsLoading,
    error: modelError,
    refresh: refreshModels,
    refreshMetrics,
  } = useModelAnalytics({
    days: timeRange === "24h" ? 1 : timeRange === "7d" ? 7 : 30,
  });

  // Document analytics hook
  const {
    analytics: documentAnalytics,
    loading: documentLoading,
    error: documentError,
    refresh: refreshDocumentAnalytics,
  } = useDocumentAnalytics({
    days: timeRange === "24h" ? 1 : timeRange === "7d" ? 7 : 30,
  });

  const loadLegacyAnalytics = useCallback(async () => {
    setLegacyLoading(true);
    try {
      const [queryData, responseData, trendsData] = await Promise.all([
        fetchAPI<QueryAnalytics>(
          `/api/admin/analytics/queries?range=${timeRange}`,
        ),
        fetchAPI<ResponseTimeData>(
          `/api/admin/analytics/response-times?range=${timeRange}`,
        ),
        fetchAPI<UsageTrends>(`/api/admin/analytics/trends?range=${timeRange}`),
      ]);

      setQueryAnalytics(queryData);
      setResponseTimes(responseData);
      setUsageTrends(trendsData);
      setLegacyError(null);
    } catch {
      // Silently fail for legacy endpoints - they may not exist yet
      console.warn("Legacy analytics endpoints not available");
    } finally {
      setLegacyLoading(false);
    }
  }, [timeRange]);

  useEffect(() => {
    loadLegacyAnalytics();
  }, [loadLegacyAnalytics]);

  useEffect(() => {
    refreshMetrics();
  }, [timeRange, refreshMetrics]);

  const exportReport = async () => {
    try {
      const blob = await apiClient.request<Blob>({
        url: `/api/admin/analytics/export?range=${timeRange}`,
        method: "GET",
        responseType: "blob",
      });
      const url = window.URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = `analytics-report-${timeRange}-${new Date().toISOString().split("T")[0]}.pdf`;
      document.body.appendChild(a);
      a.click();
      window.URL.revokeObjectURL(url);
      document.body.removeChild(a);
    } catch (err: unknown) {
      const message =
        err instanceof Error ? err.message : "Failed to export report";
      alert(message);
    }
  };

  const formatCurrency = (amount: number) => {
    return new Intl.NumberFormat("en-US", {
      style: "currency",
      currency: "USD",
      minimumFractionDigits: 2,
      maximumFractionDigits: 4,
    }).format(amount);
  };

  const formatNumber = (num: number) => {
    return new Intl.NumberFormat("en-US").format(num);
  };

  const loading = modelLoading || legacyLoading || documentLoading;
  const error = modelError || legacyError || documentError;

  if (loading && !metrics) {
    return (
      <div className="flex-1 flex items-center justify-center">
        <div className="text-slate-400">Loading analytics...</div>
      </div>
    );
  }

  return (
    <div className="flex-1 p-6 space-y-6 overflow-y-auto">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <div className="flex items-center gap-2">
            <h1 className="text-2xl font-bold text-slate-100">Analytics</h1>
            <HelpButton
              docPath="admin/analytics"
              tooltipText="View analytics documentation"
              docsBaseUrl={import.meta.env.VITE_DOCS_URL}
            />
            <AskAIButton
              pageContext="Analytics dashboard"
              docPath="admin/analytics"
            />
          </div>
          <p className="text-sm text-slate-400 mt-1">
            AI model usage, costs, and performance metrics
          </p>
        </div>

        <div className="flex items-center space-x-3">
          {/* Time Range Selector */}
          <select
            value={timeRange}
            onChange={(e) => setTimeRange(e.target.value as AnalyticsRange)}
            className="px-3 py-2 bg-slate-800 border border-slate-700 rounded-md text-sm text-slate-200 focus:outline-none focus:ring-2 focus:ring-blue-500"
          >
            <option value="24h">Last 24 Hours</option>
            <option value="7d">Last 7 Days</option>
            <option value="30d">Last 30 Days</option>
          </select>

          {/* Refresh Button */}
          <button
            onClick={() => {
              refreshModels();
              loadLegacyAnalytics();
              refreshDocumentAnalytics();
            }}
            disabled={metricsLoading || documentLoading}
            className="px-4 py-2 bg-slate-700 hover:bg-slate-600 disabled:opacity-50 text-white rounded-md text-sm font-medium transition-colors"
          >
            {metricsLoading || documentLoading ? "⟳" : "↻"} Refresh
          </button>

          {/* Export Button */}
          <button
            onClick={exportReport}
            className="px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white rounded-md text-sm font-medium transition-colors"
          >
            📊 Export Report
          </button>
        </div>
      </div>

      {/* Tab Navigation */}
      <div className="border-b border-slate-700">
        <nav className="flex space-x-8">
          {[
            { id: "overview", label: "Overview" },
            { id: "models", label: "AI Models" },
            { id: "search", label: "Search Analytics" },
            { id: "costs", label: "Cost Tracking" },
            { id: "documents", label: "Documents" },
          ].map((tab) => (
            <button
              key={tab.id}
              onClick={() => setActiveTab(tab.id as AnalyticsTab)}
              className={`py-3 px-1 border-b-2 text-sm font-medium transition-colors ${
                activeTab === tab.id
                  ? "border-blue-500 text-blue-400"
                  : "border-transparent text-slate-400 hover:text-slate-200"
              }`}
            >
              {tab.label}
            </button>
          ))}
        </nav>
      </div>

      {error && (
        <div className="p-4 bg-red-950/50 border border-red-900 rounded-lg text-red-400">
          {error}
        </div>
      )}

      {/* Overview Tab */}
      {activeTab === "overview" && (
        <div className="space-y-6">
          {/* Key Metrics Grid */}
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
            <MetricCard
              title="Total Requests"
              value={formatNumber(metrics?.total_requests_24h || 0)}
              subtitle={`Last ${timeRange === "24h" ? "24 hours" : timeRange}`}
              color="blue"
            />
            <MetricCard
              title="Estimated Cost"
              value={formatCurrency(metrics?.estimated_cost_24h || 0)}
              subtitle={`Last ${timeRange === "24h" ? "24 hours" : timeRange}`}
              color="green"
            />
            <MetricCard
              title="Avg Latency"
              value={`${metrics?.avg_latency_ms?.toFixed(0) || 0}ms`}
              subtitle={`P95: ${metrics?.p95_latency_ms?.toFixed(0) || 0}ms`}
              color="purple"
            />
            <MetricCard
              title="Error Rate"
              value={`${metrics?.error_rate?.toFixed(2) || 0}%`}
              subtitle="Request failures"
              color={
                metrics?.error_rate && metrics.error_rate > 5 ? "red" : "green"
              }
            />
          </div>

          {/* Cloud vs Local Routing */}
          <div className="bg-slate-900/50 border border-slate-800 rounded-lg p-6">
            <h2 className="text-lg font-semibold text-slate-200 mb-4">
              Model Routing Distribution
            </h2>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
              <div>
                <div className="flex items-center justify-between mb-2">
                  <span className="text-sm text-slate-400">Cloud Requests</span>
                  <span className="text-sm font-medium text-blue-400">
                    {formatNumber(metrics?.cloud_requests || 0)} (
                    {metrics?.cloud_percentage?.toFixed(1) || 0}%)
                  </span>
                </div>
                <div className="h-3 bg-slate-800 rounded-full overflow-hidden">
                  <div
                    className="h-full bg-blue-500 rounded-full transition-all duration-500"
                    style={{ width: `${metrics?.cloud_percentage || 0}%` }}
                  />
                </div>
              </div>
              <div>
                <div className="flex items-center justify-between mb-2">
                  <span className="text-sm text-slate-400">
                    Local Requests (PHI-safe)
                  </span>
                  <span className="text-sm font-medium text-green-400">
                    {formatNumber(metrics?.local_requests || 0)} (
                    {(100 - (metrics?.cloud_percentage || 0)).toFixed(1)}%)
                  </span>
                </div>
                <div className="h-3 bg-slate-800 rounded-full overflow-hidden">
                  <div
                    className="h-full bg-green-500 rounded-full transition-all duration-500"
                    style={{
                      width: `${100 - (metrics?.cloud_percentage || 0)}%`,
                    }}
                  />
                </div>
              </div>
            </div>
          </div>

          {/* Token Usage */}
          <div className="bg-slate-900/50 border border-slate-800 rounded-lg p-6">
            <h2 className="text-lg font-semibold text-slate-200 mb-4">
              Token Usage
            </h2>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div className="bg-slate-800/50 rounded-lg p-4">
                <div className="text-sm text-slate-400">Input Tokens</div>
                <div className="text-3xl font-bold text-blue-400 mt-1">
                  {formatNumber(metrics?.total_tokens_input_24h || 0)}
                </div>
              </div>
              <div className="bg-slate-800/50 rounded-lg p-4">
                <div className="text-sm text-slate-400">Output Tokens</div>
                <div className="text-3xl font-bold text-purple-400 mt-1">
                  {formatNumber(metrics?.total_tokens_output_24h || 0)}
                </div>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Models Tab */}
      {activeTab === "models" && (
        <div className="space-y-6">
          {/* Model Breakdown Table */}
          <div className="bg-slate-900/50 border border-slate-800 rounded-lg p-6">
            <h2 className="text-lg font-semibold text-slate-200 mb-4">
              Model Usage Breakdown
            </h2>
            <div className="overflow-x-auto">
              <table className="w-full">
                <thead>
                  <tr className="border-b border-slate-700">
                    <th className="text-left py-3 px-4 text-sm font-medium text-slate-400">
                      Model
                    </th>
                    <th className="text-left py-3 px-4 text-sm font-medium text-slate-400">
                      Provider
                    </th>
                    <th className="text-right py-3 px-4 text-sm font-medium text-slate-400">
                      Requests
                    </th>
                    <th className="text-right py-3 px-4 text-sm font-medium text-slate-400">
                      Input Tokens
                    </th>
                    <th className="text-right py-3 px-4 text-sm font-medium text-slate-400">
                      Output Tokens
                    </th>
                    <th className="text-right py-3 px-4 text-sm font-medium text-slate-400">
                      Avg Latency
                    </th>
                    <th className="text-right py-3 px-4 text-sm font-medium text-slate-400">
                      Cost
                    </th>
                  </tr>
                </thead>
                <tbody>
                  {metrics?.model_breakdown?.length ? (
                    metrics.model_breakdown.map((model, idx) => (
                      <tr
                        key={idx}
                        className="border-b border-slate-800 hover:bg-slate-800/30"
                      >
                        <td className="py-3 px-4 text-sm text-slate-200">
                          {model.model_name}
                        </td>
                        <td className="py-3 px-4">
                          <span
                            className={`px-2 py-1 rounded text-xs font-medium ${
                              model.provider === "openai"
                                ? "bg-green-900/30 text-green-400"
                                : model.provider === "anthropic"
                                  ? "bg-purple-900/30 text-purple-400"
                                  : "bg-blue-900/30 text-blue-400"
                            }`}
                          >
                            {model.provider}
                          </span>
                        </td>
                        <td className="py-3 px-4 text-sm text-slate-300 text-right">
                          {formatNumber(model.requests)}
                        </td>
                        <td className="py-3 px-4 text-sm text-slate-300 text-right">
                          {formatNumber(model.tokens_input)}
                        </td>
                        <td className="py-3 px-4 text-sm text-slate-300 text-right">
                          {formatNumber(model.tokens_output)}
                        </td>
                        <td className="py-3 px-4 text-sm text-slate-300 text-right">
                          {model.avg_latency_ms.toFixed(0)}ms
                        </td>
                        <td className="py-3 px-4 text-sm text-green-400 text-right font-medium">
                          {formatCurrency(model.estimated_cost)}
                        </td>
                      </tr>
                    ))
                  ) : (
                    <tr>
                      <td
                        colSpan={7}
                        className="py-8 text-center text-slate-500"
                      >
                        No model usage data available for this period
                      </td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>
          </div>

          {/* Available Models */}
          <div className="bg-slate-900/50 border border-slate-800 rounded-lg p-6">
            <h2 className="text-lg font-semibold text-slate-200 mb-4">
              Available Models
            </h2>
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
              {models.map((model) => (
                <div
                  key={model.id}
                  className={`p-4 rounded-lg border ${
                    model.enabled
                      ? "border-slate-700 bg-slate-800/50"
                      : "border-slate-800 bg-slate-900/50 opacity-50"
                  }`}
                >
                  <div className="flex items-center justify-between mb-2">
                    <span className="font-medium text-slate-200">
                      {model.name}
                    </span>
                    {model.is_primary && (
                      <span className="px-2 py-0.5 bg-blue-900/50 text-blue-400 rounded text-xs">
                        Primary
                      </span>
                    )}
                  </div>
                  <div className="flex items-center space-x-2 text-xs text-slate-400">
                    <span
                      className={`px-2 py-0.5 rounded ${
                        model.provider === "openai"
                          ? "bg-green-900/30 text-green-400"
                          : model.provider === "anthropic"
                            ? "bg-purple-900/30 text-purple-400"
                            : "bg-blue-900/30 text-blue-400"
                      }`}
                    >
                      {model.provider}
                    </span>
                    <span>{model.type}</span>
                    {model.supports_phi && (
                      <span className="px-2 py-0.5 bg-green-900/30 text-green-400 rounded">
                        PHI-safe
                      </span>
                    )}
                  </div>
                  <div className="mt-2 text-xs text-slate-500">
                    Context: {formatNumber(model.context_window)} tokens
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>
      )}

      {/* Search Analytics Tab */}
      {activeTab === "search" && (
        <div className="space-y-6">
          {/* Search Stats Grid */}
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
            <MetricCard
              title="Total Searches"
              value={formatNumber(searchStats?.total_searches_24h || 0)}
              subtitle={`Last ${timeRange === "24h" ? "24 hours" : timeRange}`}
              color="blue"
            />
            <MetricCard
              title="Cache Hit Rate"
              value={`${searchStats?.cache_hit_rate?.toFixed(1) || 0}%`}
              subtitle="Query cache efficiency"
              color={
                searchStats?.cache_hit_rate && searchStats.cache_hit_rate > 50
                  ? "green"
                  : "yellow"
              }
            />
            <MetricCard
              title="Avg Latency"
              value={`${searchStats?.avg_latency_ms?.toFixed(0) || 0}ms`}
              subtitle={`P95: ${searchStats?.p95_latency_ms?.toFixed(0) || 0}ms`}
              color="purple"
            />
            <MetricCard
              title="No Results Rate"
              value={`${searchStats?.no_results_rate?.toFixed(1) || 0}%`}
              subtitle="Failed to find results"
              color={
                searchStats?.no_results_rate && searchStats.no_results_rate > 10
                  ? "red"
                  : "green"
              }
            />
          </div>

          {/* Search Type Distribution */}
          <div className="bg-slate-900/50 border border-slate-800 rounded-lg p-6">
            <h2 className="text-lg font-semibold text-slate-200 mb-4">
              Search Type Distribution
            </h2>
            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
              {searchStats?.search_types &&
                Object.entries(searchStats.search_types).map(
                  ([type, count]) => {
                    const total = Object.values(
                      searchStats.search_types,
                    ).reduce((a, b) => a + b, 0);
                    const percentage = total > 0 ? (count / total) * 100 : 0;
                    return (
                      <div
                        key={type}
                        className="bg-slate-800/50 rounded-lg p-4"
                      >
                        <div className="flex items-center justify-between mb-2">
                          <span className="text-sm text-slate-400 capitalize">
                            {type}
                          </span>
                          <span className="text-sm font-medium text-slate-200">
                            {percentage.toFixed(1)}%
                          </span>
                        </div>
                        <div className="text-2xl font-bold text-blue-400">
                          {formatNumber(count)}
                        </div>
                        <div className="h-2 bg-slate-700 rounded-full mt-2 overflow-hidden">
                          <div
                            className={`h-full rounded-full ${
                              type === "semantic"
                                ? "bg-purple-500"
                                : type === "hybrid"
                                  ? "bg-blue-500"
                                  : "bg-green-500"
                            }`}
                            style={{ width: `${percentage}%` }}
                          />
                        </div>
                      </div>
                    );
                  },
                )}
            </div>
          </div>

          {/* Embedding Stats */}
          {embeddingStats && (
            <div className="bg-slate-900/50 border border-slate-800 rounded-lg p-6">
              <h2 className="text-lg font-semibold text-slate-200 mb-4">
                Embedding Database
              </h2>
              <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                <div className="bg-slate-800/50 rounded-lg p-3">
                  <div className="text-xs text-slate-400">Documents</div>
                  <div className="text-xl font-bold text-blue-400">
                    {formatNumber(embeddingStats.total_documents)}
                  </div>
                </div>
                <div className="bg-slate-800/50 rounded-lg p-3">
                  <div className="text-xs text-slate-400">Chunks</div>
                  <div className="text-xl font-bold text-purple-400">
                    {formatNumber(embeddingStats.total_chunks)}
                  </div>
                </div>
                <div className="bg-slate-800/50 rounded-lg p-3">
                  <div className="text-xs text-slate-400">Index Size</div>
                  <div className="text-xl font-bold text-green-400">
                    {embeddingStats.index_size_mb.toFixed(1)} MB
                  </div>
                </div>
                <div className="bg-slate-800/50 rounded-lg p-3">
                  <div className="text-xs text-slate-400">Dimensions</div>
                  <div className="text-xl font-bold text-yellow-400">
                    {formatNumber(embeddingStats.embedding_dimensions)}
                  </div>
                </div>
              </div>
            </div>
          )}

          {/* Top Queries */}
          {searchStats?.top_queries && searchStats.top_queries.length > 0 && (
            <div className="bg-slate-900/50 border border-slate-800 rounded-lg p-6">
              <h2 className="text-lg font-semibold text-slate-200 mb-4">
                Top Search Queries
              </h2>
              <div className="space-y-2">
                {searchStats.top_queries.slice(0, 10).map((query, idx) => (
                  <div
                    key={idx}
                    className="flex items-center justify-between p-3 bg-slate-800/30 rounded-lg"
                  >
                    <span className="text-sm text-slate-300">
                      {query.query}
                    </span>
                    <span className="text-sm font-medium text-blue-400">
                      {query.count}
                    </span>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>
      )}

      {/* Cost Tracking Tab */}
      {activeTab === "costs" && (
        <div className="space-y-6">
          {/* Cost Summary */}
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            <div className="bg-gradient-to-br from-green-900/30 to-green-950/20 border border-green-800 rounded-lg p-6">
              <div className="text-sm text-slate-400">
                Estimated Cost ({timeRange})
              </div>
              <div className="text-4xl font-bold text-green-400 mt-2">
                {formatCurrency(metrics?.estimated_cost_24h || 0)}
              </div>
            </div>
            <div className="bg-slate-900/50 border border-slate-800 rounded-lg p-6">
              <div className="text-sm text-slate-400">Cost per 1K Requests</div>
              <div className="text-4xl font-bold text-blue-400 mt-2">
                {metrics?.total_requests_24h
                  ? formatCurrency(
                      (metrics.estimated_cost_24h /
                        metrics.total_requests_24h) *
                        1000,
                    )
                  : "$0.00"}
              </div>
            </div>
            <div className="bg-slate-900/50 border border-slate-800 rounded-lg p-6">
              <div className="text-sm text-slate-400">Savings from Local</div>
              <div className="text-4xl font-bold text-purple-400 mt-2">
                {/* Estimate savings from local routing - assume $0.02 per cloud request saved */}
                {formatCurrency((metrics?.local_requests || 0) * 0.02)}
              </div>
            </div>
          </div>

          {/* Cost by Model */}
          <div className="bg-slate-900/50 border border-slate-800 rounded-lg p-6">
            <h2 className="text-lg font-semibold text-slate-200 mb-4">
              Cost Breakdown by Model
            </h2>
            <div className="space-y-4">
              {metrics?.model_breakdown?.map((model, idx) => {
                const totalCost = metrics.estimated_cost_24h || 1;
                const percentage = (model.estimated_cost / totalCost) * 100;
                return (
                  <div key={idx} className="space-y-2">
                    <div className="flex items-center justify-between">
                      <div className="flex items-center space-x-3">
                        <span className="text-sm font-medium text-slate-200">
                          {model.model_name}
                        </span>
                        <span
                          className={`px-2 py-0.5 rounded text-xs ${
                            model.provider === "openai"
                              ? "bg-green-900/30 text-green-400"
                              : model.provider === "anthropic"
                                ? "bg-purple-900/30 text-purple-400"
                                : "bg-blue-900/30 text-blue-400"
                          }`}
                        >
                          {model.provider}
                        </span>
                      </div>
                      <div className="text-right">
                        <div className="text-sm font-medium text-green-400">
                          {formatCurrency(model.estimated_cost)}
                        </div>
                        <div className="text-xs text-slate-500">
                          {percentage.toFixed(1)}%
                        </div>
                      </div>
                    </div>
                    <div className="h-2 bg-slate-800 rounded-full overflow-hidden">
                      <div
                        className="h-full bg-gradient-to-r from-green-600 to-green-400 rounded-full"
                        style={{ width: `${percentage}%` }}
                      />
                    </div>
                  </div>
                );
              })}
              {(!metrics?.model_breakdown ||
                metrics.model_breakdown.length === 0) && (
                <div className="py-8 text-center text-slate-500">
                  No cost data available for this period
                </div>
              )}
            </div>
          </div>

          {/* Cost Tips */}
          <div className="bg-blue-950/30 border border-blue-900/50 rounded-lg p-4">
            <h3 className="text-sm font-medium text-blue-400 mb-2">
              💡 Cost Optimization Tips
            </h3>
            <ul className="text-xs text-slate-400 space-y-1">
              <li>
                • Enable PHI detection to route sensitive queries to local
                models (zero API cost)
              </li>
              <li>
                • Use caching for frequently repeated queries - current cache
                hit rate: {searchStats?.cache_hit_rate?.toFixed(1) || 0}%
              </li>
              <li>
                • Consider using GPT-3.5-Turbo for simpler queries (10x cheaper
                than GPT-4)
              </li>
              <li>• Monitor P95 latency to balance cost vs. response time</li>
            </ul>
          </div>
        </div>
      )}

      {/* Documents Tab */}
      {activeTab === "documents" && (
        <div className="space-y-6">
          {/* Document Stats Grid */}
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
            <MetricCard
              title="Total Documents"
              value={formatNumber(documentAnalytics?.documents.total || 0)}
              subtitle="In knowledge base"
              color="blue"
            />
            <MetricCard
              title="Total Pages"
              value={formatNumber(documentAnalytics?.documents.total_pages || 0)}
              subtitle={`${formatNumber(documentAnalytics?.documents.with_pages || 0)} docs with pages`}
              color="purple"
            />
            <MetricCard
              title="Voice Sessions"
              value={formatNumber(documentAnalytics?.voice_navigation.sessions_in_period || 0)}
              subtitle={`${formatNumber(documentAnalytics?.voice_navigation.active_sessions || 0)} active`}
              color="green"
            />
            <MetricCard
              title="Recent Uploads"
              value={formatNumber(documentAnalytics?.documents.recent_uploads || 0)}
              subtitle={`Last ${timeRange === "24h" ? "24 hours" : timeRange}`}
              color="yellow"
            />
          </div>

          {/* Document Structure Stats */}
          <div className="bg-slate-900/50 border border-slate-800 rounded-lg p-6">
            <h2 className="text-lg font-semibold text-slate-200 mb-4">
              Document Structure
            </h2>
            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
              <div className="bg-slate-800/50 rounded-lg p-4">
                <div className="flex items-center justify-between mb-2">
                  <span className="text-sm text-slate-400">With TOC</span>
                  <span className="text-sm font-medium text-blue-400">
                    {documentAnalytics?.documents.total
                      ? ((documentAnalytics.documents.with_toc / documentAnalytics.documents.total) * 100).toFixed(1)
                      : 0}%
                  </span>
                </div>
                <div className="text-2xl font-bold text-blue-400">
                  {formatNumber(documentAnalytics?.documents.with_toc || 0)}
                </div>
                <div className="h-2 bg-slate-700 rounded-full mt-2 overflow-hidden">
                  <div
                    className="h-full bg-blue-500 rounded-full"
                    style={{
                      width: `${documentAnalytics?.documents.total ? (documentAnalytics.documents.with_toc / documentAnalytics.documents.total) * 100 : 0}%`,
                    }}
                  />
                </div>
              </div>
              <div className="bg-slate-800/50 rounded-lg p-4">
                <div className="flex items-center justify-between mb-2">
                  <span className="text-sm text-slate-400">With Figures</span>
                  <span className="text-sm font-medium text-purple-400">
                    {documentAnalytics?.documents.total
                      ? ((documentAnalytics.documents.with_figures / documentAnalytics.documents.total) * 100).toFixed(1)
                      : 0}%
                  </span>
                </div>
                <div className="text-2xl font-bold text-purple-400">
                  {formatNumber(documentAnalytics?.documents.with_figures || 0)}
                </div>
                <div className="h-2 bg-slate-700 rounded-full mt-2 overflow-hidden">
                  <div
                    className="h-full bg-purple-500 rounded-full"
                    style={{
                      width: `${documentAnalytics?.documents.total ? (documentAnalytics.documents.with_figures / documentAnalytics.documents.total) * 100 : 0}%`,
                    }}
                  />
                </div>
              </div>
              <div className="bg-slate-800/50 rounded-lg p-4">
                <div className="flex items-center justify-between mb-2">
                  <span className="text-sm text-slate-400">With Pages</span>
                  <span className="text-sm font-medium text-green-400">
                    {documentAnalytics?.documents.total
                      ? ((documentAnalytics.documents.with_pages / documentAnalytics.documents.total) * 100).toFixed(1)
                      : 0}%
                  </span>
                </div>
                <div className="text-2xl font-bold text-green-400">
                  {formatNumber(documentAnalytics?.documents.with_pages || 0)}
                </div>
                <div className="h-2 bg-slate-700 rounded-full mt-2 overflow-hidden">
                  <div
                    className="h-full bg-green-500 rounded-full"
                    style={{
                      width: `${documentAnalytics?.documents.total ? (documentAnalytics.documents.with_pages / documentAnalytics.documents.total) * 100 : 0}%`,
                    }}
                  />
                </div>
              </div>
            </div>
          </div>

          {/* Document Sources */}
          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            {/* By Source Type */}
            <div className="bg-slate-900/50 border border-slate-800 rounded-lg p-6">
              <h2 className="text-lg font-semibold text-slate-200 mb-4">
                Documents by Source
              </h2>
              <div className="space-y-3">
                {documentAnalytics?.documents.by_source &&
                  Object.entries(documentAnalytics.documents.by_source).map(
                    ([source, count]) => {
                      const total = documentAnalytics.documents.total || 1;
                      const percentage = (count / total) * 100;
                      return (
                        <div key={source}>
                          <div className="flex items-center justify-between mb-1">
                            <span className="text-sm text-slate-400 capitalize">
                              {source}
                            </span>
                            <span className="text-sm font-medium text-slate-200">
                              {formatNumber(count)} ({percentage.toFixed(1)}%)
                            </span>
                          </div>
                          <div className="h-2 bg-slate-800 rounded-full overflow-hidden">
                            <div
                              className="h-full bg-blue-500 rounded-full"
                              style={{ width: `${percentage}%` }}
                            />
                          </div>
                        </div>
                      );
                    },
                  )}
                {(!documentAnalytics?.documents.by_source ||
                  Object.keys(documentAnalytics.documents.by_source).length === 0) && (
                  <div className="py-4 text-center text-slate-500">
                    No documents yet
                  </div>
                )}
              </div>
            </div>

            {/* By Status */}
            <div className="bg-slate-900/50 border border-slate-800 rounded-lg p-6">
              <h2 className="text-lg font-semibold text-slate-200 mb-4">
                Documents by Status
              </h2>
              <div className="space-y-3">
                {documentAnalytics?.documents.by_status &&
                  Object.entries(documentAnalytics.documents.by_status).map(
                    ([docStatus, count]) => {
                      const total = documentAnalytics.documents.total || 1;
                      const percentage = (count / total) * 100;
                      const statusColor =
                        docStatus === "indexed"
                          ? "bg-green-500"
                          : docStatus === "processing"
                            ? "bg-yellow-500"
                            : docStatus === "failed"
                              ? "bg-red-500"
                              : "bg-slate-500";
                      return (
                        <div key={docStatus}>
                          <div className="flex items-center justify-between mb-1">
                            <span className="text-sm text-slate-400 capitalize">
                              {docStatus}
                            </span>
                            <span className="text-sm font-medium text-slate-200">
                              {formatNumber(count)} ({percentage.toFixed(1)}%)
                            </span>
                          </div>
                          <div className="h-2 bg-slate-800 rounded-full overflow-hidden">
                            <div
                              className={`h-full ${statusColor} rounded-full`}
                              style={{ width: `${percentage}%` }}
                            />
                          </div>
                        </div>
                      );
                    },
                  )}
                {(!documentAnalytics?.documents.by_status ||
                  Object.keys(documentAnalytics.documents.by_status).length === 0) && (
                  <div className="py-4 text-center text-slate-500">
                    No documents yet
                  </div>
                )}
              </div>
            </div>
          </div>

          {/* Voice Navigation Stats */}
          <div className="bg-slate-900/50 border border-slate-800 rounded-lg p-6">
            <h2 className="text-lg font-semibold text-slate-200 mb-4">
              Voice Navigation
            </h2>
            <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-6">
              <div className="bg-slate-800/50 rounded-lg p-3">
                <div className="text-xs text-slate-400">Total Sessions</div>
                <div className="text-xl font-bold text-blue-400">
                  {formatNumber(documentAnalytics?.voice_navigation.total_sessions || 0)}
                </div>
              </div>
              <div className="bg-slate-800/50 rounded-lg p-3">
                <div className="text-xs text-slate-400">Active Now</div>
                <div className="text-xl font-bold text-green-400">
                  {formatNumber(documentAnalytics?.voice_navigation.active_sessions || 0)}
                </div>
              </div>
              <div className="bg-slate-800/50 rounded-lg p-3">
                <div className="text-xs text-slate-400">Unique Users</div>
                <div className="text-xl font-bold text-purple-400">
                  {formatNumber(documentAnalytics?.voice_navigation.unique_users_in_period || 0)}
                </div>
              </div>
              <div className="bg-slate-800/50 rounded-lg p-3">
                <div className="text-xs text-slate-400">Avg Pages Navigated</div>
                <div className="text-xl font-bold text-yellow-400">
                  {documentAnalytics?.voice_navigation.avg_pages_navigated || 0}
                </div>
              </div>
            </div>

            {/* Popular Documents */}
            {documentAnalytics?.voice_navigation.popular_documents &&
              documentAnalytics.voice_navigation.popular_documents.length > 0 && (
                <div>
                  <h3 className="text-sm font-medium text-slate-300 mb-3">
                    Popular Documents (Voice Navigation)
                  </h3>
                  <div className="space-y-2">
                    {documentAnalytics.voice_navigation.popular_documents.map(
                      (doc, idx) => (
                        <div
                          key={doc.document_id}
                          className="flex items-center justify-between p-3 bg-slate-800/30 rounded-lg"
                        >
                          <div className="flex items-center space-x-3">
                            <span className="text-xs text-slate-500 w-6">
                              #{idx + 1}
                            </span>
                            <span className="text-sm text-slate-300">
                              {doc.title}
                            </span>
                          </div>
                          <span className="text-sm font-medium text-blue-400">
                            {doc.session_count} sessions
                          </span>
                        </div>
                      ),
                    )}
                  </div>
                </div>
              )}
            {(!documentAnalytics?.voice_navigation.popular_documents ||
              documentAnalytics.voice_navigation.popular_documents.length === 0) && (
              <div className="py-4 text-center text-slate-500">
                No voice navigation sessions yet
              </div>
            )}
          </div>

          {/* Document Ownership */}
          <div className="bg-slate-900/50 border border-slate-800 rounded-lg p-6">
            <h2 className="text-lg font-semibold text-slate-200 mb-4">
              Document Ownership
            </h2>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
              <div>
                <div className="flex items-center justify-between mb-2">
                  <span className="text-sm text-slate-400">User Uploaded</span>
                  <span className="text-sm font-medium text-blue-400">
                    {formatNumber(documentAnalytics?.documents.user_uploaded || 0)}
                  </span>
                </div>
                <div className="h-3 bg-slate-800 rounded-full overflow-hidden">
                  <div
                    className="h-full bg-blue-500 rounded-full transition-all duration-500"
                    style={{
                      width: `${documentAnalytics?.documents.total ? (documentAnalytics.documents.user_uploaded / documentAnalytics.documents.total) * 100 : 0}%`,
                    }}
                  />
                </div>
              </div>
              <div>
                <div className="flex items-center justify-between mb-2">
                  <span className="text-sm text-slate-400">Public Documents</span>
                  <span className="text-sm font-medium text-green-400">
                    {formatNumber(documentAnalytics?.documents.public || 0)}
                  </span>
                </div>
                <div className="h-3 bg-slate-800 rounded-full overflow-hidden">
                  <div
                    className="h-full bg-green-500 rounded-full transition-all duration-500"
                    style={{
                      width: `${documentAnalytics?.documents.total ? (documentAnalytics.documents.public / documentAnalytics.documents.total) * 100 : 0}%`,
                    }}
                  />
                </div>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

// Metric Card Component
function MetricCard({
  title,
  value,
  subtitle,
  color,
}: {
  title: string;
  value: string;
  subtitle: string;
  color: "blue" | "green" | "purple" | "red" | "yellow";
}) {
  const colorClasses = {
    blue: "text-blue-400",
    green: "text-green-400",
    purple: "text-purple-400",
    red: "text-red-400",
    yellow: "text-yellow-400",
  };

  return (
    <div className="bg-slate-900/50 border border-slate-800 rounded-lg p-4">
      <div className="text-sm text-slate-400">{title}</div>
      <div className={`text-3xl font-bold ${colorClasses[color]} mt-1`}>
        {value}
      </div>
      <div className="text-xs text-slate-500 mt-1">{subtitle}</div>
    </div>
  );
}
